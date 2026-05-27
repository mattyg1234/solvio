import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { exchangeAuthCode } from "@/lib/supabase/auth-email-exchange";

/** Legacy PKCE callback — prefer /auth/confirm with token_hash email templates. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const nextPath = url.searchParams.get("next") ?? "/dashboard";
  const origin = url.origin;

  if (!code) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("Missing confirmation code — open the latest email link.")}`,
    );
  }

  const result = await exchangeAuthCode(code, type, nextPath, origin);
  return "errorRedirect" in result ? result.errorRedirect : result.response;
}
