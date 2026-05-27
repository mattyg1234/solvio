import { NextResponse } from "next/server";

/** Signup confirm emails land here; after PKCE exchange, send new merchants to onboarding. */
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
  target.searchParams.set("next", "/dashboard/onboarding");
  return NextResponse.redirect(target);
}
