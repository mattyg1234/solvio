import Link from "next/link";
import { notFound } from "next/navigation";

import {
  markInvoicePaidAction,
  retryVerifactuAction,
  sendShowOpsInvoiceEmailAction,
  voidInvoiceAction,
} from "@/app/dashboard/show-ops/actions";
import { InvoiceEditor } from "@/components/show-ops/invoice-editor";
import { PrintButton } from "@/components/show-ops/print-button";
import { SHOW_OPS_GHOST_BTN, SHOW_OPS_PRIMARY_BTN, ShowOpsPageHeader } from "@/components/show-ops/show-ops-page-header";
import { SubmitOnce } from "@/components/show-ops/submit-once";
import { requireShowOpsPage, roleAtLeast } from "@/lib/show-ops/access";
import { formatShowOpsMoney } from "@/lib/show-ops/calc";
import { hasShowOpsModule } from "@/lib/show-ops/config";
import { invoiceIsLocked } from "@/lib/show-ops/invoice";

export default async function InvoicePrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ emailed?: string; saved?: string; issued?: string; verifactu?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requireShowOpsPage("invoices");
  if (!roleAtLeast(ctx.role, "finance")) notFound();
  if (!hasShowOpsModule(ctx.config, ctx.tier, "invoices")) {
    return <p className="text-sm text-slate-600">Invoices are not enabled for this workspace.</p>;
  }
  const { data: inv } = await ctx.supabase
    .from("show_invoices")
    .select("*")
    .eq("id", id)
    .eq("business_id", ctx.business.id)
    .maybeSingle();
  if (!inv) notFound();
  const invCurrency =
    inv.currency === "gbp" || inv.currency === "usd" || inv.currency === "eur" ? inv.currency : ctx.config.currency;
  const money = (n: number) => formatShowOpsMoney(n, invCurrency);

  const { data: supplier } = inv.supplier_id
    ? await ctx.supabase
        .from("show_suppliers")
        .select("email,tax_id,legal_name,invoice_address")
        .eq("id", inv.supplier_id)
        .eq("business_id", ctx.business.id)
        .maybeSingle()
    : { data: null };

  const { data: lines } = await ctx.supabase
    .from("show_invoice_lines")
    .select("*")
    .eq("invoice_id", id)
    .eq("business_id", ctx.business.id)
    .order("guest_name");

  const bookingIds = [...new Set((lines ?? []).map((l) => l.booking_id).filter(Boolean))];
  const { data: bookings } = bookingIds.length
    ? await ctx.supabase.from("show_bookings").select("id,show_date,no_show_proof_path").eq("business_id", ctx.business.id).in("id", bookingIds)
    : { data: [] as { id: string; show_date: string; no_show_proof_path: string | null }[] };
  const dateByBooking = new Map((bookings ?? []).map((b) => [b.id, b.show_date]));
  const proofByBooking = new Map<string, string>();
  await Promise.all(
    (bookings ?? [])
      .filter((b) => b.no_show_proof_path)
      .map(async (b) => {
        const { data } = await ctx.supabase.storage
          .from("show-ops-proofs")
          .createSignedUrl(b.no_show_proof_path!, 60 * 60);
        if (data?.signedUrl) proofByBooking.set(b.id, data.signedUrl);
      }),
  );

  const today = new Date().toISOString().slice(0, 10);
  const supplierEmail = String(supplier?.email ?? "").trim();
  const locked = invoiceIsLocked({
    status: inv.status,
    paid: inv.paid,
    voided: inv.voided,
    verifactuStatus: inv.verifactu_status,
  });
  const displayNumber = inv.invoice_number || inv.verifactu_number || "Draft";
  const canEmail = inv.status === "issued" && !inv.voided;
  const verifactuLabel =
    inv.verifactu_status === "recorded"
      ? "Recorded with Verifactu"
      : inv.verifactu_status === "manual"
        ? "Local number — add API key later"
        : inv.verifactu_status === "error"
          ? `Verifactu error: ${inv.verifactu_error || "failed"}`
          : "Not sent to Verifactu";

  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <ShowOpsPageHeader
          eyebrow="Operations"
          title={inv.status === "draft" ? "Draft invoice" : `Invoice ${displayNumber}`}
          subtitle={`${inv.supplier_name} · ${inv.period_start} → ${inv.period_end}`}
          actions={
            <>
              <Link href="/dashboard/show-ops/invoices?view=list" className={SHOW_OPS_GHOST_BTN}>
                ← All invoices
              </Link>
              <PrintButton />
              {canEmail ? (
                <a href={`/dashboard/show-ops/invoices/${id}/pdf`} className={SHOW_OPS_GHOST_BTN}>
                  Download PDF
                </a>
              ) : null}
              {!inv.paid && !inv.voided ? (
                <form action={markInvoicePaidAction}>
                  <input type="hidden" name="invoice_id" value={inv.id} />
                  <input type="hidden" name="paid_at" value={today} />
                  <button type="submit" className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white">
                    Mark paid
                  </button>
                </form>
              ) : null}
              {inv.voided ? (
                <span className="rounded-xl bg-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700">Voided</span>
              ) : (
                <form action={voidInvoiceAction}>
                  <input type="hidden" name="invoice_id" value={inv.id} />
                  <button type="submit" className="rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white">
                    Void invoice
                  </button>
                </form>
              )}
            </>
          }
        />
      </div>

      {sp.saved === "1" ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 print:hidden">Draft saved.</p>
      ) : null}
      {sp.issued === "1" ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 print:hidden">
          Issued as {displayNumber}. {verifactuLabel}.
        </p>
      ) : null}
      {sp.emailed === "1" ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 print:hidden">
          Invoice emailed{inv.emailed_to ? ` to ${inv.emailed_to}` : ""}.
        </p>
      ) : null}

      {!locked ? (
        <InvoiceEditor
          invoiceId={inv.id}
          series={inv.series || ctx.config.invoice.series}
          invoiceDate={inv.invoice_date || today}
          paymentTermsDays={inv.payment_terms_days ?? 30}
          notes={inv.notes ?? ""}
          recipientName={inv.recipient_name || supplier?.legal_name || inv.supplier_name}
          recipientTaxId={inv.recipient_tax_id || supplier?.tax_id || ""}
          recipientAddress={inv.recipient_address || supplier?.invoice_address || ""}
          defaultVatRate={ctx.config.invoice.defaultVatRate}
          currency={invCurrency}
          lines={(lines ?? []).map((l) => ({
            id: l.id,
            booking_id: l.booking_id,
            booking_ref: l.booking_ref,
            guest_name: l.guest_name,
            supplier_ticket_number: l.supplier_ticket_number,
            description: l.description || l.guest_name || "Line",
            adults: Number(l.adults || 0),
            children: Number(l.children || 0),
            adult_unit_price: Number(l.adult_unit_price || 0),
            child_unit_price: Number(l.child_unit_price || 0),
            quantity: Number(l.quantity || 0),
            unit_price: Number(l.unit_price || 0),
            vat_rate: Number(l.vat_rate || 0),
            notes: l.notes,
            line_kind: l.line_kind === "manual" ? "manual" : "booking",
          }))}
        />
      ) : !inv.voided ? (
        <div className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200 print:hidden">
          <p className="text-sm text-slate-600">{verifactuLabel}</p>
          {inv.verifactu_status === "error" || inv.verifactu_status === "manual" || inv.verifactu_status === "not_sent" ? (
            <form action={retryVerifactuAction}>
              <input type="hidden" name="invoice_id" value={inv.id} />
              <SubmitOnce className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-800 ring-1 ring-slate-200">
                Retry Verifactu
              </SubmitOnce>
            </form>
          ) : null}
          <form action={sendShowOpsInvoiceEmailAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="invoice_id" value={inv.id} />
            <label className="text-xs font-medium text-slate-600">
              Email invoice to
              <input
                name="to"
                type="email"
                required
                defaultValue={supplierEmail}
                placeholder="accounts@agency.com"
                className="mt-1 block min-w-[16rem] rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              />
            </label>
            {canEmail ? (
              <SubmitOnce className={SHOW_OPS_PRIMARY_BTN}>Email invoice PDF</SubmitOnce>
            ) : (
              <p className="text-sm text-amber-800">Issue the invoice first, then email.</p>
            )}
            {inv.emailed_at && sp.emailed !== "1" ? (
              <p className="text-xs text-slate-500">
                Last sent {new Date(inv.emailed_at).toLocaleString()} {inv.emailed_to ? `to ${inv.emailed_to}` : ""}
              </p>
            ) : null}
          </form>
        </div>
      ) : null}

      <article className="rounded-2xl bg-white p-6 ring-1 ring-slate-200 print:rounded-none print:ring-0">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            {ctx.branding.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={ctx.branding.logoUrl} alt="" className="mb-2 h-12 w-auto object-contain" />
            ) : null}
            <h1 className="text-xl font-semibold" style={{ color: ctx.branding.primaryColor }}>
              {inv.issuer_name || ctx.branding.displayName}
            </h1>
            {inv.issuer_tax_id ? <p className="text-sm text-slate-600">NIF {inv.issuer_tax_id}</p> : null}
            {inv.issuer_address ? <p className="text-sm text-slate-600">{inv.issuer_address}</p> : null}
            <p className="text-sm text-slate-600">{inv.status === "draft" ? "Draft invoice" : "Invoice"}</p>
          </div>
          <div className="text-right text-sm">
            <p className="font-semibold text-slate-900">{inv.recipient_name || inv.supplier_name}</p>
            {inv.recipient_tax_id ? <p className="text-slate-600">NIF {inv.recipient_tax_id}</p> : null}
            {inv.recipient_address ? <p className="text-slate-600">{inv.recipient_address}</p> : null}
            <p className="text-slate-600">
              {inv.period_start} → {inv.period_end}
            </p>
            <p className="text-slate-600">Due {inv.due_date || "—"}</p>
            <p className="text-lg font-semibold text-slate-900">{displayNumber}</p>
            <p className={`mt-1 font-medium ${inv.paid ? "text-emerald-700" : "text-amber-700"}`}>
              {inv.paid ? `PAID ${inv.paid_at || ""}` : "UNPAID"}
            </p>
          </div>
        </header>

        <table className="mt-6 w-full text-left text-sm">
          <thead className="border-b text-xs uppercase text-slate-500">
            <tr>
              <th className="py-2 pr-2">Date</th>
              <th className="py-2 pr-2">Description</th>
              <th className="py-2 pr-2 text-right">Qty</th>
              <th className="py-2 pr-2 text-right">Net</th>
              <th className="py-2 pr-2 text-right">Tax</th>
              <th className="py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {(lines ?? []).map((l) => (
              <tr key={l.id} className="border-b border-slate-100">
                <td className="py-1.5 pr-2">{(l.booking_id && dateByBooking.get(l.booking_id)) || inv.invoice_date || "—"}</td>
                <td className="py-1.5 pr-2">
                  {l.description || l.guest_name}
                  {l.notes ? <span className="mt-0.5 block text-xs text-slate-500">{l.notes}</span> : null}
                  {l.booking_ref ? <span className="mt-0.5 block font-mono text-[11px] text-slate-400">{l.booking_ref}</span> : null}
                </td>
                <td className="py-1.5 pr-2 text-right">{Number(l.quantity || 0)}</td>
                <td className="py-1.5 pr-2 text-right">{money(Number(l.net_total || 0))}</td>
                <td className="py-1.5 pr-2 text-right">{money(Number(l.vat_amount || 0))}</td>
                <td className="py-1.5 text-right font-medium">{money(Number(l.line_total))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-6 space-y-1 text-right text-sm">
          <p className="text-slate-600">Net {money(Number(inv.net_total || inv.total_amount))}</p>
          <p className="text-slate-600">Tax {money(Number(inv.vat_total || 0))}</p>
          <p className="text-lg font-semibold text-slate-900">Total {money(Number(inv.total_amount))}</p>
        </div>
        {inv.notes ? <p className="mt-4 text-sm text-slate-600">{inv.notes}</p> : null}
        {[...proofByBooking.entries()].length ? (
          <div className="mt-6 border-t border-slate-200 pt-4 print:break-inside-avoid">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">No-show ticket photos</p>
            <div className="mt-2 flex flex-wrap gap-3">
              {(lines ?? []).map((l) => {
                const url = l.booking_id ? proofByBooking.get(l.booking_id) : null;
                if (!url) return null;
                return (
                  <a key={l.booking_id} href={url} target="_blank" rel="noreferrer" className="block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`${l.guest_name} ticket photo`} className="h-24 w-auto rounded-lg ring-1 ring-slate-200" />
                    <span className="mt-1 block text-xs text-slate-600">{l.guest_name}</span>
                  </a>
                );
              })}
            </div>
          </div>
        ) : null}
      </article>
    </div>
  );
}
