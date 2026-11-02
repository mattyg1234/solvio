import { collectPartnerPages } from "@/lib/show-ops/partner-analytics";
import { consentSummary } from "@/lib/show-ops/consent";
import { loadDirectoryHotels, loadDirectoryStops } from "@/lib/show-ops/directory-data";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  cancelBookingFormAction,
  decideCancellationRequestFormAction,
  resendGuestTicketFormAction,
  updateBookingAction,
} from "@/app/dashboard/show-ops/actions";
import { AddPaymentButton } from "@/components/show-ops/add-payment-button";
import { TicketPhotoControl } from "@/components/show-ops/no-show-decision";
import { ShowOpsBookingForm } from "@/components/show-ops/booking-form";
import { ShowOpsPageHeader } from "@/components/show-ops/show-ops-page-header";
import { SendBookingToChat } from "@/components/show-ops/chat/send-booking-to-chat";
import { canUseShowOpsChat } from "@/lib/show-ops/chat/logic";
import { requireShowOpsPage, roleAtLeast } from "@/lib/show-ops/access";
import { recordedPaid } from "@/lib/show-ops/booking-paid";
import { showOpsCurrencyFor } from "@/lib/show-ops/config";
import {
  formatShowOpsMoney,
  round2,
} from "@/lib/show-ops/calc";
import { defaultCancellationCharge, showOpsTodayIso } from "@/lib/show-ops/cancellation";
import { confirmationAvailableFor } from "@/lib/show-ops/confirmation-pdf";
import {
  formatBookingChanges,
  formatBookingHistoryWhen,
  type BookingChanges,
} from "@/lib/show-ops/booking-history";
import {
  loadBookedDatesByProduct,
  withBookedDates,
} from "@/lib/show-ops/nights";
import {
  PRIVATE_ACCOMMODATION_LABELS,
  pickupKindFromBooking,
  type PrivateAccommodation,
} from "@/lib/show-ops/private-pickup";
import {
  SHOW_OPS_PAYMENT_METHOD_LABELS,
  type ShowOpsPaymentMethod,
} from "@/lib/show-ops/types";

export default async function EditBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; ticket?: string; msg?: string; request?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requireShowOpsPage("bookings");
  const biz = ctx.business.id;

  const { data: booking } = await ctx.supabase
    .from("show_bookings")
    .select("*")
    .eq("id", id)
    .eq("business_id", biz)
    .maybeSingle();
  if (!booking) notFound();

  const [
    { data: suppliers },
    { data: products, error: productsError },
    { data: hotels },
    { data: stops },
    { data: creator },
    bookedDates,
    { data: history, error: historyError },
    { data: paymentRows, error: paymentsError },
  ] = await Promise.all([
    ctx.supabase
      .from("show_suppliers")
      .select(
        "id,name,billing_mode,deposit_percent,invoice_nett_percent,island,partner_type,can_choose_billing_mode,sale_rate_id",
      )
      .eq("business_id", biz)
      .eq("active", true)
      .order("name"),
    ctx.supabase
      .from("show_products")
      .select(
        "id,name,island,adult_price,child_price,infant_price,adult_price_no_transport,child_price_no_transport,infant_price_no_transport,adult_nett,child_nett,transport_available,run_weekdays,run_dates,dark_dates,show_time,show_ticket_types(*),show_extras(*)",
      )
      .eq("business_id", biz)
      .eq("active", true)
      .order("name"),
    loadDirectoryHotels(ctx.supabase, biz, true),
    loadDirectoryStops(ctx.supabase, biz, true),
    booking.created_by
      ? ctx.supabase
          .from("profiles")
          .select("full_name,email")
          .eq("id", booking.created_by)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    loadBookedDatesByProduct(ctx.supabase, biz),
    (async () => {
      try {
        const data = await collectPartnerPages<{
          id: string; changed_at: string; changed_by: string | null;
          changed_by_name: string | null; changes: BookingChanges;
        }>(async (offset, limit) => {
          const { data, error } = await ctx.supabase
            .from("show_booking_history")
            .select("id,changed_at,changed_by,changed_by_name,changes")
            .eq("business_id", biz).eq("booking_id", id)
            .order("changed_at", { ascending: false }).order("id", { ascending: false })
            .range(offset, offset + limit - 1);
          if (error) throw error;
          return data ?? [];
        });
        return { data, error: false };
      } catch {
        return { data: [], error: true };
      }
    })(),
    ctx.supabase
      .from("show_booking_payments")
      .select("id,amount,method,paid_at,note,created_by")
      .eq("business_id", biz)
      .eq("booking_id", id)
      .order("paid_at", { ascending: true }),
  ]);

  if (productsError)
    throw new Error(
      "Could not load shows, ticket types and extras. Please try again.",
    );

  const pickupKind = pickupKindFromBooking(booking);
  const accommodation = booking.private_accommodation
    ? (PRIVATE_ACCOMMODATION_LABELS[
        booking.private_accommodation as PrivateAccommodation
      ] ?? null)
    : null;
  const gettingThere =
    pickupKind === "bus"
      ? `Bus · ${booking.pickup_stop_name ?? "stop not set"}${booking.pickup_time ? ` · ${String(booking.pickup_time).slice(0, 5)}` : ""}`
      : pickupKind === "private"
        ? `Private transfer${booking.private_zone ? ` from ${booking.private_zone}` : ""}${accommodation ? ` · ${accommodation}` : ""}`
        : "Own way";
  const paidBy = booking.payment_method
    ? (SHOW_OPS_PAYMENT_METHOD_LABELS[
        booking.payment_method as ShowOpsPaymentMethod
      ] ?? String(booking.payment_method))
    : null;

  const createdBy =
    (booking.created_by_name && String(booking.created_by_name).trim()) ||
    (creator?.full_name && String(creator.full_name).trim()) ||
    creator?.email ||
    (booking.created_by ? `Account ${booking.created_by}` : "Imported / creator not recorded");
  /*
   * Payments box: what the guest has paid and what is still owed. The ledger is
   * the record of every payment; a booking with no ledger rows falls back to the
   * paid amount stored on the booking (imported bookings).
   */
  const currency = showOpsCurrencyFor(ctx.config, booking.island);
  const fmt = (n: number) => formatShowOpsMoney(n, currency);
  const payments = (paymentRows ?? []) as Array<{
    id: string; amount: number | string; method: string; paid_at: string; note: string | null; created_by: string | null;
  }>;
  const payerIds = [...new Set(payments.map((p) => p.created_by).filter((v): v is string => Boolean(v)))];
  const { data: payers } = payerIds.length
    ? await ctx.supabase.from("profiles").select("id,full_name,email").in("id", payerIds)
    : { data: [] as Array<{ id: string; full_name: string | null; email: string | null }> };
  const payerName = new Map((payers ?? []).map((p) => [p.id, (p.full_name && p.full_name.trim()) || p.email || "Staff"]));
  const isDeposit = booking.billing_mode === "deposit";
  const totalCost = round2(Number(booking.total_cost) || 0);
  const paidSoFar = payments.length
    ? round2(payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0))
    : recordedPaid(booking);
  const outstanding = isDeposit ? round2(Math.max(0, totalCost - paidSoFar)) : 0;
  const canTakePayment = isDeposit && !booking.cancelled_at && outstanding > 0 && roleAtLeast(ctx.role, "office");
  const methodLabel = (m: string) =>
    m === "import" ? "Paid before the Hub" : m === "stripe" ? "Online (card)" : m === "transfer" ? "Direct (PayPal / Stripe)" : (SHOW_OPS_PAYMENT_METHOD_LABELS as Record<string, string>)[m] ?? m;

  const requestPending = booking.cancel_request_status === "pending" && !booking.cancelled_at;
  let partnerPolicy: string | null = null;
  if (requestPending && booking.supplier_id) {
    const { data: partner } = await ctx.supabase
      .from("show_suppliers")
      .select("no_show_policy")
      .eq("id", booking.supplier_id)
      .eq("business_id", biz)
      .maybeSingle();
    partnerPolicy = (partner as { no_show_policy?: string | null } | null)?.no_show_policy ?? null;
  }
  const suggestedCharge = defaultCancellationCharge(partnerPolicy, String(booking.show_date), showOpsTodayIso());
  let proofUrl: string | null = null;
  if (booking.no_show_proof_path) {
    const { data: signed } = await ctx.supabase.storage
      .from("show-ops-proofs")
      .createSignedUrl(booking.no_show_proof_path, 60 * 60);
    proofUrl = signed?.signedUrl ?? null;
  }

  return (
    <div className="space-y-6">
      <ShowOpsPageHeader
        eyebrow="Operations"
        title={`Edit booking · ${booking.booking_ref}`}
        actions={
          canUseShowOpsChat(ctx.role) ? (
            <SendBookingToChat bookingId={booking.id} bookingRef={String(booking.booking_ref)} />
          ) : undefined
        }
        subtitle={
          <>
            Created {formatBookingHistoryWhen(booking.created_at)} by{" "}
            {createdBy}
            {booking.updated_at
              ? ` · last updated ${formatBookingHistoryWhen(booking.updated_at)}`
              : ""}
            <span className="block">
              {gettingThere} · Paid by {paidBy ?? "—"}
            </span>
          </>
        }
      />
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200/80">
        {booking.cancelled_at ? (
          <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-800">
            Cancelled {new Date(booking.cancelled_at).toLocaleString()}
            {booking.cancel_reason ? ` — ${booking.cancel_reason}` : ""}
            {booking.cancel_charge === "charge" ? " · still charged in full on the partner's invoice" : ""}
          </p>
        ) : null}
        {sp.request ? (
          <p
            className={`mt-3 rounded-lg px-3 py-2 text-sm ${sp.request === "done" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}
          >
            {sp.msg || (sp.request === "done" ? "Done." : "That did not go through.")}
          </p>
        ) : null}
        {requestPending ? (
          <div className="mt-4 rounded-xl bg-amber-50 px-4 py-3 ring-1 ring-amber-200">
            <p className="text-sm font-semibold text-amber-950">
              {booking.supplier_name || "The partner"} asked to cancel this booking
              {booking.cancel_requested_at ? ` · ${formatBookingHistoryWhen(booking.cancel_requested_at)}` : ""}
            </p>
            <p className="mt-1 text-sm text-amber-900">
              Reason: {booking.cancel_request_reason || "none given"}
            </p>
            {booking.invoice_id ? (
              <p className="mt-2 text-sm text-amber-900">
                This booking is already on an invoice pack — void it before approving, or decline.
              </p>
            ) : null}
            <form action={decideCancellationRequestFormAction} className="mt-3 space-y-3">
              <input type="hidden" name="id" value={booking.id} />
              <fieldset className="space-y-1 text-sm text-slate-800">
                <legend className="font-medium">If approved, the partner&apos;s invoice</legend>
                <label className="flex items-center gap-2">
                  <input type="radio" name="charge" value="write_off" defaultChecked={suggestedCharge === "write_off"} />
                  Nothing charged — written off
                  {suggestedCharge === "write_off" ? <span className="text-xs text-slate-500">(within the cut-off)</span> : null}
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="charge" value="charge" defaultChecked={suggestedCharge === "charge"} />
                  Charged in full — stays on the invoice
                  {suggestedCharge === "charge" ? <span className="text-xs text-slate-500">(late, partner policy)</span> : null}
                </label>
              </fieldset>
              <label className="block text-sm text-slate-800">
                Note back to the partner (optional)
                <input
                  name="reply"
                  maxLength={500}
                  placeholder="e.g. Bus already ordered, cannot release the seats"
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  name="decision"
                  value="approve"
                  disabled={Boolean(booking.invoice_id)}
                  className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
                >
                  Approve — cancel booking
                </button>
                <button
                  type="submit"
                  name="decision"
                  value="deny"
                  className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-800 ring-1 ring-slate-300"
                >
                  Decline — keep booking
                </button>
              </div>
            </form>
          </div>
        ) : null}
        {booking.invoice_id && !booking.cancelled_at ? (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
            On invoice pack —{" "}
            <Link
              href={`/dashboard/show-ops/invoices/${booking.invoice_id}`}
              className="underline"
            >
              open invoice
            </Link>
            . Void it before changing pax, show or supplier.
          </p>
        ) : null}
        {sp.saved === "1" ? (
          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Saved.
          </p>
        ) : null}
        <section className="mt-4 rounded-xl bg-white px-4 py-3 ring-1 ring-slate-200" aria-label="Payments">
          {isDeposit ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                  <span className="text-slate-600">
                    Total <span className="font-semibold tabular-nums text-slate-900">{fmt(totalCost)}</span>
                  </span>
                  <span className="text-slate-600">
                    Deposit{" "}
                    <span className="font-semibold tabular-nums text-slate-900">{fmt(Number(booking.deposit_amount) || 0)}</span>
                    {booking.pricing_snapshot?.deposit_round_up ? <span className="text-xs text-slate-500"> (rounded up)</span> : null}
                  </span>
                  <span className="text-slate-600">
                    Paid <span className="font-semibold tabular-nums text-slate-900">{fmt(paidSoFar)}</span>
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-right">
                    <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Outstanding balance</span>
                    <span className={`block text-xl font-bold tabular-nums ${outstanding > 0 ? "text-rose-700" : "text-emerald-700"}`}>
                      {outstanding > 0 ? fmt(outstanding) : "Paid in full"}
                    </span>
                  </span>
                  {canTakePayment ? (
                    <AddPaymentButton
                      bookingId={booking.id}
                      bookingRef={String(booking.booking_ref)}
                      outstanding={outstanding}
                      currency={currency}
                    />
                  ) : null}
                </div>
              </div>
              {paymentsError ? (
                <p role="alert" className="mt-2 text-sm text-rose-700">Payments could not be loaded. Refresh to try again.</p>
              ) : payments.length ? (
                <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100 text-sm">
                  {payments.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 py-1.5">
                      <span className="text-slate-600">
                        {formatBookingHistoryWhen(p.paid_at)} · {methodLabel(p.method)}
                        {p.created_by ? ` · ${payerName.get(p.created_by) ?? "Staff"}` : ""}
                        {p.note ? <span className="block text-xs text-slate-500">{p.note}</span> : null}
                      </span>
                      <span className="font-semibold tabular-nums text-slate-900">{fmt(Number(p.amount) || 0)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-slate-500">No payments recorded yet.</p>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-700">
              Invoice booking: billed to {booking.supplier_name || "the partner"} on their invoice (nett{" "}
              <span className="font-semibold tabular-nums">{fmt(Number(booking.nett_total) || 0)}</span>). Nothing to collect from the guest.
            </p>
          )}
        </section>
        {/* Who showed up is marked on Night lists and Door only (Matty, 2 Nov 2026). */}
        {booking.cancelled_at ? null : (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
            <span className="text-sm font-semibold text-slate-900">Ticket photo</span>
            <TicketPhotoControl key={booking.no_show_proof_path ?? "none"} bookingId={booking.id} proofUrl={proofUrl} />
            <span className="text-xs text-slate-500">The partner&apos;s voucher or ticket. Shows here, on the night lists and at the door.</span>
          </div>
        )}
        {!booking.cancelled_at && confirmationAvailableFor(booking.island) ? (
          <p className="mt-4">
            <a
              href={`/dashboard/show-ops/bookings/${booking.id}/confirmation.pdf`}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50"
            >
              🖨 Print confirmation
            </a>
            <span className="ml-2 text-xs text-slate-500">Ruth&apos;s guest confirmation for {booking.island} (opens as a PDF).</span>
          </p>
        ) : null}
        {booking.cancelled_at ? null : (
          <ShowOpsBookingForm
            mode="edit"
            action={updateBookingAction}
            successPath={`/dashboard/show-ops/bookings/${id}?saved=1`}
            products={
              withBookedDates(
                (products ?? []) as { id: string }[],
                bookedDates,
              ) as never
            }
            suppliers={(suppliers ?? []) as never}
            hotels={(hotels ?? []) as never}
            stops={(stops ?? []) as never}
            config={ctx.config}
            moneyLocked={Boolean(booking.invoice_id)}
            defaults={{
              extras_snapshot: booking.extras_snapshot ?? [],
              pricing_snapshot: booking.pricing_snapshot ?? null,
              ticket_type_id: booking.ticket_type_id,
              ticket_type_name: booking.ticket_type_name,
              id: booking.id,
              show_date: booking.show_date,
              guest_name: booking.guest_name,
              guest_mobile: booking.guest_mobile,
              guest_email: booking.guest_email,
              product_id: booking.product_id,
              hotel_id: booking.hotel_id,
              pickup_stop_id: booking.pickup_stop_id,
              supplier_id: booking.supplier_id,
              transport_required: booking.transport_required,
              pickup_kind: booking.pickup_kind,
              private_accommodation: booking.private_accommodation,
              private_zone: booking.private_zone,
              payment_method: booking.payment_method,
              paid_so_far: isDeposit ? paidSoFar : null,
              dietary_required: booking.dietary_required,
              dietary_notes: booking.dietary_notes,
              adults: booking.adults,
              children: booking.children,
              infants: booking.infants,
              sales_channel: booking.sales_channel,
              supplier_ticket_number: booking.supplier_ticket_number,
              office_comments: booking.office_comments,
              office_only_comments: booking.office_only_comments,
              attendees: Array.isArray(booking.attendees)
                ? (booking.attendees as Array<{
                    name?: string | null;
                    type?: string | null;
                    note?: string | null;
                  }>)
                : null,
              custom_answers:
                booking.custom_answers &&
                typeof booking.custom_answers === "object"
                  ? (booking.custom_answers as Record<
                      string,
                      string | boolean | number
                    >)
                  : {},
            }}
          />
        )}
        {booking.cancelled_at ? null : (
          <div className="mt-6 border-t border-slate-200 pt-4">
            {sp.ticket ? (
              <p
                className={`mb-2 rounded-lg px-3 py-2 text-sm ${
                  sp.ticket === "sent"
                    ? "bg-emerald-50 text-emerald-900"
                    : "bg-rose-50 text-rose-900"
                }`}
              >
                {sp.msg ||
                  (sp.ticket === "sent" ? "Ticket sent." : "Could not send.")}
              </p>
            ) : null}
            <form
              action={resendGuestTicketFormAction}
              className="flex flex-wrap items-center gap-3"
            >
              <input type="hidden" name="booking_id" value={booking.id} />
              <button
                type="submit"
                disabled={!booking.guest_email && !booking.guest_mobile}
                className="rounded-xl bg-[var(--show-ops-primary,#7c3aed)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                Send ticket to guest
              </button>
              <label className="flex items-center gap-1.5 text-xs text-slate-600">
                <input type="checkbox" name="updated" value="1" />
                Mark as updated pick-up details
              </label>
              <span className="text-xs text-slate-500">
                {booking.guest_email && booking.guest_mobile
                  ? "Sends by email and text."
                  : booking.guest_email
                    ? "Sends by email."
                    : booking.guest_mobile
                      ? "Sends by text."
                      : "No email or mobile on this booking."}
              </span>
            </form>
            {booking.guest_mobile ? (
              <p className="text-xs font-medium text-slate-700">
                WhatsApp updates:{" "}
                {consentSummary(
                  {
                    marketing_asked_at: booking.marketing_asked_at ?? null,
                    marketing_opt_in_at: booking.marketing_opt_in_at ?? null,
                    marketing_opt_in_source: booking.marketing_opt_in_source ?? null,
                    whatsapp_opted_out_at: booking.whatsapp_opted_out_at ?? null,
                  },
                  (iso) =>
                    new Intl.DateTimeFormat("en-GB", { timeZone: "Atlantic/Canary", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)),
                )}
              </p>
            ) : null}
          </div>
        )}
        {booking.cancelled_at || booking.invoice_id ? null : (
          <form
            action={cancelBookingFormAction}
            className="mt-6 space-y-2 border-t border-slate-200 pt-4"
          >
            <input type="hidden" name="id" value={booking.id} />
            <label className="block text-sm text-slate-700">
              Cancel this booking
              <input
                name="cancel_reason"
                required
                placeholder="Guest cancelled / no-show / duplicate…"
                className="mt-1 w-full rounded-lg border px-3 py-2"
              />
            </label>
            <button
              type="submit"
              className="rounded-lg bg-rose-700 px-3 py-2 text-sm text-white"
            >
              Cancel booking
            </button>
          </form>
        )}
        <div className="mt-6 border-t border-slate-200 pt-4">
          <h2 className="text-sm font-semibold text-slate-900">History</h2>
          <p className="mt-1 text-xs text-slate-500">
            Full automatic history is recorded from 5 September 2026; older entries may be incomplete.
          </p>
          {historyError ? (
            <p role="alert" className="mt-2 text-sm text-rose-700">History could not be loaded. Refresh to try again.</p>
          ) : history?.length ? (
            <ul className="mt-2 space-y-1.5 text-sm text-slate-700">
              {history.map((h) => {
                const line = formatBookingChanges(h.changes as BookingChanges);
                if (!line) return null;
                return (
                  <li key={h.id} className="flex flex-wrap gap-x-2">
                    <span className="whitespace-nowrap tabular-nums text-slate-500">
                      {formatBookingHistoryWhen(h.changed_at)}
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="font-medium text-slate-800">
                      {h.changed_by_name || (h.changed_by ? `Account ${h.changed_by}` : "Actor not recorded")}
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{line}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-slate-500">
              No history entries are recorded for this booking.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
