import { paymentStatusAfter, round2 } from "@/lib/show-ops/calc";
import { paidOnBooking } from "@/lib/show-ops/booking-paid";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

/** Idempotent: unique on stripe_checkout_session_id. Used by Stripe webhook. */
export async function applyShowOpsStripePayment(args: {
  businessId: string;
  bookingId: string;
  amount: number;
  stripeCheckoutSessionId: string;
}): Promise<void> {
  const admin = createSupabaseServiceRoleClient();
  const sessionId = args.stripeCheckoutSessionId.trim();
  if (!sessionId) return;

  const { data: existing } = await admin
    .from("show_booking_payments")
    .select("id")
    .eq("stripe_checkout_session_id", sessionId)
    .maybeSingle();
  if (existing) return;

  const { data: booking } = await admin
    .from("show_bookings")
    .select("id,total_cost,balance_remaining,business_id,cancelled_at")
    .eq("id", args.bookingId)
    .eq("business_id", args.businessId)
    .maybeSingle();
  if (!booking) return;
  if (booking.cancelled_at) return;

  const amount = round2(args.amount);
  if (amount <= 0) return;

  const { error: payErr } = await admin.from("show_booking_payments").insert({
    business_id: args.businessId,
    booking_id: args.bookingId,
    amount,
    method: "stripe",
    stripe_checkout_session_id: sessionId,
  });
  if (payErr) {
    if (payErr.code === "23505") return;
    throw payErr;
  }

  const { balance, payment_status } = paymentStatusAfter(
    Number(booking.total_cost),
    await paidOnBooking(admin, booking),
  );

  await admin
    .from("show_bookings")
    .update({
      balance_remaining: balance,
      payment_status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", args.bookingId)
    .eq("business_id", args.businessId);

  try {
    const { sendGuestTicketByBookingId } = await import("@/lib/notifications/show-ops-guest-ticket");
    await sendGuestTicketByBookingId(args.bookingId);
  } catch (e) {
    console.error("[show-ops] ticket after Stripe payment failed", e);
  }
}
