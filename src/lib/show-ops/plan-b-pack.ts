import type { SupabaseClient } from "@supabase/supabase-js";

import { loadBusListPdf } from "@/lib/show-ops/bus-pdf-data";
import { brandingFromBusiness, parseShowOpsConfig } from "@/lib/show-ops/config";
import { addDaysIso, isoDateInTimeZone } from "@/lib/show-ops/digest";
import { comparePartnerTypeThenSupplier } from "@/lib/show-ops/lists";
import { loadInvoiceDelivery } from "@/lib/show-ops/invoice-delivery";
import { loadNightListPdf } from "@/lib/show-ops/night-list-pdf-data";
import { SHOW_OPS_BACKUP_BUCKET, snapshotTimestamp } from "@/lib/show-ops/backup";

/**
 * Plan B pack: what the office needs if the Hub is unreachable.
 *
 * Twice a day the cron emails the workspace's report addresses the printable
 * night lists (one per island per night, next three nights), the bus lists
 * (tonight and tomorrow) and a spreadsheet of every upcoming booking. Email is
 * the point: it sits in Gmail/Outlook, off Vercel and off Supabase, so it is
 * still there when both are down.
 *
 * Separately, the newest full snapshot (the five-minute backup) can be emailed
 * to SHOW_OPS_OFFSITE_BACKUP_EMAILS, so a copy of the whole database also lives
 * outside the Supabase project it protects.
 */

export const PLAN_B_TZ = "Atlantic/Canary";
/** Nights of printed night lists in each pack: tonight plus the next two. */
export const PLAN_B_NIGHT_LIST_DAYS = 3;
/** Nights of bus lists in each pack: tonight and tomorrow. */
export const PLAN_B_BUS_LIST_DAYS = 2;
/** Resend refuses an email over 40 MB; stay well under it. */
export const PLAN_B_MAX_ATTACHMENT_BYTES = 30 * 1024 * 1024;
/** Invoices issued in the last this-many days go in the pack, as well as every unpaid one. */
export const PLAN_B_INVOICE_DAYS = 30;
/** Most invoice PDFs in one pack, and their combined size, so the email always sends. */
export const PLAN_B_MAX_INVOICES = 60;
export const PLAN_B_MAX_INVOICE_BYTES = 15 * 1024 * 1024;

export const PLAN_B_BUSINESS_SELECT =
  "id,name,show_ops_enabled,show_ops_config,show_ops_display_name,logo_url,show_ops_logo_url";

export type PlanBBusinessRow = {
  id: string;
  name: string;
  show_ops_enabled: boolean;
  show_ops_config: unknown;
  show_ops_display_name: string | null;
  logo_url?: string | null;
  show_ops_logo_url?: string | null;
};

export type PlanBAttachment = { filename: string; content: string };

export type PlanBPack = {
  today: string;
  displayName: string;
  emails: string[];
  subject: string;
  html: string;
  text: string;
  attachments: PlanBAttachment[];
  /** Lists that could not be built; the rest of the pack still goes. */
  errors: string[];
  upcomingBookings: number;
  invoices: number;
};

export type PlanBInvoiceRow = {
  id: string;
  invoice_number: string | null;
  verifactu_number?: string | null;
  invoice_date: string;
  paid: boolean | null;
  total_amount: number | string | null;
  currency: string | null;
  supplier_name?: string | null;
  recipient_name?: string | null;
};

export type PlanBDeps = {
  /** Builds one invoice PDF exactly as the Hub's download does. Swapped in tests. */
  invoicePdf?: (invoiceId: string) => Promise<{ bytes: Uint8Array; filename: string }>;
};

type CsvBooking = Record<string, unknown>;

export const PLAN_B_CSV_COLUMNS = [
  "show_date",
  "island",
  "show_name",
  "booking_ref",
  "guest_name",
  "guest_mobile",
  "guest_email",
  "hotel_name",
  "adults",
  "children",
  "infants",
  "transport_required",
  "pickup_stop_name",
  "pickup_time",
  "supplier_name",
  "supplier_ticket_number",
  "dietary_required",
  "dietary_notes",
  "billing_mode",
  "payment_status",
  "total_cost",
  "balance_remaining",
  "office_comments",
] as const;

/** Who gets the pack: the daily-email list plus the Plan B-only list, deduplicated, case-insensitive. */
export function planBRecipients(config: { office_report_emails: string[]; plan_b_emails?: string[] }): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of [...config.office_report_emails, ...(config.plan_b_emails ?? [])]) {
    const k = e.trim().toLowerCase();
    if (k && !seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}

export function csvCell(v: unknown): string {
  let s = v == null ? "" : String(v);
  // Stop a spreadsheet treating a guest-typed value as a formula.
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The upcoming-bookings spreadsheet. A BOM so Excel opens accents (Spanish hotel names) correctly. */
export function planBBookingsCsv(rows: CsvBooking[]): string {
  const lines = [PLAN_B_CSV_COLUMNS.join(",")];
  for (const row of rows) lines.push(PLAN_B_CSV_COLUMNS.map((c) => csvCell(row[c])).join(","));
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** File-name safe island label: "Gran Canaria" -> "gran-canaria". */
export function islandSlug(island: string): string {
  return island.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "island";
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const PAGE = 1000;

async function upcomingBookings(admin: SupabaseClient, businessId: string, from: string): Promise<CsvBooking[]> {
  const out: CsvBooking[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin
      .from("show_bookings")
      .select(`id,sales_channel,${PLAN_B_CSV_COLUMNS.join(",")}`)
      .eq("business_id", businessId)
      .is("cancelled_at", null)
      .gte("show_date", from)
      .order("show_date", { ascending: true })
      .order("island", { ascending: true })
      .order("guest_name", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`Upcoming bookings: ${error.message}`);
    const rows = (data ?? []) as unknown as CsvBooking[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

/** Issued, non-voided invoices that are unpaid or dated on/after `since`: unpaid first, then newest. */
export async function planBInvoices(admin: SupabaseClient, businessId: string, since: string): Promise<PlanBInvoiceRow[]> {
  const out: PlanBInvoiceRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin
      .from("show_invoices")
      .select("id,invoice_number,verifactu_number,invoice_date,paid,total_amount,currency,supplier_name,recipient_name")
      .eq("business_id", businessId)
      .eq("status", "issued")
      .eq("voided", false)
      .order("invoice_date", { ascending: false })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as PlanBInvoiceRow[];
    out.push(...rows.filter((r) => (r.invoice_number || r.verifactu_number) && (!r.paid || String(r.invoice_date) >= since)));
    if (rows.length < PAGE) break;
  }
  return out.sort((x, y) => Number(Boolean(x.paid)) - Number(Boolean(y.paid)) || String(y.invoice_date).localeCompare(String(x.invoice_date)));
}

function formatMoney(v: number | string | null, currency: string | null): string {
  const symbol = ({ eur: "€", gbp: "£", usd: "$" } as Record<string, string>)[String(currency ?? "eur").toLowerCase()] ?? "";
  return `${symbol}${Number(v ?? 0).toFixed(2)}`;
}

function pdfAttachment(filename: string, bytes: Uint8Array): PlanBAttachment {
  return { filename, content: Buffer.from(bytes).toString("base64") };
}

/**
 * Build one workspace's Plan B pack as of `now`. Reads with the service role;
 * sending is the caller's job. A list that fails is named in `errors` and left
 * out; it never stops the other lists going.
 */
export async function buildPlanBPack(
  admin: SupabaseClient,
  b: PlanBBusinessRow,
  now = new Date(),
  deps: PlanBDeps = {},
): Promise<PlanBPack> {
  const config = parseShowOpsConfig(b.show_ops_config);
  const displayName = brandingFromBusiness(b).displayName;
  const today = isoDateInTimeZone(now, PLAN_B_TZ);
  const lastDay = addDaysIso(today, PLAN_B_NIGHT_LIST_DAYS - 1);
  const errors: string[] = [];
  const attachments: PlanBAttachment[] = [];
  const nightSummary: string[] = [];
  const busSummary: string[] = [];

  const upcoming = await upcomingBookings(admin, b.id, today);

  for (let i = 0; i < PLAN_B_NIGHT_LIST_DAYS; i += 1) {
    const date = addDaysIso(today, i);
    const night = upcoming.filter((r) => r.show_date === date);
    const islands = [...new Set(night.map((r) => String(r.island)))].sort();
    if (!islands.length) nightSummary.push(`${date}: no bookings`);
    for (const island of islands) {
      // Same order as the office list on screen: partner type, then supplier, then surname.
      const ids = night
        .filter((r) => r.island === island)
        .sort((x, y) => comparePartnerTypeThenSupplier(x as never, y as never))
        .map((r) => String(r.id));
      try {
        const bytes = await loadNightListPdf(
          admin,
          { businessId: b.id, businessName: displayName, config, printedBy: "Plan B pack" },
          { date, view: "office", island, showName: null, bookingIds: ids },
        );
        attachments.push(pdfAttachment(`night-list-${date}-${islandSlug(island)}.pdf`, bytes));
        nightSummary.push(`${date} · ${island}: ${ids.length} booking${ids.length === 1 ? "" : "s"}`);
      } catch (e) {
        errors.push(`Night list ${date} ${island}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  for (let i = 0; i < PLAN_B_BUS_LIST_DAYS; i += 1) {
    const date = addDaysIso(today, i);
    const ids = upcoming.filter((r) => r.show_date === date && r.transport_required === true).map((r) => String(r.id));
    if (!ids.length) {
      busSummary.push(`${date}: no bus bookings`);
      continue;
    }
    try {
      const bytes = await loadBusListPdf(admin, b.id, displayName, { date, bookingIds: ids });
      attachments.push(pdfAttachment(`bus-list-${date}.pdf`, bytes));
      busSummary.push(`${date}: ${ids.length} booking${ids.length === 1 ? "" : "s"} on the bus`);
    } catch (e) {
      errors.push(`Bus list ${date}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Invoices: every unpaid one plus anything issued in the last 30 days, as the same PDF the Hub downloads,
  // so a lost Hub (or Holded) never means re-typing an invoice. Unpaid first, newest first.
  const invoicePdf = deps.invoicePdf ?? (async (id: string) => {
    const d = await loadInvoiceDelivery(admin, b.id, id, { includeEvidence: false });
    return { bytes: d.bytes, filename: d.filename };
  });
  const invoiceSummary: string[] = [];
  let invoiceCount = 0;
  try {
    const invoices = await planBInvoices(admin, b.id, addDaysIso(today, -PLAN_B_INVOICE_DAYS));
    let bytesSoFar = 0;
    for (const inv of invoices) {
      const label = `${inv.invoice_number || inv.verifactu_number} ${inv.supplier_name || inv.recipient_name || ""}`.trim();
      if (invoiceCount >= PLAN_B_MAX_INVOICES || bytesSoFar >= PLAN_B_MAX_INVOICE_BYTES) {
        errors.push(`Invoice ${label}: left out to keep the email under the size limit (download it from the Hub)`);
        continue;
      }
      try {
        const pdf = await invoicePdf(inv.id);
        bytesSoFar += pdf.bytes.byteLength;
        attachments.push(pdfAttachment(pdf.filename, pdf.bytes));
        invoiceCount += 1;
        invoiceSummary.push(`${label}, ${inv.invoice_date}, ${formatMoney(inv.total_amount, inv.currency)}, ${inv.paid ? "paid" : "UNPAID"}`);
      } catch (e) {
        errors.push(`Invoice ${label}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } catch (e) {
    errors.push(`Invoices: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!invoiceSummary.length) invoiceSummary.push("No unpaid or recent invoices");

  attachments.push({
    filename: `upcoming-bookings-from-${today}.csv`,
    content: Buffer.from(planBBookingsCsv(upcoming), "utf8").toString("base64"),
  });

  const subject = `${displayName} Plan B pack, ${today}`;
  const text = [
    `Plan B pack for ${displayName}, made ${now.toISOString().slice(0, 16).replace("T", " ")} UTC.`,
    "",
    "Keep this email. If the Hub is down, print the attached lists and work from them.",
    "",
    `Night lists (${today} to ${lastDay}):`,
    ...nightSummary.map((s) => `  ${s}`),
    "",
    "Bus lists:",
    ...busSummary.map((s) => `  ${s}`),
    "",
    `Spreadsheet: every upcoming booking from ${today} (${upcoming.length}), opens in Excel or Google Sheets.`,
    "",
    `Invoices (every unpaid one, plus all issued in the last ${PLAN_B_INVOICE_DAYS} days):`,
    ...invoiceSummary.map((s) => `  ${s}`),
    ...(errors.length ? ["", "Not included this time:", ...errors.map((e) => `  ${e}`)] : []),
    "",
    "Bookings taken after this email are not in it. Write them on paper or the spreadsheet and add them to the Hub when it is back.",
  ].join("\n");
  const li = (items: string[]) => items.map((s) => `<li>${escapeHtml(s)}</li>`).join("");
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#111">
<p><strong>Plan B pack for ${escapeHtml(displayName)}</strong>, made ${escapeHtml(now.toISOString().slice(0, 16).replace("T", " "))} UTC.</p>
<p><strong>Keep this email.</strong> If the Hub is down, print the attached lists and work from them.</p>
<p><strong>Night lists</strong> (${escapeHtml(today)} to ${escapeHtml(lastDay)})</p><ul>${li(nightSummary)}</ul>
<p><strong>Bus lists</strong></p><ul>${li(busSummary)}</ul>
<p><strong>Spreadsheet:</strong> every upcoming booking from ${escapeHtml(today)} (${upcoming.length}), opens in Excel or Google Sheets.</p>
<p><strong>Invoices</strong> (every unpaid one, plus all issued in the last ${PLAN_B_INVOICE_DAYS} days)</p><ul>${li(invoiceSummary)}</ul>
${errors.length ? `<p style="color:#b45309"><strong>Not included this time</strong></p><ul style="color:#b45309">${li(errors)}</ul>` : ""}
<p style="color:#444">Bookings taken after this email are not in it. Write them on paper or the spreadsheet and add them to the Hub when it is back.</p>
</div>`;

  return {
    today,
    displayName,
    emails: planBRecipients(config),
    subject,
    html,
    text,
    attachments,
    errors,
    upcomingBookings: upcoming.length,
    invoices: invoiceCount,
  };
}

/** Addresses that get the full off-site snapshot, from SHOW_OPS_OFFSITE_BACKUP_EMAILS (comma separated). */
export function offsiteBackupEmails(env: string | undefined = process.env.SHOW_OPS_OFFSITE_BACKUP_EMAILS): string[] {
  return (env ?? "")
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s));
}

/** Newest timestamped snapshot for a workspace in the backup bucket, or null. */
export async function newestSnapshot(
  admin: SupabaseClient,
  businessId: string,
): Promise<{ name: string; bytes: Buffer } | null> {
  const { data, error } = await admin.storage
    .from(SHOW_OPS_BACKUP_BUCKET)
    .list(businessId, { limit: 20, sortBy: { column: "name", order: "desc" } });
  if (error) throw new Error(`Backup listing: ${error.message}`);
  const latest = (data ?? []).find((o) => snapshotTimestamp(o.name));
  if (!latest) return null;
  const { data: blob, error: dlErr } = await admin.storage.from(SHOW_OPS_BACKUP_BUCKET).download(`${businessId}/${latest.name}`);
  if (dlErr || !blob) throw new Error(`Backup download: ${dlErr?.message ?? "empty"}`);
  return { name: latest.name, bytes: Buffer.from(await blob.arrayBuffer()) };
}
