import { bookingExtrasSummary } from "@/lib/show-ops/invoice-supplements";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { formatShowOpsPax, showOpsDayName } from "@/lib/show-ops/calc";
import { showOpsTicketQrSvg } from "@/lib/show-ops/ticket-qr";
import { showOpsTicketUrl } from "@/lib/show-ops/ticket-token";
import { getDeploymentSiteUrl } from "@/lib/deployment-site-url";
import { brandingFromBusiness, parseShowOpsConfig } from "@/lib/show-ops/config";
import { parsePrivatePickupLabel, pickupKindFromBooking, privateTransferLine } from "@/lib/show-ops/private-pickup";

export default async function GuestTicketPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const token = (await params).token?.trim().toLowerCase() ?? "";
  const admin = createSupabaseServiceRoleClient();
  const { data: booking } = await admin
    .from("show_bookings")
    .select(
      "id,business_id,booking_ref,guest_name,extras_snapshot,show_name,show_date,ampm,adults,children,infants,hotel_name,transport_required,pickup_kind,private_zone,pickup_stop_name,pickup_time,cancelled_at,arrived_at,ticket_token",
    )
    .eq("ticket_token", token)
    .maybeSingle();

  if (!booking) {
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-6 text-center">
        <h1 className="text-xl font-semibold text-slate-900">Ticket not found</h1>
        <p className="mt-2 text-sm text-slate-600">This link is invalid or has expired. Ask the office to re-send your ticket.</p>
      </main>
    );
  }

  const { data: biz } = await admin
    .from("businesses")
    .select("name,show_ops_display_name,show_ops_logo_url,logo_url,show_ops_config")
    .eq("id", booking.business_id)
    .maybeSingle();
  const branding = brandingFromBusiness(biz ?? {});
  const productLabel = parseShowOpsConfig(biz?.show_ops_config).product_label;
  const ticketUrl = showOpsTicketUrl(getDeploymentSiteUrl(), booking.ticket_token);
  const qr = await showOpsTicketQrSvg(ticketUrl);
  const day = showOpsDayName(booking.show_date);
  const pax = formatShowOpsPax(booking.adults, booking.children, booking.infants);
  const isPrivate = !booking.transport_required && pickupKindFromBooking(booking) === "private";
  const pickup =
    booking.transport_required && booking.pickup_stop_name
      ? `${booking.pickup_stop_name}${booking.pickup_time ? ` · ${String(booking.pickup_time).slice(0, 5)}` : ""}`
      : booking.transport_required
        ? "Pick-up to be confirmed"
        : isPrivate
          ? privateTransferLine(booking.private_zone || parsePrivatePickupLabel(booking.pickup_stop_name)?.zone)
          : "Making your own way";
  const showTime = booking.ampm === "AM" ? "Morning show" : booking.ampm === "PM" ? "Evening show" : null;

  if (booking.cancelled_at) {
    return (
      <main className="mx-auto max-w-md px-6 py-16 text-center">
        <p className="text-sm font-semibold text-rose-800">{branding.displayName}</p>
        <h1 className="mt-2 text-xl font-semibold text-slate-900">This booking is cancelled</h1>
        <p className="mt-2 text-sm text-slate-600">Ref {booking.booking_ref}. Contact the office if you need help.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-5 py-10">
      <p className="text-center text-sm font-semibold text-slate-500">{branding.displayName}</p>
      <h1 className="mt-1 text-center text-2xl font-semibold tracking-tight text-slate-900">{booking.show_name}</h1>
      <p className="mt-1 text-center text-sm text-slate-600">
        {day ? `${day} · ` : ""}
        {booking.show_date}
        {showTime ? ` · ${showTime}` : ""}
      </p>
      <div
        className="mx-auto mt-6 w-56 [&_svg]:h-full [&_svg]:w-full"
        aria-hidden
        dangerouslySetInnerHTML={{ __html: qr }}
      />
      <p className="mt-2 text-center text-xs text-slate-500">
        {booking.transport_required ? "Show this QR at the door and on the bus" : "Show this QR at the door"}
      </p>
      <dl className="mt-8 space-y-3 rounded-2xl bg-white p-5 text-sm ring-1 ring-slate-200">
        <Row label="Name" value={booking.guest_name} />
        <Row label="Guests" value={pax} />
        <Row label={productLabel} value={booking.show_name} />
        {bookingExtrasSummary(booking.extras_snapshot) ? <Row label="Extras" value={bookingExtrasSummary(booking.extras_snapshot)} /> : null}
        {showTime ? <Row label="Show time" value={showTime} /> : null}
        {booking.hotel_name ? <Row label="Hotel" value={booking.hotel_name} /> : null}
        <Row label="Bus / pick-up" value={pickup} />
        <Row label="Ref" value={booking.booking_ref} />
      </dl>
      {booking.arrived_at ? (
        <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-center text-sm font-medium text-emerald-900">
          Checked in
        </p>
      ) : null}
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-semibold text-slate-900">{value}</dd>
    </div>
  );
}
