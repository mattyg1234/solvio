import { stripeClient } from "@/lib/stripe-client";

/** True when Stripe confirms a paid checkout session for this public booking slug. */
export async function verifyBookingDepositReturn(args: {
  sessionId: string;
  slug: string;
}): Promise<{ ok: true; bookingKind: string | null } | { ok: false }> {
  const sessionId = args.sessionId.trim();
  const slug = args.slug.trim();
  if (!sessionId || !slug) return { ok: false };

  const stripe = stripeClient();
  if (!stripe) return { ok: false };

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== "paid") return { ok: false };
    const metaSlug = session.metadata?.solvio_booking_slug?.trim();
    if (metaSlug !== slug) return { ok: false };
    const bookingKind = session.metadata?.solvio_checkout_kind?.trim() || null;
    return { ok: true, bookingKind };
  } catch {
    return { ok: false };
  }
}
