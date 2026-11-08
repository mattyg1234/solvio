/**
 * Two-step login (Joel, 8 Nov 2026). Once someone has switched on an
 * authenticator app (a verified TOTP factor), every Hub page asks for the
 * 6-digit code after the password until the session is upgraded to aal2.
 *
 * Required for staff (Matty, 8 Nov 2026): anyone opening /dashboard or /admin
 * without an authenticator is sent to set one up first. Partner logins
 * (/partner) stay optional. HUB_TWO_STEP_REQUIRED=0 switches the requirement
 * off again without a deploy of new code.
 */

export const TWO_STEP_PATH = "/login/two-step";
export const TWO_STEP_SETUP_PATH = "/login/two-step/setup";

/** Staff pages need two-step login; the partner area does not. */
export function twoStepRequiredFor(pathname: string, flag: string | null | undefined = process.env.HUB_TWO_STEP_REQUIRED): boolean {
  if (String(flag ?? "").trim() === "0") return false;
  return pathname.startsWith("/dashboard") || pathname.startsWith("/admin");
}

/** True when two-step is required here and the user has not set up an authenticator yet. */
export function needsTwoStepSetup(factors: FactorLike[] | null | undefined, pathname: string, flag?: string | null): boolean {
  if (!twoStepRequiredFor(pathname, flag === undefined ? process.env.HUB_TWO_STEP_REQUIRED : flag)) return false;
  return !(factors ?? []).some((f) => f.status === "verified");
}

type FactorLike = { status?: string | null; factor_type?: string | null };

/** Reads the "aal" claim from a Supabase access token without verifying it (the middleware already verified the user). */
export function accessTokenAal(accessToken: string | null | undefined): string | null {
  if (!accessToken) return null;
  const part = accessToken.split(".")[1];
  if (!part) return null;
  try {
    // atob, not Buffer: this runs in the middleware (edge runtime).
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4))) as {
      aal?: string;
    };
    return typeof json.aal === "string" ? json.aal : null;
  } catch {
    return null;
  }
}

/** True when the user has a working authenticator but this session has not entered its code yet. */
export function needsSecondStep(factors: FactorLike[] | null | undefined, accessToken: string | null | undefined): boolean {
  const hasVerified = (factors ?? []).some((f) => f.status === "verified");
  if (!hasVerified) return false;
  return accessTokenAal(accessToken) !== "aal2";
}

/** Where to go after the code: only back into the Hub or partner area. */
export function safeTwoStepNext(raw: string | null | undefined): string {
  const v = String(raw ?? "");
  if (!v.startsWith("/") || v.startsWith("//") || v.includes("\\")) return "/dashboard";
  if (v.startsWith("/dashboard") || v.startsWith("/partner") || v.startsWith("/admin")) return v;
  return "/dashboard";
}
