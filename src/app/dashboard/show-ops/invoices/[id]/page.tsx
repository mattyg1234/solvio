import Link from "next/link";
import { notFound } from "next/navigation";

import {
  markInvoicePaidAction,
  retryVerifactuAction,
  sendShowOpsInvoiceEmailAction,
  voidInvoiceAction,
} from "@/app/dashboard/show-ops/actions";
import { pushInvoiceToHoldedAction, reconcileHoldedCreditNoteAction, reconcileHoldedInvoiceAction, refreshHoldedInvoiceAction, replaceHoldedDraftAction, requestHoldedCreditNoteAction } from "@/app/dashboard/show-ops/actions-holded";
import { InvoiceEditor } from "@/components/show-ops/invoice-editor";
import { PrintButton } from "@/components/show-ops/print-button";
import { SHOW_OPS_GHOST_BTN, SHOW_OPS_PRIMARY_BTN, ShowOpsPageHeader } from "@/components/show-ops/show-ops-page-header";
import { SubmitOnce } from "@/components/show-ops/submit-once";
import { requireShowOpsPage, roleAtLeast } from "@/lib/show-ops/access";
import { formatShowOpsMoney } from "@/lib/show-ops/calc";
import { hasShowOpsModule } from "@/lib/show-ops/config";
import { loadInvoiceDelivery } from "@/lib/show-ops/invoice-delivery";
import { invoiceIsLocked } from "@/lib/show-ops/invoice";
import { loadHoldedConnection } from "@/lib/show-ops/holded-connection";
import { holdedInvoiceUrl, holdedInvoiceView } from "@/lib/show-ops/holded";
import { holdedReadiness, type PartnerBilling } from "@/lib/show-ops/partner-billing";

// Holded errors fixed on the partner (its Holded contact, NIF or invoicing details), not on the invoice.
const PARTNER_FIX = /contacts that could be|Holded has NIF|is missing:|refused the update to/;

// "Issue and send to Holded" runs the Holded write in the same request.
export const maxDuration = 60;

export default async function InvoicePrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ emailed?: string; saved?: string; issued?: string; verifactu?: string; holded?: string; holded_msg?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requireShowOpsPage("invoices");
  if (!roleAtLeast(ctx.role, "finance")) notFound();
  if (!hasShowOpsModule(ctx.config, ctx.tier, "invoices")) {
    return <p className="text-sm text-slate-600">Invoices are not enabled for this workspace.</p>;
  }
  let { data: inv } = await ctx.supabase
    .from("show_invoices")
    .select("*")
    .eq("id", id)
    .eq("business_id", ctx.business.id)
    .maybeSingle();
  if (!inv) notFound();
  let delivery: Awaited<ReturnType<typeof loadInvoiceDelivery>> | null = null;
  let deliveryError = "";
  if (inv.status === "issued" && !inv.voided) {
    try { delivery = await loadInvoiceDelivery(ctx.supabase, ctx.business.id, id); inv = delivery.invoice; }
    catch (error) { deliveryError = error instanceof Error ? error.message : "Could not prepare ticket photos. Refresh before sending."; }
  }

  const invCurrency =
    inv.currency === "gbp" || inv.currency === "usd" || inv.currency === "eur" ? inv.currency : ctx.config.currency;
  const money = (n: number) => formatShowOpsMoney(n, invCurrency);

  const { data: supplier } = inv.supplier_id
    ? await ctx.supabase
        .from("show_suppliers")
        .select("name,email,tax_id,legal_name,invoice_address,invoice_postal_code,invoice_city,invoice_province,invoice_country_code,is_person")
        .eq("id", inv.supplier_id)
        .eq("business_id", ctx.business.id)
        .maybeSingle()
    : { data: null };

  const { data: lines } = delivery ? { data: delivery.lines } : await ctx.supabase
    .from("show_invoice_lines")
    .select("*")
    .eq("invoice_id", id)
    .eq("business_id", ctx.business.id)
    .order("guest_name");

  const bookingIds = [...new Set((lines ?? []).map((l) => l.booking_id).filter(Boolean))];
  const { data: bookings } = delivery
    ? { data: delivery.lines.filter((line) => line.booking_id).map((line) => ({ id: line.booking_id, show_date: line.show_date })) }
    : bookingIds.length
    ? await ctx.supabase.from("show_bookings").select("id,show_date,no_show_proof_path").eq("business_id", ctx.business.id).in("id", bookingIds)
    : { data: [] as { id: string; show_date: string; no_show_proof_path: string | null }[] };
  const dateByBooking = new Map((bookings ?? []).map((b) => [b.id, b.show_date]));
  const proofByBooking = new Map<string, string>();
  if (delivery) {
    for (const photo of delivery.evidence.photos) {
      const { data, error } = await ctx.supabase.storage.from("show-ops-proofs").createSignedUrl(photo.path, 60 * 60);
      if (error || !data?.signedUrl) deliveryError = "A ticket photo preview could not be opened. Refresh before sending.";
      else proofByBooking.set(photo.bookingId, data.signedUrl);
    }
  }

  const holded = await loadHoldedConnection(ctx);
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
  const holdedView = holdedInvoiceView(inv, holded.connected);
  const stage = invoiceStage(inv, today);
  const holdedLabel = holdedView.label;
  const partnerHref = inv.supplier_id ? `/dashboard/show-ops/master?tab=partners&open=${inv.supplier_id}` : "/dashboard/show-ops/master?tab=partners";
  // What Holded still needs before this can go as a full invoice (same check the send runs).
  const holdedMissing =
    holded.connected && (holdedView.canSend || inv.status === "draft") && inv.supplier_id
      ? holdedReadiness(
          supplier
            ? { ...(supplier as PartnerBilling), name: String(supplier.name ?? inv.supplier_name), tax_id: supplier.tax_id || inv.recipient_tax_id }
            : null,
        )
      : [];
  const { data: holdedEvents } = inv.holded_document_id || inv.holded_status !== "not_sent"
    ? await ctx.supabase
        .from("show_invoice_external_events")
        .select("action,outcome,safe_message,created_at")
        .eq("business_id", ctx.business.id)
        .eq("invoice_id", inv.id)
        .order("created_at", { ascending: false })
        .limit(6)
    : { data: [] as Array<{ action: string; outcome: string; safe_message: string | null; created_at: string }> };
  const verifactuLabel =
    inv.holded_doc_number
      ? `Legal number ${inv.holded_doc_number} issued by Holded (Verifactu)`
      : inv.verifactu_status === "recorded"
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
          eyebrow="Invoicing"
          title={inv.status === "draft" ? "Draft invoice" : `Invoice ${inv.holded_doc_number || displayNumber}`}
          subtitle={
            <span className="inline-flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${stage.tone}`}>
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {stage.label}
              </span>
              <span>
                {inv.recipient_name || inv.supplier_name} · {money(Number(inv.total_amount || 0))} · due {dmy(inv.due_date)}
              </span>
            </span>
          }
          actions={
            <>
              <Link href="/dashboard/show-ops/invoices?view=list" className={SHOW_OPS_GHOST_BTN}>
                ← All invoices
              </Link>
              {inv.holded_document_id ? (
                <a href={holdedInvoiceUrl(inv.holded_document_id)} target="_blank" rel="noreferrer" className={SHOW_OPS_GHOST_BTN}>
                  Open in Holded ↗
                </a>
              ) : null}
              <PrintButton />
              {canEmail ? (
                <a href={`/dashboard/show-ops/invoices/${id}/pdf`} className={SHOW_OPS_GHOST_BTN}>
                  Download PDF
                </a>
              ) : null}
              {!inv.paid && !inv.voided && inv.status !== "draft" ? (
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
                  <button type="submit" className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50">
                    {inv.status === "draft" ? "Delete draft" : "Void"}
                  </button>
                </form>
              )}
            </>
          }
        />
        <ol className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {stage.steps.map((st, i) => (
            <li
              key={st.label}
              className={`rounded-xl px-3 py-2 text-xs ring-1 ${st.state === "done" ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : st.state === "now" ? "bg-[var(--show-ops-primary,#7c3aed)]/10 text-[var(--show-ops-primary,#7c3aed)] ring-[var(--show-ops-primary,#7c3aed)]/30" : "bg-white text-slate-400 ring-slate-200"}`}
            >
              <span className="font-semibold">{st.state === "done" ? "✓" : i + 1}. {st.label}</span>
              <span className="block opacity-80">{st.note}</span>
            </li>
          ))}
        </ol>
      </div>

      {sp.saved === "1" ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 print:hidden">Draft saved.</p>
      ) : null}
      {sp.issued === "1" ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 print:hidden">
          Issued as {displayNumber}. {verifactuLabel}.
        </p>
      ) : null}
      {sp.holded === "sent" ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 print:hidden">
          Sent to Holded as a draft. {holdedLabel}.
        </p>
      ) : sp.holded === "refreshed" ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 print:hidden">Updated from Holded. {holdedLabel}.</p>
      ) : sp.holded === "replaced" ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 print:hidden">Holded draft replaced with Solvio&apos;s lines. {holdedLabel}.</p>
      ) : sp.holded === "credit_sent" ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 print:hidden">
          Credit note drafted in Holded. The accountant links it to the invoice and approves it there.
        </p>
      ) : sp.holded === "not_found" ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 print:hidden">
          Holded has no document for this pack. It is safe to send again.
        </p>
      ) : sp.holded === "reconcile" ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 print:hidden">
          Holded did not confirm the write. Nothing was duplicated. Use Reconcile to find out what happened.
          {sp.holded_msg ? ` ${sp.holded_msg}` : ""}
        </p>
      ) : sp.holded === "error" ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 print:hidden">
          {sp.holded_msg || holdedLabel}
          {inv.supplier_id && PARTNER_FIX.test(sp.holded_msg ?? "") ? (
            <>
              {" "}
              <Link href={partnerHref} className="font-semibold underline">
                Open {inv.supplier_name}
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
      {sp.emailed === "1" ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 print:hidden">
          Invoice emailed{inv.emailed_to ? ` to ${inv.emailed_to}` : ""}.
        </p>
      ) : null}
      {delivery?.logoWarning ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 print:hidden">
          The PDF will go out without your logo: {delivery.logoWarning}{" "}
          <Link href="/dashboard/show-ops/settings" className="font-semibold underline">Open settings</Link>
        </p>
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] print:block">
      <div className="min-w-0 space-y-4 lg:order-1">
      {!locked ? (
        <InvoiceEditor
          holdedConnected={holded.connected}
          holdedBlocked={holdedMissing.length > 0}
          invoiceId={inv.id}
          series={inv.series || ctx.config.invoice.series}
          invoiceDate={inv.invoice_date || today}
          paymentTermsDays={inv.payment_terms_days ?? 30}
          notes={inv.notes ?? ""}
          recipientName={inv.recipient_name || supplier?.legal_name || inv.supplier_name}
          recipientTaxId={inv.recipient_tax_id || supplier?.tax_id || ""}
          recipientAddress={inv.recipient_address || supplier?.invoice_address || ""}
          defaultVatRate={ctx.config.invoice.defaultVatRate}
          pricesIncludeTax={ctx.config.invoice.pricesIncludeTax}
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
      ) : null}

      <article className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8 print:rounded-none print:p-0 print:shadow-none print:ring-0">
        <header className="flex flex-wrap items-start justify-between gap-6">
          <div>
            {ctx.branding.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={ctx.branding.logoUrl} alt="" className="mb-3 h-12 w-auto object-contain" />
            ) : null}
            <p className="font-semibold text-slate-900">{inv.issuer_name || ctx.branding.displayName}</p>
            {inv.issuer_tax_id ? <p className="text-sm text-slate-600">NIF {inv.issuer_tax_id}</p> : null}
            {inv.issuer_address ? <p className="text-sm text-slate-600">{inv.issuer_address}</p> : null}
          </div>
          <div className="text-right">
            <h1 className="text-2xl font-semibold tracking-tight" style={{ color: ctx.branding.primaryColor }}>
              {inv.status === "draft" ? "Draft invoice" : "Invoice"}
            </h1>
            <p className="mt-1 text-lg font-semibold text-slate-900">{inv.holded_doc_number || displayNumber}</p>
            {inv.holded_doc_number && inv.invoice_number ? <p className="text-xs text-slate-500">Hub {inv.invoice_number}</p> : null}
          </div>
        </header>

        <div className="mt-6 grid gap-4 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-[1fr_auto] print:bg-white print:ring-1 print:ring-slate-200">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bill to</p>
            <p className="mt-1 font-semibold text-slate-900">{inv.recipient_name || inv.supplier_name}</p>
            {inv.recipient_tax_id ? <p className="text-slate-600">NIF {inv.recipient_tax_id}</p> : null}
            {inv.recipient_address ? <p className="text-slate-600">{inv.recipient_address}</p> : null}
          </div>
          <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 text-slate-600 sm:text-right">
            <dt>Date</dt><dd className="font-medium text-slate-900">{dmy(inv.invoice_date)}</dd>
            <dt>Due</dt><dd className="font-medium text-slate-900">{dmy(inv.due_date)}</dd>
            <dt>Shows</dt><dd className="font-medium text-slate-900">{dmy(inv.period_start)} → {dmy(inv.period_end)}</dd>
            <dt>Status</dt>
            <dd className={`font-semibold ${inv.paid ? "text-emerald-700" : "text-amber-700"}`}>{inv.paid ? `Paid ${dmy(inv.paid_at)}` : "Unpaid"}</dd>
          </dl>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-slate-200 text-xs font-semibold text-slate-500">
              <tr>
                <th className="py-2 pr-3">Concept</th>
                <th className="py-2 pr-3 text-right">Units</th>
                <th className="py-2 pr-3 text-right">Net</th>
                <th className="py-2 pr-3 text-right">{ctx.config.invoice.taxLabel}</th>
                <th className="py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {(lines ?? []).map((l) => {
                const booking = Boolean(l.booking_id || l.booking_ref);
                const showDate = (l.booking_id && dateByBooking.get(l.booking_id)) || null;
                const concept = booking && inv.island ? `MHT ${inv.island}` : l.description || l.guest_name || "Line";
                const detail = booking
                  ? [l.guest_name || l.description, l.booking_ref, l.supplier_ticket_number].filter(Boolean).join(" ")
                  : null;
                const pax = `${Number(l.adults || 0)}${Number(l.children || 0) ? `+${Number(l.children)}` : ""} pax`;
                return (
                  <tr key={l.id} className="border-b border-slate-100 align-top">
                    <td className="py-2 pr-3">
                      <span className="font-medium text-slate-900">{concept}</span>
                      {detail ? <span className="block text-xs text-slate-600">{detail}</span> : null}
                      {showDate || l.notes ? (
                        <span className="block text-[11px] text-slate-400">{[showDate ? `Show ${dmy(showDate)}` : null, l.notes].filter(Boolean).join(" · ")}</span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 text-right whitespace-nowrap">{booking ? pax : Number(l.quantity || 0)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{money(Number(l.net_total || 0))}</td>
                    <td className="py-2 pr-3 text-right whitespace-nowrap text-slate-600">{Number(l.vat_rate || 0)}%</td>
                    <td className="py-2 text-right font-medium tabular-nums">{money(Number(l.line_total))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-6 ml-auto w-full max-w-xs space-y-1 text-sm">
          <p className="flex justify-between text-slate-600"><span>Subtotal</span><span className="tabular-nums">{money(Number(inv.net_total || inv.total_amount))}</span></p>
          <p className="flex justify-between text-slate-600"><span>{ctx.config.invoice.taxLabel}</span><span className="tabular-nums">{money(Number(inv.vat_total || 0))}</span></p>
          <p className="flex justify-between border-t border-slate-200 pt-2 text-lg font-semibold text-slate-900">
            <span>Total</span><span className="tabular-nums">{money(Number(inv.total_amount))}</span>
          </p>
        </div>
        {inv.notes ? <p className="mt-4 text-sm text-slate-600">{inv.notes}</p> : null}
        {delivery ? (
          <section id="invoice-ticket-photos" className="mt-6 border-t border-slate-200 pt-4 print:break-inside-avoid">
            <h2 className="text-sm font-semibold">Ticket attachments for {inv.supplier_name}</h2>
            <p className="mt-1 text-sm text-slate-600">{delivery.evidence.photos.length} photo(s) attached · {delivery.evidence.missing.length} booking(s) without a photo.</p>
            <div className="mt-3 flex flex-wrap gap-4">
              {delivery.evidence.photos.map((photo) => {
                const url = proofByBooking.get(photo.bookingId);
                return (
                  <div key={photo.bookingId} className="max-w-60 text-sm">
                    {url ? <a href={url} target="_blank" rel="noreferrer" className="block text-violet-700 underline">
                      {photo.mimeType === "image/heic" || photo.mimeType === "image/heif" ? "Open original HEIC/HEIF ticket photo" : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={url} alt={`${photo.bookingRef} ${photo.guestName} ticket photo`} className="h-28 w-auto rounded-lg ring-1 ring-slate-200" />
                      )}
                    </a> : <p className="text-rose-700">Photo preview unavailable; sending is blocked.</p>}
                    <p className="mt-1 font-medium">{photo.bookingRef} · {photo.guestName}</p>
                    <p className="break-all text-xs text-slate-500">{photo.filename}</p>
                  </div>
                );
              })}
            </div>
            {delivery.evidence.missing.length ? (
              <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                <p className="font-medium">Bookings without ticket photos</p>
                <ul className="mt-1 space-y-1">
                  {delivery.evidence.missing.map((booking) => <li key={booking.id}>
                    <Link href={`/dashboard/show-ops/bookings/${booking.id}`} className="underline">{booking.booking_ref} · {booking.guest_name}</Link>
                  </li>)}
                </ul>
              </div>
            ) : null}
          </section>
        ) : null}
      </article>
      </div>
      <aside className="space-y-4 lg:sticky lg:top-4 lg:order-2 print:hidden">
        {locked && !inv.voided ? (
        <div className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200 print:hidden">
          <p className="text-sm text-slate-600">{verifactuLabel}</p>
          <div className="space-y-2 rounded-xl bg-slate-50 p-3">
            <div className="flex flex-wrap items-center gap-3">
              <p className={`text-sm ${holdedView.tone === "bad" ? "text-rose-800" : holdedView.tone === "warn" ? "text-amber-900" : holdedView.tone === "ok" ? "text-emerald-800" : "text-slate-700"}`}>
                <span className="font-medium">Holded:</span> {holdedLabel}
                {inv.holded_synced_at ? (
                  <span className="text-xs text-slate-500"> · synced {new Date(inv.holded_synced_at).toLocaleString()}</span>
                ) : null}
              </p>
              {holdedView.canSend && !holdedMissing.length ? (
                <form action={pushInvoiceToHoldedAction}>
                  <input type="hidden" name="invoice_id" value={inv.id} />
                  <SubmitOnce className={SHOW_OPS_PRIMARY_BTN}>Send to Holded</SubmitOnce>
                </form>
              ) : null}
              {holdedView.canRefresh ? (
                <form action={refreshHoldedInvoiceAction}>
                  <input type="hidden" name="invoice_id" value={inv.id} />
                  <SubmitOnce className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-800 ring-1 ring-slate-200">
                    Refresh from Holded
                  </SubmitOnce>
                </form>
              ) : null}
              {holdedView.canReconcile ? (
                <form action={reconcileHoldedInvoiceAction}>
                  <input type="hidden" name="invoice_id" value={inv.id} />
                  <SubmitOnce className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white">
                    Reconcile with Holded
                  </SubmitOnce>
                </form>
              ) : null}
              {holdedMissing.length ? (
                <div className="w-full rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
                  <p className="font-semibold">To send to Holded, {inv.supplier_name} needs:</p>
                  <ul className="mt-1 list-disc pl-5">
                    {holdedMissing.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                  <Link href={partnerHref} className="mt-1 inline-block font-semibold underline">
                    Edit partner
                  </Link>
                </div>
              ) : null}
              {!holded.connected && !inv.holded_document_id ? (
                <Link href="/dashboard/show-ops/settings#holded" className="text-sm font-semibold text-violet-700 underline">
                  Connect Holded in Settings
                </Link>
              ) : null}
            </div>
            {inv.holded_expected_total != null && inv.holded_actual_total != null && inv.holded_amounts_match === false ? (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-xs text-rose-800">
                  Solvio total {money(Number(inv.holded_expected_total))} · Holded total {money(Number(inv.holded_actual_total))}.{" "}
                  {inv.holded_status === "draft" ? "Replace the draft with Solvio's lines, or fix it in Holded and Refresh." : "Fix it in Holded, then Refresh."}
                </p>
                {inv.holded_status === "draft" && holded.connected ? (
                  <form action={replaceHoldedDraftAction}>
                    <input type="hidden" name="invoice_id" value={inv.id} />
                    <SubmitOnce className="rounded-xl bg-rose-700 px-3 py-1.5 text-sm font-semibold text-white">Replace the Holded draft</SubmitOnce>
                  </form>
                ) : null}
              </div>
            ) : null}
            {["approved", "paid", "corrected"].includes(String(inv.holded_status)) && holded.connected ? (
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-sm font-medium">Correction after approval</p>
                {inv.holded_credit_status === "creating" || inv.holded_credit_status === "unknown" ? (
                  <div className="mt-1 flex flex-wrap items-center gap-3">
                    <p className="text-sm text-amber-900">
                      {inv.holded_credit_status === "unknown" ? "Holded did not confirm the credit note. Reconcile before trying again." : "Credit note being created…"}
                    </p>
                    {inv.holded_credit_claim_token ? (
                      <form action={reconcileHoldedCreditNoteAction}>
                        <input type="hidden" name="invoice_id" value={inv.id} />
                        <SubmitOnce className="rounded-xl bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white">Reconcile credit note</SubmitOnce>
                      </form>
                    ) : null}
                  </div>
                ) : inv.holded_credit_status === "draft" || inv.holded_credit_status === "approved" ? (
                  <p className="mt-1 text-sm text-slate-700">
                    Credit note {inv.holded_credit_note_number || "(draft)"} for {money(Number(inv.holded_credit_amount || 0))} net · {inv.holded_credit_reason}
                    {inv.holded_credit_status === "draft" ? " · waiting for approval in Holded" : ""}
                  </p>
                ) : (
                  <form action={requestHoldedCreditNoteAction} className="mt-2 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="invoice_id" value={inv.id} />
                    <label className="text-xs font-medium text-slate-600">
                      Net amount to credit
                      <input name="credit_amount" type="number" step="0.01" min="0.01" max={Number(inv.net_total || inv.total_amount)} required className="mt-1 block w-32 rounded-lg border px-2 py-1.5 text-sm" />
                    </label>
                    <label className="w-full text-xs font-medium text-slate-600">
                      Reason (printed on the credit note)
                      <input name="credit_reason" required maxLength={200} placeholder="2 no-shows on 12 Sept not chargeable" className="mt-1 block w-full rounded-lg border px-2 py-1.5 text-sm" />
                    </label>
                    <SubmitOnce className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate-800 ring-1 ring-slate-200">Draft credit note in Holded</SubmitOnce>
                    {inv.holded_credit_status === "failed" ? <p className="w-full text-xs text-rose-700">Last attempt failed. Try again or raise it in Holded.</p> : null}
                  </form>
                )}
              </div>
            ) : null}
            {holdedEvents?.length ? (
              <details className="text-xs text-slate-600">
                <summary className="cursor-pointer font-medium">Holded history</summary>
                <ul className="mt-1 space-y-0.5">
                  {holdedEvents.map((e, i) => (
                    <li key={i}>
                      {new Date(e.created_at).toLocaleString()} · {e.action.replace(/_/g, " ")} → {e.outcome.replace(/_/g, " ")}
                      {e.safe_message ? ` · ${e.safe_message}` : ""}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
          {!inv.holded_document_id && (inv.verifactu_status === "error" || inv.verifactu_status === "manual" || inv.verifactu_status === "not_sent") ? (
            <form action={retryVerifactuAction}>
              <input type="hidden" name="invoice_id" value={inv.id} />
              <SubmitOnce className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-800 ring-1 ring-slate-200">
                Retry Verifactu
              </SubmitOnce>
            </form>
          ) : null}
          <form action={sendShowOpsInvoiceEmailAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="invoice_id" value={inv.id} />
            {deliveryError ? <p className="w-full rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{deliveryError}</p> : null}
            {delivery && !deliveryError ? (
              <div className="w-full space-y-2 rounded-xl bg-slate-50 p-3 text-sm">
                <input type="hidden" name="evidence_fingerprint" value={delivery.evidenceFingerprint} />
                <p className="font-medium">Email includes the invoice PDF and {delivery.evidence.photos.length} original ticket photo(s).</p>
                <a href="#invoice-ticket-photos" className="text-violet-700 underline">Review ticket photos and missing bookings</a>
                <label className="flex items-start gap-2">
                  <input type="checkbox" name="attachments_reviewed" value="1" required className="mt-1" />
                  I checked this invoice and its ticket attachments for this seller.
                </label>
                {delivery.evidence.missing.length ? (
                  <label className="flex items-start gap-2 text-amber-900">
                    <input type="checkbox" name="missing_photos_acknowledged" value="1" required className="mt-1" />
                    Send with {delivery.evidence.missing.length} booking(s) without a ticket photo, as listed below.
                  </label>
                ) : null}
              </div>
            ) : null}
            <label className="w-full text-xs font-medium text-slate-600">
              Email invoice to
              <input
                name="to"
                type="email"
                required
                defaultValue={supplierEmail}
                placeholder="accounts@agency.com"
                className="mt-1 block w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              />
            </label>
            {canEmail && delivery && !deliveryError ? (
              <SubmitOnce className={SHOW_OPS_PRIMARY_BTN}>Email invoice and ticket photos</SubmitOnce>
            ) : (
              <p className="text-sm text-amber-800">{canEmail ? "Resolve the attachment preview before sending." : "Issue the invoice first, then email."}</p>
            )}
            {inv.emailed_at && sp.emailed !== "1" ? (
              <p className="text-xs text-slate-500">
                Last sent {new Date(inv.emailed_at).toLocaleString()} {inv.emailed_to ? `to ${inv.emailed_to}` : ""}
              </p>
            ) : null}
          </form>
        </div>
        ) : null}
        {!locked && holdedMissing.length ? (
          <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
            <p className="font-semibold">Before this can go to Holded, {inv.supplier_name} needs:</p>
            <ul className="mt-1 list-disc pl-5">
              {holdedMissing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
            <Link href={partnerHref} className="mt-2 inline-block font-semibold underline">
              Edit partner
            </Link>
          </div>
        ) : null}
        {!locked ? (
          <div className="rounded-2xl bg-white p-4 text-sm text-slate-600 ring-1 ring-slate-200">
            <p className="font-semibold text-slate-900">How this invoice reaches Holded</p>
            <p className="mt-1">
              Check the lines and prices, then press <span className="font-semibold">Issue and send to Holded</span>. It goes to Holded as a
              draft on {inv.supplier_name}&apos;s contact with the same lines, IGIC and #{holdedTagFor(inv.island)} tag.
              Approving it in Holded gives the legal number and sends it to Verifactu; Sync brings the number and payment back here.
            </p>
          </div>
        ) : null}
        <div className="rounded-2xl bg-white p-4 text-sm ring-1 ring-slate-200">
          <p className="font-semibold text-slate-900">Details</p>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-slate-600">
            <dt>Client</dt><dd className="text-right text-slate-900">{inv.recipient_name || inv.supplier_name}</dd>
            <dt>NIF</dt><dd className="text-right">{inv.recipient_tax_id || supplier?.tax_id || "—"}</dd>
            <dt>Issue date</dt><dd className="text-right">{dmy(inv.invoice_date)}</dd>
            <dt>Due date</dt><dd className="text-right">{dmy(inv.due_date)}</dd>
            <dt>Shows</dt><dd className="text-right">{dmy(inv.period_start)} → {dmy(inv.period_end)}</dd>
            <dt>Hub number</dt><dd className="text-right">{inv.invoice_number || "—"}</dd>
            <dt>Holded number</dt><dd className="text-right">{inv.holded_doc_number || "—"}</dd>
            <dt>Bookings</dt><dd className="text-right">{(lines ?? []).filter((l) => l.booking_id).length}</dd>
          </dl>
        </div>
      </aside>
      </div>
    </div>
  );
}

/** dd/mm/yyyy, as Holded shows dates. */
function dmy(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
}

function holdedTagFor(island: string | null | undefined): string {
  const key = String(island || "").toLowerCase();
  return key === "tenerife" ? "tfs" : key === "lanzarote" ? "ace" : key === "gran canaria" ? "lpa" : key === "uk tour" ? "uk" : "island";
}

type Step = { label: string; note: string; state: "done" | "now" | "todo" };

/** Where the invoice is on its way from a Hub draft to paid in Holded. */
function invoiceStage(inv: {
  status?: string | null;
  voided?: boolean | null;
  paid?: boolean | null;
  invoice_number?: string | null;
  holded_document_id?: string | null;
  holded_status?: string | null;
  holded_doc_number?: string | null;
  due_date?: string | null;
}, today: string): { label: string; tone: string; steps: Step[] } {
  const issued = inv.status !== "draft";
  const inHolded = Boolean(inv.holded_document_id);
  const approved = ["approved", "paid", "corrected"].includes(String(inv.holded_status));
  const paid = Boolean(inv.paid) || inv.holded_status === "paid";
  const reached = [true, issued, inHolded, approved, paid];
  const current = reached.lastIndexOf(true) + 1;
  const steps: Step[] = [
    { label: "Draft", note: "Lines from bookings" },
    { label: "Issued", note: inv.invoice_number ? `Hub ${inv.invoice_number}` : "Hub number" },
    { label: "In Holded", note: inHolded ? "Draft on the contact" : "Sent as a draft" },
    { label: "Approved", note: inv.holded_doc_number || "Legal number · Verifactu" },
    { label: "Paid", note: paid ? "Collected" : "Payment synced" },
  ].map((st, i) => ({ ...st, state: reached[i] ? "done" : i === current ? "now" : "todo" }));
  if (inv.voided) return { label: "Voided", tone: "bg-slate-200 text-slate-700", steps };
  if (paid) return { label: "Paid", tone: "bg-emerald-50 text-emerald-700", steps };
  if (!issued) return { label: "Draft", tone: "bg-slate-100 text-slate-600", steps };
  if (!inHolded) return { label: "To send to Holded", tone: "bg-violet-50 text-violet-700", steps };
  if (!approved) return { label: "Draft in Holded", tone: "bg-amber-50 text-amber-700", steps };
  if (inv.due_date && inv.due_date < today) return { label: "Overdue", tone: "bg-rose-50 text-rose-700", steps };
  return { label: "Pending", tone: "bg-sky-50 text-sky-700", steps };
}
