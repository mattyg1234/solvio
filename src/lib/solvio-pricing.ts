/** Shared pricing constants — keep dashboard copy and Stripe checkout in sync. */

export const BOOKING_TRIAL_DAYS = 7;

/** Plan prices (GBP / month). */
export const BOOKING_MONTHLY_GBP = 50;
export const PRO_MONTHLY_GBP = 150;
export const ENTERPRISE_MONTHLY_GBP = 399;

/** @deprecated Use ENTERPRISE_MONTHLY_GBP — Stripe plan tier id remains `scale`. */
export const SCALE_MONTHLY_GBP = ENTERPRISE_MONTHLY_GBP;

export const PRO_ANNUAL_GBP = Math.round(PRO_MONTHLY_GBP * 12 * 0.9); // 10% off annual prepay
export const ENTERPRISE_ANNUAL_GBP = Math.round(ENTERPRISE_MONTHLY_GBP * 12 * 0.9);

/** Included AI receptionist minutes per month (billable voice). */
export const BOOKING_DEMO_AI_MINUTES = 10;
export const TRIAL_AI_MINUTES = 50;
/** Pro — limited monthly cap to keep margin at £150/mo. */
export const PRO_AI_MINUTES = 300;
/** Enterprise — high-volume operators (Stripe tier id: `scale`). ~£0.20/min at full use leaves healthy margin on £399/mo. */
export const ENTERPRISE_AI_MINUTES = 1500;

/** @deprecated Use ENTERPRISE_AI_MINUTES */
export const SCALE_AI_MINUTES = ENTERPRISE_AI_MINUTES;

/** Overage when included minutes are exhausted. */
export const PRO_AI_OVERAGE_GBP = 0.4;
export const ENTERPRISE_AI_OVERAGE_GBP = 0.3;

/** Platform fee on guest deposits (basis points: 500 = 5%). */
export const BOOKING_PLATFORM_FEE_BPS = 500;
export const PRO_PLATFORM_FEE_BPS = 250;
export const ENTERPRISE_PLATFORM_FEE_BPS = 100;

/** Platform fee on guest deposits during the free trial (1000 = 10%). */
export const TRIAL_PLATFORM_FEE_BPS = 1000;

/** Short tagline for header / badges — e.g. "7-day free trial". */
export function trialHeaderTagline(): string {
  return `${BOOKING_TRIAL_DAYS}-day free trial`;
}

/** Shared trial copy — marketing, signup, and dashboard should match. */
export function trialExploreLine(): string {
  return `${BOOKING_TRIAL_DAYS}-day free trial — add your card to get started. You won't be charged until the trial ends; £${BOOKING_MONTHLY_GBP}/mo after that unless you cancel.`;
}

/** One-line deposit payout copy for marketing (no Stripe brand on homepage). */
export function guestDepositPayoutLine(): string {
  return `Guest deposits go to your payout account. Solvio keeps a platform fee (${TRIAL_PLATFORM_FEE_BPS / 100}% during trial, ${BOOKING_PLATFORM_FEE_BPS / 100}% on Booking, ${PRO_PLATFORM_FEE_BPS / 100}% on Pro, ${ENTERPRISE_PLATFORM_FEE_BPS / 100}% on Enterprise) — always shown before guests pay.`;
}

/** Free trial window before a paid Booking subscription is required. */
export function trialEndsAt(createdAtIso: string): Date {
  const start = new Date(createdAtIso);
  if (Number.isNaN(start.getTime())) return new Date();
  return new Date(start.getTime() + BOOKING_TRIAL_DAYS * 24 * 60 * 60 * 1000);
}

export function trialDaysRemaining(createdAtIso: string, now = new Date()): number {
  const end = trialEndsAt(createdAtIso);
  const ms = end.getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

export function isTrialExpired(createdAtIso: string, now = new Date()): boolean {
  return now.getTime() >= trialEndsAt(createdAtIso).getTime();
}

/** Stripe trial days when starting Booking — matches remaining free trial, not a second week. */
export function bookingStripeTrialDays(createdAtIso: string, now = new Date()): number | undefined {
  if (isTrialExpired(createdAtIso, now)) return undefined;
  const remaining = trialDaysRemaining(createdAtIso, now);
  return remaining > 0 ? remaining : undefined;
}

export function formatTrialEndDate(createdAtIso: string, locale = "en-GB"): string {
  return trialEndsAt(createdAtIso).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
