/** Shared pricing constants — keep dashboard copy and Stripe checkout in sync. */

export const BOOKING_TRIAL_DAYS = 7;
export const BOOKING_MONTHLY_GBP = 50;
export const BOOKING_DEMO_AI_MINUTES = 10;

export const PRO_MONTHLY_GBP = 150;
export const PRO_ANNUAL_GBP = Math.round(PRO_MONTHLY_GBP * 12 * 0.9); // 10% off annual prepay

export const SCALE_MONTHLY_GBP = 499;

export const TRIAL_AI_MINUTES = 50;
export const PRO_AI_MINUTES = 1000;
export const SCALE_AI_MINUTES = 3000;

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
