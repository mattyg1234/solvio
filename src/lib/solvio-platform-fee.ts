/**
 * Per-tenant platform fee on guest booking payments.
 *
 * Each business carries its own platform_fee_bps (basis points: 500 = 5%).
 * Default for new businesses on the trial tier is 5%. Higher tiers pay less:
 *   Pro:      250 bps (2.5%)
 *   Business: 150 bps (1.5%)
 *   Scale:    100 bps (1.0%)
 *   Enterprise: negotiated per deal
 *
 * Always read the bps from the business row — never assume 5%.
 */

export const DEFAULT_PLATFORM_FEE_BPS = 500;

export type SubscriptionTier = "trial" | "pro" | "business" | "scale" | "enterprise";

export const TIER_DEFAULTS: Record<
  SubscriptionTier,
  { feeBps: number; monthlyAiMinutes: number; includedLocations: number; monthlyPriceEur: number }
> = {
  trial:      { feeBps: 500, monthlyAiMinutes: 50,    includedLocations: 1, monthlyPriceEur: 0 },
  pro:        { feeBps: 250, monthlyAiMinutes: 300,   includedLocations: 1, monthlyPriceEur: 79 },
  business:   { feeBps: 150, monthlyAiMinutes: 1000,  includedLocations: 3, monthlyPriceEur: 199 },
  scale:      { feeBps: 100, monthlyAiMinutes: 3000,  includedLocations: 999, monthlyPriceEur: 399 },
  enterprise: { feeBps: 50,  monthlyAiMinutes: 10000, includedLocations: 999, monthlyPriceEur: 0 },
};

/**
 * Compute the platform fee cents using the business's configured bps,
 * with a safe fallback to 5% if the row is missing or pre-migration.
 */
export function computeSolvioPlatformFeeCents(
  amountCents: number,
  feeBps: number = DEFAULT_PLATFORM_FEE_BPS,
): number {
  const amount = Math.max(0, Math.floor(amountCents));
  if (amount < 50) return 0;
  const bps = Math.max(0, Math.min(10_000, Math.floor(feeBps)));
  const fee = Math.floor((amount * bps) / 10_000);
  if (fee < 1) return 0;
  return Math.min(fee, amount - 1);
}

export function computeMerchantNetCents(
  amountCents: number,
  feeBps: number = DEFAULT_PLATFORM_FEE_BPS,
): number {
  const amount = Math.max(0, Math.floor(amountCents));
  return amount - computeSolvioPlatformFeeCents(amount, feeBps);
}

export function platformFeeLabel(feeBps: number = DEFAULT_PLATFORM_FEE_BPS): string {
  return `${(feeBps / 100).toFixed(feeBps % 100 === 0 ? 0 : 1)}%`;
}

/** Legacy alias for callers that haven't been updated yet. */
export const SOLVIO_BOOKING_PLATFORM_FEE_BPS = DEFAULT_PLATFORM_FEE_BPS;
export const solvioBookingPlatformFeeLabel = () => platformFeeLabel(DEFAULT_PLATFORM_FEE_BPS);
