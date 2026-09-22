import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { attachPartnerLinkTicketPhotoFormAction, createPartnerLinkBookingAction, partnerLinkContext, requestPartnerLinkCancellationFormAction } from "@/app/dashboard/show-ops/actions";
import { ShowOpsBookingForm } from "@/components/show-ops/booking-form";
import { loadRatePrices } from "@/lib/show-ops/rate-cards";
import { formatShowOpsMoney } from "@/lib/show-ops/calc";
import { cancellationRequestWindow, partnerCancellationStatus, showOpsTodayIso } from "@/lib/show-ops/cancellation";
import { showOpsCurrencyFor } from "@/lib/show-ops/config";
import { loadDirectoryHotels, loadDirectoryStops } from "@/lib/show-ops/directory-data";
import { withBookedDates } from "@/lib/show-ops/nights";

export const dynamic = "force-dynamic";

/**
 * A partner's private booking page. No login: the token in the URL is the identity,
 * and every booking made here is stamped with that partner.
 */
export default async function PartnerLinkPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ created?: string; request?: string; msg?: string; bookings?: string; invoices?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const link = await partnerLinkContext(token);
  if (!link) notFound();
  const { ctx, supplier, admin } = link;
  const biz = ctx.business.id;
  // Joel: the last 10 of each on the page, "See more" for the lot.
  const RECENT = 10;
  const allBookings = sp.bookings === "all";
  const allInvoices = sp.invoices === "all";

  const [{ data: products, error: productsError }, { data: hotels }, { data: stops }, bookedDatesResult, { data: recent, count: bookingCount }, created, ratePrices, { data: invoices, count: invoiceCount }] = await Promise.all([
    admin
      .from("show_products")
      .select(
        "id,name,island,adult_price,child_price,infant_price,adult_price_no_transport,child_price_no_transport,infant_price_no_transport,adult_nett,child_nett,transport_available,run_weekdays,show_time,show_ticket_types(*),show_extras(*)",
      )
      .eq("business_id", biz)
      .eq("active", true)
      .order("name"),
    loadDirectoryHotels(admin, biz, true),
    loadDirectoryStops(admin, biz, true),
    admin.rpc("show_ops_partner_booked_dates", { p_business_id: biz }),
    admin
      .from("show_bookings")
      .select("id,booking_ref,guest_name,show_name,show_date,island,hotel_name,adults,children,infants,total_cost,nett_total,deposit_amount,billing_mode,created_at,cancelled_at,invoice_id,cancel_request_status,cancel_request_reply,cancel_charge,no_show_proof_path", { count: "exact" })
      .eq("business_id", biz)
      .eq("supplier_id", supplier.id)
      .order("created_at", { ascending: false })
      .limit(allBookings ? 500 : RECENT),
    /^[0-9a-f-]{36}$/i.test(sp.created ?? "")
      ? admin.from("show_bookings").select("booking_ref,guest_name,show_name,show_date").eq("id", sp.created!).eq("supplier_id", supplier.id).maybeSingle()
      : Promise.resolve({ data: null }),
    // The partner's rate card — the prices this link quotes and books at.
    loadRatePrices(admin, biz, supplier.sale_rate_id ? String(supplier.sale_rate_id) : null),
    // Their issued invoices, newest first. Drafts and voided packs stay in the office.
    admin
      .from("show_invoices")
      .select("id,invoice_number,verifactu_number,invoice_date,period_start,period_end,due_date,total_amount,paid,paid_at,island", { count: "exact" })
      .eq("business_id", biz)
      .eq("supplier_id", supplier.id)
      .eq("status", "issued")
      .eq("voided", false)
      .order("invoice_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(allInvoices ? 500 : RECENT),
  ]);
  if (productsError) throw new Error("Could not load shows. Please refresh.");
  const bookedDates = (bookedDatesResult.error ? {} : (bookedDatesResult.data ?? {})) as Record<string, string[]>;
  const { branding } = ctx;
  const today = showOpsTodayIso();
  // Ticket pictures on the partner's own bookings: short-lived links, one per photo.
  const photoUrls = new Map<string, string>();
  await Promise.all(
    (recent ?? [])
      .filter((b) => b.no_show_proof_path)
      .map(async (b) => {
        const { data } = await admin.storage.from("show-ops-proofs").createSignedUrl(String(b.no_show_proof_path), 60 * 60);
        if (data?.signedUrl) photoUrls.set(b.id, data.signedUrl);
      }),
  );

  return (
    <div
      className="min-h-screen bg-slate-50 px-4 py-6"
      style={{ ["--show-ops-primary" as string]: branding.primaryColor, ["--show-ops-accent" as string]: branding.accentColor } as React.CSSProperties}
    >
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {branding.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={branding.logoUrl} alt="" className="h-12 w-auto max-w-[9rem] object-contain" />
            ) : (
              <Image src="/brand/icon-192.png" alt="" width={40} height={40} className="h-10 w-10 rounded-xl" />
            )}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{branding.displayName}</p>
              <h1 className="text-xl font-semibold tracking-tight text-slate-900">{supplier.name}</h1>
            </div>
          </div>
          <span className="flex flex-wrap gap-2">
            <a href="#your-bookings" className="rounded-full bg-white px-3 py-1.5 text-sm font-medium ring-1 ring-slate-200">
              Your bookings ({bookingCount ?? recent?.length ?? 0})
            </a>
            <a href="#your-invoices" className="rounded-full bg-white px-3 py-1.5 text-sm font-medium ring-1 ring-slate-200">
              Your invoices ({invoiceCount ?? invoices?.length ?? 0})
            </a>
          </span>
        </header>

        {created.data ? (
          <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 ring-1 ring-emerald-200" role="status">
            Booked. <strong>{created.data.booking_ref}</strong> — {created.data.guest_name}, {created.data.show_name} on {created.data.show_date}.
            Quote that reference to {branding.displayName} if you need to change anything.
          </p>
        ) : null}

        <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">New booking</h2>
          <p className="mb-4 text-sm text-slate-600">
            Prices shown are your contracted rate with {branding.displayName}. This page is private to {supplier.name}; every booking made here is recorded under your name.
          </p>
          <ShowOpsBookingForm
            mode="create"
            action={createPartnerLinkBookingAction}
            successPath={`/p/${encodeURIComponent(token)}?created={id}`}
            sellerMode
            products={withBookedDates((products ?? []) as { id: string }[], bookedDates) as never}
            suppliers={[supplier] as never}
            ratePrices={ratePrices}
            hotels={(hotels ?? []) as never}
            stops={(stops ?? []) as never}
            config={ctx.config}
            defaults={{ supplier_id: supplier.id, sales_channel: supplier.partner_type, partner_token: token } as never}
          />
        </section>

        <section id="your-bookings" className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Your bookings</h2>
          <p className="mb-3 text-sm text-slate-600">
            {allBookings ? `Every booking made under ${supplier.name}` : `The last ${RECENT} bookings made under ${supplier.name}`}. Need to cancel one? Ask below up to the day before the show and {branding.displayName} will confirm.
          </p>
          {sp.request ? (
            <p
              className={`mb-3 rounded-xl px-4 py-3 text-sm ring-1 ${sp.request === "sent" ? "bg-emerald-50 text-emerald-900 ring-emerald-200" : "bg-rose-50 text-rose-900 ring-rose-200"}`}
              role="status"
            >
              {sp.msg || (sp.request === "sent" ? "Cancellation requested." : "Request not sent.")}
            </p>
          ) : null}
          {recent?.length ? (
            <ul className="divide-y divide-slate-100 text-sm">
              {recent.map((b) => {
                const currency = showOpsCurrencyFor(ctx.config, b.island);
                const pax = Number(b.adults || 0) + Number(b.children || 0) + Number(b.infants || 0);
                const status = partnerCancellationStatus(b);
                const window = cancellationRequestWindow(b, today);
                return (
                  <li key={b.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
                    <span className="min-w-0">
                      <span className="font-mono text-xs text-slate-500">{b.booking_ref}</span>{" "}
                      <span className={`font-medium text-slate-900${b.cancelled_at ? " line-through" : ""}`}>{b.guest_name}</span>
                      <span className="block text-xs text-slate-500">
                        {b.show_name} · {b.show_date} · {pax} pax{b.hotel_name ? ` · ${b.hotel_name}` : ""}
                      </span>
                      {status ? (
                        <span
                          className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            status.tone === "pending"
                              ? "bg-amber-100 text-amber-900"
                              : status.tone === "denied"
                                ? "bg-rose-100 text-rose-900"
                                : "bg-slate-200 text-slate-700"
                          }`}
                        >
                          {status.label}
                        </span>
                      ) : null}
                      {!b.cancelled_at ? (
                        <span className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                          {photoUrls.get(b.id) ? (
                            <a href={photoUrls.get(b.id)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-emerald-800">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={photoUrls.get(b.id)} alt="" className="h-8 w-auto rounded ring-1 ring-emerald-200" />
                              Ticket photo attached
                            </a>
                          ) : null}
                          <form action={attachPartnerLinkTicketPhotoFormAction} className="inline-flex items-center gap-2">
                            <input type="hidden" name="partner_token" value={token} />
                            <input type="hidden" name="booking_id" value={b.id} />
                            <label className="cursor-pointer text-slate-500 underline decoration-dotted">
                              {photoUrls.get(b.id) ? "Replace photo" : "Attach ticket photo"}
                              <input name="ticket_photo" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" required className="sr-only" />
                            </label>
                            <button type="submit" className="rounded-md bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white">
                              Upload
                            </button>
                          </form>
                        </span>
                      ) : null}
                      {!b.cancelled_at && status?.tone !== "pending" ? (
                        window.allowed ? (
                          <details className="mt-1 text-xs">
                            <summary className="cursor-pointer text-slate-500 underline decoration-dotted">Request cancellation</summary>
                            <form action={requestPartnerLinkCancellationFormAction} className="mt-2 flex flex-wrap items-center gap-2">
                              <input type="hidden" name="partner_token" value={token} />
                              <input type="hidden" name="booking_id" value={b.id} />
                              <input
                                name="reason"
                                required
                                maxLength={500}
                                placeholder="Why? (guest changed plans, duplicate…)"
                                className="min-w-[14rem] flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                              />
                              <button type="submit" className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">
                                Send request
                              </button>
                            </form>
                          </details>
                        ) : (
                          <span className="mt-1 block text-[11px] text-slate-400">{window.reason}</span>
                        )
                      ) : null}
                    </span>
                    <span className="text-right tabular-nums text-slate-700">
                      {formatShowOpsMoney(Number(b.total_cost || 0), currency)}
                      <span className="block text-[11px] text-slate-500">
                        {b.billing_mode === "invoice" ? `nett ${formatShowOpsMoney(Number(b.nett_total || 0), currency)}` : `deposit ${formatShowOpsMoney(Number(b.deposit_amount || 0), currency)}`}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No bookings yet. Your first one will appear here.</p>
          )}
          {!allBookings && (bookingCount ?? 0) > RECENT ? (
            <p className="mt-3 text-sm">
              <Link href={`/p/${encodeURIComponent(token)}?bookings=all#your-bookings`} className="font-semibold text-slate-900 underline">
                See more ({(bookingCount ?? 0) - RECENT} older)
              </Link>
            </p>
          ) : null}
          {allBookings ? (
            <p className="mt-3 text-sm">
              <Link href={`/p/${encodeURIComponent(token)}#your-bookings`} className="text-slate-600 underline">Show the last {RECENT} only</Link>
            </p>
          ) : null}
        </section>

        <section id="your-invoices" className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Your invoices</h2>
          <p className="mb-3 text-sm text-slate-600">
            {allInvoices ? "Every invoice" : `The last ${RECENT} invoices`} {branding.displayName} has issued to {supplier.name}. Open one for the PDF.
          </p>
          {invoices?.length ? (
            <ul className="divide-y divide-slate-100 text-sm">
              {invoices.map((inv) => {
                const currency = showOpsCurrencyFor(ctx.config, inv.island);
                const number = inv.invoice_number || inv.verifactu_number || "—";
                const overdue = !inv.paid && inv.due_date && String(inv.due_date) < today;
                return (
                  <li key={inv.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
                    <span className="min-w-0">
                      <a
                        href={`/p/${encodeURIComponent(token)}/invoice/${inv.id}`}
                        target="_blank"
                        rel="noopener"
                        className="font-semibold text-slate-900 underline decoration-dotted"
                      >
                        {number}
                      </a>
                      <span className="block text-xs text-slate-500">
                        {inv.invoice_date ? `Issued ${inv.invoice_date}` : "Issued"} · shows {inv.period_start} to {inv.period_end}
                        {inv.due_date ? ` · due ${inv.due_date}` : ""}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block tabular-nums font-semibold text-slate-900">{formatShowOpsMoney(Number(inv.total_amount || 0), currency)}</span>
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          inv.paid ? "bg-emerald-100 text-emerald-900" : overdue ? "bg-rose-100 text-rose-900" : "bg-amber-100 text-amber-900"
                        }`}
                      >
                        {inv.paid ? `Paid${inv.paid_at ? ` ${inv.paid_at}` : ""}` : overdue ? "Overdue" : "Unpaid"}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No invoices issued yet.</p>
          )}
          {!allInvoices && (invoiceCount ?? 0) > RECENT ? (
            <p className="mt-3 text-sm">
              <Link href={`/p/${encodeURIComponent(token)}?invoices=all#your-invoices`} className="font-semibold text-slate-900 underline">
                See more ({(invoiceCount ?? 0) - RECENT} older)
              </Link>
            </p>
          ) : null}
          {allInvoices ? (
            <p className="mt-3 text-sm">
              <Link href={`/p/${encodeURIComponent(token)}#your-invoices`} className="text-slate-600 underline">Show the last {RECENT} only</Link>
            </p>
          ) : null}
        </section>

        <p className="text-center text-xs text-slate-400">
          Keep this link private to your team. Questions? Contact {branding.displayName}.{" "}
          <Link href="/" className="underline">Solvio</Link>
        </p>
      </div>
    </div>
  );
}
