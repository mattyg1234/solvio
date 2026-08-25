import { isValidE164Phone, normalizePhoneE164WithFallbacks } from "@/lib/normalize-phone";

/** Owner mobile from onboarding — stored on businesses.booking_flow_details. */
export function merchantNotifyPhoneFromDetails(bookingFlowDetails: unknown): string | null {
  if (!bookingFlowDetails || typeof bookingFlowDetails !== "object" || Array.isArray(bookingFlowDetails)) {
    return null;
  }
  const profile = (bookingFlowDetails as Record<string, unknown>).merchant_onboarding_profile;
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) return null;
  const raw = (profile as Record<string, unknown>).phone;
  if (typeof raw !== "string" || !raw.trim()) return null;
  const e164 = normalizePhoneE164WithFallbacks(raw.trim());
  return isValidE164Phone(e164) ? e164 : null;
}
