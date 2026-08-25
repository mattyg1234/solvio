/**
 * Pricing for dedicated phone numbers that Solvio customers buy.
 *
 * Numbers are provisioned on Solvio's own Twilio account; the customer is billed
 * a flat monthly price that sits ABOVE Twilio's wholesale carrier cost (~£1/mo),
 * so the spread is Solvio's margin.
 */

/** What the customer pays per number, per month, in GBP. */
export const PHONE_NUMBER_MONTHLY_GBP = 5;

/** Same figure in minor units (pence) for Stripe. */
export const PHONE_NUMBER_MONTHLY_PENCE = PHONE_NUMBER_MONTHLY_GBP * 100;

/** Stripe recurring price id for the phone-number add-on. */
export function phoneNumberPriceId(): string | undefined {
  return process.env.STRIPE_PRICE_PHONE_NUMBER?.trim() || undefined;
}

export const PHONE_NUMBER_PRICE_LABEL = `£${PHONE_NUMBER_MONTHLY_GBP}/month`;
