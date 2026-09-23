import { requireShowOpsEnabled } from "@/lib/show-ops/access";
import { showOpsCurrencyFor } from "@/lib/show-ops/config";
import { buildGuestConfirmationPdf, confirmationAvailableFor, loadConfirmationTemplate } from "@/lib/show-ops/confirmation-pdf";
import { canSeeShowOpsPage } from "@/lib/show-ops/nav";
import { showOpsTicketUrl } from "@/lib/show-ops/ticket-token";
import { getDeploymentSiteUrl } from "@/lib/deployment-site-url";

export const runtime = "nodejs";
const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

/** Ruth's printed guest confirmation for one booking (Tenerife and Lanzarote). Opens inline so the office can print it. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireShowOpsEnabled();
  if (!canSeeShowOpsPage(ctx.role, ctx.allowedPages, "bookings")) {
    return new Response("Bookings access is required.", { status: 403, headers: privateHeaders });
  }
  const { id } = await params;
  const { data: b } = await ctx.supabase
    .from("show_bookings")
    .select(
      "id,booking_ref,guest_name,show_name,show_date,island,adults,children,infants,hotel_name,transport_required,pickup_kind,pickup_stop_name,pickup_time,private_zone,dietary_required,dietary_notes,billing_mode,total_cost,balance_remaining,cancelled_at,ticket_token",
    )
    .eq("id", id)
    .eq("business_id", ctx.business.id)
    .maybeSingle();
  if (!b) return new Response("Booking not found.", { status: 404, headers: privateHeaders });
  if (b.cancelled_at) return new Response("This booking is cancelled.", { status: 400, headers: privateHeaders });
  if (!confirmationAvailableFor(b.island)) {
    return new Response("The printed confirmation is for Tenerife and Lanzarote bookings.", { status: 400, headers: privateHeaders });
  }
  try {
    const bytes = await buildGuestConfirmationPdf(await loadConfirmationTemplate(), {
      bookingRef: b.booking_ref,
      guestName: b.guest_name,
      showName: b.show_name,
      showDate: String(b.show_date),
      adults: Number(b.adults) || 0,
      children: Number(b.children) || 0,
      infants: Number(b.infants) || 0,
      hotelName: b.hotel_name,
      transportRequired: Boolean(b.transport_required),
      pickupKind: b.pickup_kind,
      pickupStopName: b.pickup_stop_name,
      pickupTime: b.pickup_time ? String(b.pickup_time) : null,
      privateZone: b.private_zone,
      dietaryNotes: b.dietary_required ? b.dietary_notes : null,
      billingMode: String(b.billing_mode ?? "deposit"),
      totalCost: b.total_cost == null ? null : Number(b.total_cost),
      balanceRemaining: b.balance_remaining == null ? null : Number(b.balance_remaining),
      currency: showOpsCurrencyFor(ctx.config, b.island),
      ticketUrl: b.ticket_token ? showOpsTicketUrl(getDeploymentSiteUrl(), String(b.ticket_token)) : null,
    });
    return new Response(Buffer.from(bytes), {
      headers: { ...privateHeaders, "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="confirmation-${b.booking_ref}.pdf"` },
    });
  } catch (error) {
    console.error("[confirmation-pdf] failed for", b.booking_ref, error instanceof Error ? error.message : error);
    return new Response("Could not prepare the confirmation.", { status: 500, headers: privateHeaders });
  }
}
