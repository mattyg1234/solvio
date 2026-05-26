/** Dashboard paths merchants may visit before `onboarding_completed_at` is set. */
export const ONBOARDING_ALLOWED_PATH_PREFIXES = [
  "/dashboard/onboarding",
  "/dashboard/setup/bookings",
  "/dashboard/setup/voice",
  "/dashboard/payments",
  "/dashboard/settings",
  "/dashboard/bookings",
  "/dashboard/pricing",
] as const;

export function isPathAllowedDuringOnboarding(pathname: string): boolean {
  return ONBOARDING_ALLOWED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
