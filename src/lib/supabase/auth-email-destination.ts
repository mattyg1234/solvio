import type { EmailOtpType } from "@supabase/supabase-js";

export function destinationAfterAuth(type: EmailOtpType | null, origin: string, nextPath: string | null): string {
  if (type === "recovery") return `${origin}/dashboard/settings?password=reset`;
  // Provider-created partner accounts can use a signup token on their first invitation.
  if ((type === "signup" || type === "email" || type === "magiclink") && nextPath === "/partner/password") {
    return `${origin}/partner/password`;
  }
  if (type === "signup" || type === "email") return `${origin}/dashboard/onboarding`;
  if (nextPath?.startsWith("/") && !nextPath.startsWith("//") && !/[\\\u0000-\u001f\u007f]/.test(nextPath)) {
    return `${origin}${nextPath}`;
  }
  return `${origin}/dashboard`;
}
