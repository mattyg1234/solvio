import { stripeClient } from "@/lib/stripe-client";
import { computeSolvioPlatformFeeCents, DEFAULT_PLATFORM_FEE_BPS } from "@/lib/solvio-platform-fee";
import { getSiteUrl } from "@/lib/site-url";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { showOpsAmountToCents } from "@/lib/show-ops/calc";
import type { ShowOpsCurrency } from "@/lib/show-ops/types";

export async function createShowOpsDepositCheckoutSession(args: {
  businessId: string;
  connectAccountId: string;
  bookingId: string;
  bookingRef: string;
  guestEmail: string;
  guestName: string;
  showName: string;
  showDate: string;
  amount: number;
  dueKind?: "deposit" | "balance" | "none";
  currency: ShowOpsCurrency;
  merchantName: string;
}): Promise<string | null> {
  const stripe = stripeClient();
  if (!stripe) return null;

  const amountCents = showOpsAmountToCents(args.amount);
  if (amountCents < 50) return null;

  const siteUrl = (await getSiteUrl()).replace(/\/$/, "");
  const supabase = createSupabaseServiceRoleClient();
  const { data: businessRow } = await supabase
    .from("businesses")
    .select("platform_fee_bps")
    .eq("id", args.businessId)
    .maybeSingle();
  const feeBps =
    typeof businessRow?.platform_fee_bps === "number"
      ? businessRow.platform_fee_bps
      : DEFAULT_PLATFORM_FEE_BPS;
  const platformFeeCents = computeSolvioPlatformFeeCents(amountCents, feeBps);

  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      customer_email: args.guestEmail.trim() || undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: args.currency,
            unit_amount: amountCents,
            product_data: {
              name: `${args.merchantName} · ${args.showName} · ${args.bookingRef}`.slice(0, 120),
              description: `${args.dueKind === "deposit" ? "Deposit" : "Balance"} for ${args.guestName} · ${args.showDate}`,
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
        solvio_kind: "show_ops_deposit",
        solvio_show_booking_id: args.bookingId,
        solvio_business_id: args.businessId,
        solvio_booking_ref: args.bookingRef,
        solvio_platform_fee_cents: String(platformFeeCents),
      },
      success_url: `${siteUrl}/pay/show-ops/success?ref=${encodeURIComponent(args.bookingRef)}`,
      cancel_url: `${siteUrl}/pay/show-ops/cancel?ref=${encodeURIComponent(args.bookingRef)}`,
    },
    { stripeAccount: args.connectAccountId },
  );

  return session.url ?? null;
}
