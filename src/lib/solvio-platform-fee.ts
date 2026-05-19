/** Solvio platform fee on guest booking payments (5% = 500 basis points). */
export const SOLVIO_BOOKING_PLATFORM_FEE_BPS = 500;

export function computeSolvioPlatformFeeCents(amountCents: number): number {
  const amount = Math.max(0, Math.floor(amountCents));
  if (amount < 50) return 0;
  const fee = Math.floor((amount * SOLVIO_BOOKING_PLATFORM_FEE_BPS) / 10_000);
  if (fee < 1) return 0;
  return Math.min(fee, amount - 1);
}

export function computeMerchantNetCents(amountCents: number): number {
  const amount = Math.max(0, Math.floor(amountCents));
  return amount - computeSolvioPlatformFeeCents(amount);
}

export function solvioBookingPlatformFeeLabel(): string {
  return `${SOLVIO_BOOKING_PLATFORM_FEE_BPS / 100}%`;
}
