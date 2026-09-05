import Link from "next/link";
import { notFound } from "next/navigation";

import {
  cancelBookingFormAction,
  resendGuestTicketFormAction,
  updateBookingAction,
} from "@/app/dashboard/show-ops/actions";
import { ArrivalPaxForm } from "@/components/show-ops/arrival-pax-form";
import { NoShowDecisionForm } from "@/components/show-ops/no-show-decision";
import { ShowOpsBookingForm } from "@/components/show-ops/booking-form";
import { ShowOpsPageHeader } from "@/components/show-ops/show-ops-page-header";
import { requireShowOpsEnabled } from "@/lib/show-ops/access";
import { applyNoShowBilling, formatShowOpsPax, showOpsArrivalMark } from "@/lib/show-ops/calc";
import { formatBookingChanges, formatBookingHistoryWhen, type BookingChanges } from "@/lib/show-ops/booking-history";
import { loadBookedDatesByProduct, withBookedDates } from "@/lib/show-ops/nights";
import { PRIVATE_ACCOMMODATION_LABELS, pickupKindFromBooking, type PrivateAccommodation } from "@/lib/show-ops/private-pickup";
import { SHOW_OPS_PAYMENT_METHOD_LABELS, type ShowOpsPaymentMethod } from "@/lib/show-ops/types";

export default async function EditBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; ticket?: string; msg?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requireShowOpsEnabled();
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
    { data: products },
    { data: hotels },
    { data: stops },
    { data: creator },
    bookedDates,
    { data: history },
  ] = await Promise.all([
      ctx.supabase
        .from("show_suppliers")
        .select("id,name,billing_mode,deposit_percent,invoice_nett_percent,island,partner_type,can_choose_billing_mode")
        .eq("business_id", biz)
        .eq("active", true)
        .order("name"),
      ctx.supabase
        .from("show_products")
        .select("id,name,island,adult_price,child_price,infant_price,adult_price_no_transport,child_price_no_transport,infant_price_no_transport,adult_nett,child_nett,transport_available,run_weekdays,show_time,show_ticket_types(*)")
        .eq("business_id", biz)
        .eq("active", true)
        .order("name"),
      ctx.supabase
        .from("show_hotels")
        .select("id,name,island,bus_stop_id")
        .eq("business_id", biz)
        .eq("active", true)
        .order("name"),
      ctx.supabase
        .from("show_bus_stops")
        .select("id,stop_name,resort,pickup_time,island,runs_on,zone")
        .eq("business_id", biz)
        .eq("active", true),
      booking.created_by
        ? ctx.supabase.from("profiles").select("full_name,email").eq("id", booking.created_by).maybeSingle()
        : Promise.resolve({ data: null }),
      loadBookedDatesByProduct(ctx.supabase, biz),
      ctx.supabase
        .from("show_booking_history")
        .select("id,changed_at,changed_by_name,changes")
        .eq("business_id", biz)
        .eq("booking_id", id)
        .order("changed_at", { ascending: false })
        .limit(100),
    ]);

  const pickupKind = pickupKindFromBooking(booking);
  const accommodation = booking.private_accommodation
    ? PRIVATE_ACCOMMODATION_LABELS[booking.private_accommodation as PrivateAccommodation] ?? null
    : null;
  const gettingThere =
    pickupKind === "bus"
      ? `Bus · ${booking.pickup_stop_name ?? "stop not set"}${booking.pickup_time ? ` · ${String(booking.pickup_time).slice(0, 5)}` : ""}`
      : pickupKind === "private"
        ? `Private transfer${booking.private_zone ? ` from ${booking.private_zone}` : ""}${accommodation ? ` · ${accommodation}` : ""}`
        : "Own way";
  const paidBy = booking.payment_method
    ? SHOW_OPS_PAYMENT_METHOD_LABELS[booking.payment_method as ShowOpsPaymentMethod] ?? String(booking.payment_method)
    : null;

  const createdBy =
    (creator?.full_name && String(creator.full_name).trim()) || creator?.email || "—";
  const arrival = showOpsArrivalMark({
    adults: booking.adults,
    children: booking.children,
    infants: booking.infants,
    arrivedPax: booking.arrived_pax,
    arrivedAt: booking.arrived_at,
    noShow: booking.no_show,
  });
  const billed = applyNoShowBilling({
    booked: arrival.booked,
    arrived: arrival.arrived,
    totalCost: Number(booking.total_cost),
    nettTotal: Number(booking.nett_total),
    adultNettTotal: Number(booking.adult_nett_total),
    childNettTotal: Number(booking.child_nett_total),
    charge: booking.no_show_charge,
  });
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
        subtitle={
          <>
            Created {new Date(booking.created_at).toLocaleString()} by {createdBy}
            {booking.updated_at ? ` · last updated ${new Date(booking.updated_at).toLocaleString()}` : ""}
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
        </p>
      ) : null}
      {booking.invoice_id && !booking.cancelled_at ? (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
          On invoice pack —{" "}
          <Link href={`/dashboard/show-ops/invoices/${booking.invoice_id}`} className="underline">
            open invoice
          </Link>
          . Void it before changing pax, show or supplier.
        </p>
      ) : null}
      {sp.saved === "1" ? (
        <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Saved.</p>
      ) : null}
      {booking.cancelled_at ? null : (
        <div
          className={`mt-4 rounded-xl px-4 py-3 ring-1 ${
            arrival.status === "partial"
              ? "bg-amber-50 ring-amber-200"
              : arrival.status === "all_in"
                ? "bg-emerald-50 ring-emerald-200"
                : arrival.status === "absent"
                  ? "bg-slate-100 ring-slate-200"
                  : "bg-slate-50 ring-slate-200"
          }`}
        >
          <p className="text-sm font-semibold text-slate-900">Who showed up</p>
          <p className="mt-1 text-sm text-slate-600">
            Booked {formatShowOpsPax(booking.adults, booking.children, booking.infants)} ({arrival.booked} people).
            This does not change show capacity — it is the door count. Invoice / commission follow Charge or Write off.
          </p>
          <p className="mt-1 text-sm font-medium text-slate-800">
            {arrival.status === "pending" ? "Not marked yet." : arrival.doorLabel}
            {arrival.status === "partial" && arrival.missing ? ` · ${arrival.missing} missing` : ""}
            {billed.invoiceNote ? ` · ${billed.invoiceNote}` : ""}
          </p>
          <div className="mt-3">
            <ArrivalPaxForm key={`${booking.id}:${arrival.arrived}`} bookingId={booking.id} mark={arrival} />
          </div>
          <NoShowDecisionForm
            bookingId={booking.id}
            charge={
              booking.no_show_charge === "write_off" || booking.no_show_charge === "charge"
                ? booking.no_show_charge
                : null
            }
            missing={arrival.missing ?? 0}
            booked={arrival.booked}
            invoiced={Boolean(booking.invoice_id)}
            proofUrl={proofUrl}
          />
        </div>
      )}
      {booking.cancelled_at ? null : (
      <ShowOpsBookingForm
        mode="edit"
        action={updateBookingAction}
        successPath={`/dashboard/show-ops/bookings/${id}?saved=1`}
        products={withBookedDates((products ?? []) as { id: string }[], bookedDates) as never}
        suppliers={(suppliers ?? []) as never}
        hotels={(hotels ?? []) as never}
        stops={(stops ?? []) as never}
        config={ctx.config}
        moneyLocked={Boolean(booking.invoice_id)}
        defaults={{
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
            ? (booking.attendees as Array<{ name?: string | null; type?: string | null; note?: string | null }>)
            : null,
          custom_answers:
            booking.custom_answers && typeof booking.custom_answers === "object"
              ? (booking.custom_answers as Record<string, string | boolean | number>)
              : {},
        }}
      />
      )}
      {booking.cancelled_at ? null : (
        <div className="mt-6 border-t border-slate-200 pt-4">
          {sp.ticket ? (
            <p
              className={`mb-2 rounded-lg px-3 py-2 text-sm ${
                sp.ticket === "sent" ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900"
              }`}
            >
              {sp.msg || (sp.ticket === "sent" ? "Ticket sent." : "Could not send.")}
            </p>
          ) : null}
          <form action={resendGuestTicketFormAction} className="flex flex-wrap items-center gap-3">
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
        </div>
      )}
      {booking.cancelled_at || booking.invoice_id ? null : (
        <form action={cancelBookingFormAction} className="mt-6 space-y-2 border-t border-slate-200 pt-4">
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
          <button type="submit" className="rounded-lg bg-rose-700 px-3 py-2 text-sm text-white">
            Cancel booking
          </button>
        </form>
      )}
      <div className="mt-6 border-t border-slate-200 pt-4">
        <h2 className="text-sm font-semibold text-slate-900">History</h2>
        {history?.length ? (
          <ul className="mt-2 space-y-1.5 text-sm text-slate-700">
            {history.map((h) => {
              const line = formatBookingChanges(h.changes as BookingChanges);
              if (!line) return null;
              return (
                <li key={h.id} className="flex flex-wrap gap-x-2">
                  <span className="whitespace-nowrap tabular-nums text-slate-500">{formatBookingHistoryWhen(h.changed_at)}</span>
                  <span className="text-slate-400">·</span>
                  <span className="font-medium text-slate-800">{h.changed_by_name || "Staff"}</span>
                  <span className="text-slate-400">·</span>
                  <span>{line}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-slate-500">No changes since it was taken.</p>
        )}
      </div>
      </div>
    </div>
  );
}
