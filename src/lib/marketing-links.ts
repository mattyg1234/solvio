/** Public marketing URLs — override demo slug via env on production. */

export function bookingDemoSlug(): string {
  return process.env.NEXT_PUBLIC_BOOKING_DEMO_SLUG?.trim() || "solvio-d67c90cc";
}

export function bookingDemoHref(): string {
  return `/book/${encodeURIComponent(bookingDemoSlug())}`;
}
