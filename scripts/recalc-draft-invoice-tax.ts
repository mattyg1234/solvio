/**
 * Recalculate a workspace's draft invoices with its current "Partner prices" setting.
 * Written for MHT on 29 Oct 2026: their prices include IGIC, so a €34.30 ticket is
 * €32.06 + €2.24 IGIC, but drafts made before the setting added €2.40 on top.
 *
 *   npx tsx --env-file=<.env.local> scripts/recalc-draft-invoice-tax.ts --business <id>
 *   npx tsx --env-file=<.env.local> scripts/recalc-draft-invoice-tax.ts --business <id> --apply --backup <file.json>
 *   npx tsx --env-file=<.env.local> scripts/recalc-draft-invoice-tax.ts --restore <file.json>
 *
 * Without --apply it only reads, and prints each draft's totals before and after.
 * Only drafts are touched: not voided, not paid, not in Holded, not sent to Verifactu.
 * A line is rewritten only when the old maths reproduces its saved figures exactly;
 * a draft with any other line is reported and left alone.
 * --apply writes the old figures to --backup first; --restore puts them back.
 */
import { readFileSync, writeFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

import { parseShowOpsConfig } from "../src/lib/show-ops/config";
import { recalcInvoiceLine, sumInvoiceLines } from "../src/lib/show-ops/invoice";

type Line = {
  id: string;
  invoice_id: string;
  line_kind: string | null;
  adults: number | null;
  children: number | null;
  adult_unit_price: number | null;
  child_unit_price: number | null;
  quantity: number | null;
  unit_price: number | null;
  vat_rate: number | null;
  net_total: number | null;
  vat_amount: number | null;
  line_total: number | null;
};
type Invoice = {
  id: string;
  invoice_number: string | null;
  supplier_name: string;
  emailed_at: string | null;
  net_total: number | null;
  vat_total: number | null;
  total_amount: number | null;
};
type Backup = {
  business: string;
  at: string;
  invoices: Array<Pick<Invoice, "id" | "net_total" | "vat_total" | "total_amount">>;
  lines: Array<Pick<Line, "id" | "net_total" | "vat_amount" | "line_total">>;
};

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const value = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (pass --env-file).");
const db = createClient(url, key, { auth: { persistSession: false } });

const cents = (v: unknown) => Math.round(Number(v ?? 0) * 100);
const eur = (v: number) => `€${v.toFixed(2)}`;

function lineMoney(l: Line, pricesIncludeTax: boolean) {
  // The same calls the draft editor makes when a line is saved.
  return l.line_kind === "manual"
    ? recalcInvoiceLine({ quantity: Number(l.quantity ?? 0), unitPrice: Number(l.unit_price ?? 0), vatRate: Number(l.vat_rate ?? 0), pricesIncludeTax })
    : recalcInvoiceLine({
        adults: Number(l.adults ?? 0),
        children: Number(l.children ?? 0),
        adultUnit: Number(l.adult_unit_price ?? 0),
        childUnit: Number(l.child_unit_price ?? 0),
        vatRate: Number(l.vat_rate ?? 0),
        pricesIncludeTax,
      });
}

async function restore(file: string) {
  const backup = JSON.parse(readFileSync(file, "utf8")) as Backup;
  for (const l of backup.lines) {
    const { error } = await db.from("show_invoice_lines").update({ net_total: l.net_total, vat_amount: l.vat_amount, line_total: l.line_total }).eq("id", l.id);
    if (error) throw new Error(`line ${l.id}: ${error.message}`);
  }
  for (const i of backup.invoices) {
    const { error } = await db
      .from("show_invoices")
      .update({ net_total: i.net_total, vat_total: i.vat_total, total_amount: i.total_amount, updated_at: new Date().toISOString() })
      .eq("id", i.id)
      .eq("business_id", backup.business);
    if (error) throw new Error(`invoice ${i.id}: ${error.message}`);
  }
  console.log(`Restored ${backup.invoices.length} invoices and ${backup.lines.length} lines from ${file}.`);
}

async function main() {
  const restoreFile = value("--restore");
  if (restoreFile) return restore(restoreFile);

  const business = value("--business");
  if (!business) throw new Error("Pass --business <id>.");
  const apply = flag("--apply");
  const backupFile = value("--backup");
  if (apply && !backupFile) throw new Error("--apply needs --backup <file.json> for the old figures.");

  const { data: biz, error: bizError } = await db.from("businesses").select("show_ops_config").eq("id", business).single();
  if (bizError) throw new Error(bizError.message);
  const pricesIncludeTax = parseShowOpsConfig(biz.show_ops_config).invoice.pricesIncludeTax;
  console.log(`Partner prices ${pricesIncludeTax ? "include the tax" : "have the tax added on top"}.`);

  const { data: invoices, error: invError } = await db
    .from("show_invoices")
    .select("id,invoice_number,supplier_name,emailed_at,net_total,vat_total,total_amount")
    .eq("business_id", business)
    .eq("status", "draft")
    .eq("voided", false)
    .eq("paid", false)
    .is("holded_document_id", null)
    .or("verifactu_status.is.null,verifactu_status.eq.not_sent")
    .order("created_at");
  if (invError) throw new Error(invError.message);
  const drafts = (invoices ?? []) as Invoice[];

  const lines: Line[] = [];
  for (let i = 0; i < drafts.length; i += 50) {
    const ids = drafts.slice(i, i + 50).map((d) => d.id);
    const { data, error } = await db
      .from("show_invoice_lines")
      .select("id,invoice_id,line_kind,adults,children,adult_unit_price,child_unit_price,quantity,unit_price,vat_rate,net_total,vat_amount,line_total")
      .eq("business_id", business)
      .in("invoice_id", ids);
    if (error) throw new Error(error.message);
    lines.push(...((data ?? []) as Line[]));
  }

  const plan: Array<{ inv: Invoice; lines: Array<{ line: Line; next: ReturnType<typeof lineMoney> }>; totals: ReturnType<typeof sumInvoiceLines> }> = [];
  const skipped: string[] = [];
  let shortLines = 0;
  for (const inv of drafts) {
    const own = lines.filter((l) => l.invoice_id === inv.id);
    if (!own.length) {
      skipped.push(`${inv.invoice_number ?? inv.id} (${inv.supplier_name}): no lines, but its total says ${eur(Number(inv.total_amount ?? 0))}`);
      continue;
    }
    const stale = own.find((l) => {
      const old = lineMoney(l, false);
      const now = lineMoney(l, true);
      const saved = [cents(l.net_total), cents(l.vat_amount), cents(l.line_total)].join();
      // Already on the new maths, or saved exactly by the old maths: both are safe to (re)write.
      return saved !== [cents(old.netTotal), cents(old.vatAmount), cents(old.lineTotal)].join() && saved !== [cents(now.netTotal), cents(now.vatAmount), cents(now.lineTotal)].join();
    });
    if (stale) {
      skipped.push(`${inv.invoice_number ?? inv.id} (${inv.supplier_name}): line ${stale.id} doesn't match either way`);
      continue;
    }
    const next = own.map((line) => ({ line, next: lineMoney(line, pricesIncludeTax) }));
    shortLines += next.filter(({ line, next: m }) => cents(m.lineTotal) !== cents(lineMoney(line, false).netTotal)).length;
    plan.push({ inv, lines: next, totals: sumInvoiceLines(next.map((x) => x.next)) });
  }

  const before = plan.reduce((s, p) => s + cents(p.inv.total_amount), 0) / 100;
  const after = plan.reduce((s, p) => s + cents(p.totals.grandTotal), 0) / 100;
  for (const p of plan) {
    const was = Number(p.inv.total_amount ?? 0);
    if (cents(was) === cents(p.totals.grandTotal) && cents(p.inv.vat_total) === cents(p.totals.vatTotal)) continue;
    console.log(
      `${(p.inv.invoice_number ?? "draft").padEnd(16)} ${p.inv.supplier_name.slice(0, 28).padEnd(28)} ${String(p.lines.length).padStart(3)} lines  ${eur(was).padStart(11)} → ${eur(p.totals.grandTotal).padStart(11)}  (net ${eur(p.totals.netTotal)}, tax ${eur(p.totals.vatTotal)})${p.inv.emailed_at ? "  EMAILED" : ""}`,
    );
  }
  console.log(`\n${plan.length} drafts, ${plan.reduce((s, p) => s + p.lines.length, 0)} lines: ${eur(before)} → ${eur(after)} (${eur(after - before)}).`);
  console.log(`${plan.filter((p) => p.inv.emailed_at).length} of them were emailed to the partner before. ${shortLines} lines land a cent under the price.`);
  if (skipped.length) console.log(`Left alone:\n  ${skipped.join("\n  ")}`);
  if (!apply) return console.log("\nPreview only. Nothing written.");

  const backup: Backup = {
    business,
    at: new Date().toISOString(),
    invoices: plan.map((p) => ({ id: p.inv.id, net_total: p.inv.net_total, vat_total: p.inv.vat_total, total_amount: p.inv.total_amount })),
    lines: plan.flatMap((p) => p.lines.map(({ line }) => ({ id: line.id, net_total: line.net_total, vat_amount: line.vat_amount, line_total: line.line_total }))),
  };
  writeFileSync(backupFile!, JSON.stringify(backup, null, 2));
  console.log(`Old figures saved to ${backupFile}.`);

  for (const p of plan) {
    for (const { line, next } of p.lines) {
      const { error } = await db
        .from("show_invoice_lines")
        .update({ net_total: next.netTotal, vat_amount: next.vatAmount, line_total: next.lineTotal })
        .eq("id", line.id)
        .eq("invoice_id", p.inv.id)
        .eq("business_id", business);
      if (error) throw new Error(`line ${line.id}: ${error.message}`);
    }
    const { error } = await db
      .from("show_invoices")
      .update({ net_total: p.totals.netTotal, vat_total: p.totals.vatTotal, total_amount: p.totals.grandTotal, updated_at: new Date().toISOString() })
      .eq("id", p.inv.id)
      .eq("business_id", business)
      .eq("status", "draft");
    if (error) throw new Error(`invoice ${p.inv.id}: ${error.message}`);
  }
  console.log(`Rewrote ${plan.length} drafts.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
