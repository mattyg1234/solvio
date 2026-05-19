import { stripeClient } from "@/lib/stripe-client";
import { computeSolvioPlatformFeeCents } from "@/lib/solvio-platform-fee";
import { getSiteUrl } from "@/lib/site-url";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export async function createBookingDepositCheckoutSession(args: {
  bookingRequestId: string;
  businessId: string;
  connectAccountId: string;
  amountCents: number;
  guestEmail: string;
  description: string;
  slug: string;
}): Promise<string | null> {
  const stripe = stripeClient();
  if (!stripe) return null;

  const siteUrl = (await getSiteUrl()).replace(/\/$/, "");
  const amount = Math.max(50, Math.floor(args.amountCents));
  const platformFeeCents = computeSolvioPlatformFeeCents(amount);

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
        solvio_booking_request_id: args.bookingRequestId,
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
  await supabase
    .from("booking_requests")
    .update({
      payment_status: "pending",
      stripe_checkout_session_id: session.id,
      deposit_amount_cents: amount,
    })
    .eq("id", args.bookingRequestId)
    .eq("business_id", args.businessId);

  return session.url;
}
