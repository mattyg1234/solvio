import { NextResponse } from "next/server";

/** Password reset emails land here; after PKCE exchange, send merchant to set a new password. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const origin = url.origin;

  if (!code) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("Missing confirmation code — open the latest email link.")}`,
    );
  }

  const target = new URL(`${origin}/auth/callback`);
  target.searchParams.set("code", code);
  target.searchParams.set("next", "/dashboard/settings?password=reset");
  return NextResponse.redirect(target);
}
