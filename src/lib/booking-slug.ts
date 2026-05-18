/** URL segment for /book/[slug] — lowercase letters, digits, hyphens. */
export const BOOKING_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidBookingSlug(s: string): boolean {
  const t = s.trim().toLowerCase();
  return t.length >= 3 && t.length <= 48 && BOOKING_SLUG_REGEX.test(t);
}

export function suggestBookingSlug(businessName: string, businessId: string): string {
  let base = businessName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (base.length < 2) {
    base = "book";
  }
  const short = businessId.replace(/-/g, "").slice(0, 8);
  return `${base}-${short}`;
}
