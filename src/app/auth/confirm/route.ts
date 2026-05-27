import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { exchangeAuthCode, verifyEmailTokenHash } from "@/lib/supabase/auth-email-exchange";

/**
 * Primary email auth route — use token_hash links in Supabase email templates (works cross-device).
 * Also accepts PKCE ?code= when the user opens the link in the same browser.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const code = url.searchParams.get("code");
  const nextPath = url.searchParams.get("next");

  if (tokenHash && type) {
    const result = await verifyEmailTokenHash(tokenHash, type, nextPath, origin);
    return "errorRedirect" in result ? result.errorRedirect : result.response;
  }

  if (code) {
    const result = await exchangeAuthCode(code, type, nextPath, origin);
    return "errorRedirect" in result ? result.errorRedirect : result.response;
  }

  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent("Invalid confirmation link — request a new email.")}`,
  );
}
