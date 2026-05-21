import { stripeClient } from "@/lib/stripe-client";
import { computeSolvioPlatformFeeCents, DEFAULT_PLATFORM_FEE_BPS } from "@/lib/solvio-platform-fee";
import { getSiteUrl } from "@/lib/site-url";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export async function createBookingDepositCheckoutSession(args: {
  bookingRequestId?: string;
  venueCalendarBookingId?: string;
  businessId: string;
  connectAccountId: string;
  amountCents: number;
  guestEmail: string;
  description: string;
  slug: string;
}): Promise<string | null> {
  const stripe = stripeClient();
  if (!stripe) return null;

  const bookingRequestId = args.bookingRequestId?.trim() || "";
  const venueCalendarBookingId = args.venueCalendarBookingId?.trim() || "";
  if (!bookingRequestId && !venueCalendarBookingId) return null;

  const siteUrl = (await getSiteUrl()).replace(/\/$/, "");
  const amount = Math.max(50, Math.floor(args.amountCents));

  // Read the per-tenant fee bps. Falls back to default if column missing (pre-migration).
  const supabaseForLookup = createSupabaseServiceRoleClient();
  const { data: businessRow } = await supabaseForLookup
    .from("businesses")
    .select("platform_fee_bps")
    .eq("id", args.businessId)
    .maybeSingle();
  const feeBps =
    typeof businessRow?.platform_fee_bps === "number"
      ? businessRow.platform_fee_bps
      : DEFAULT_PLATFORM_FEE_BPS;

  const platformFeeCents = computeSolvioPlatformFeeCents(amount, feeBps);

  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      customer_email: args.guestEmail.trim() || undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "eur",
            unit_amount: amount,
            product_data: {
              name: args.description.slice(0, 120) || "Table deposit",
            },
          },
        },
      ],
      payment_intent_data:
        platformFeeCents > 0
          ? {
              application_fee_amount: platformFeeCents,
            }
          : undefined,
      metadata: {
        ...(bookingRequestId ? { solvio_booking_request_id: bookingRequestId } : {}),
        ...(venueCalendarBookingId ? { solvio_venue_calendar_booking_id: venueCalendarBookingId } : {}),
        solvio_business_id: args.businessId,
        solvio_booking_slug: args.slug,
        solvio_platform_fee_cents: String(platformFeeCents),
      },
      success_url: `${siteUrl}/book/${encodeURIComponent(args.slug)}?deposit=success`,
      cancel_url: `${siteUrl}/book/${encodeURIComponent(args.slug)}?deposit=cancel`,
    },
    { stripeAccount: args.connectAccountId },
  );

  if (!session.url) return null;

  const supabase = createSupabaseServiceRoleClient();
  if (bookingRequestId) {
    await supabase
      .from("booking_requests")
      .update({
        payment_status: "pending",
        stripe_checkout_session_id: session.id,
        deposit_amount_cents: amount,
      })
      .eq("id", bookingRequestId)
      .eq("business_id", args.businessId);
  }

  return session.url;
}
