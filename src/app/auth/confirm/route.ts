import { type EmailOtpType } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

/**
 * Handles Supabase email links that use token_hash (default templates) instead of PKCE ?code=.
 * Redirect URLs in Dashboard must include https://www.solviosystems.com/auth/confirm
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const nextPath = url.searchParams.get("next") ?? "/dashboard/onboarding";
  const origin = url.origin;

  const destinationPath = nextPath.startsWith("/") ? nextPath : `/${nextPath}`;
  const redirectTarget = `${origin}${destinationPath}`;

  if (!tokenHash || !type) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("Invalid confirmation link — request a new email.")}`,
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("Server missing Supabase env configuration.")}`,
    );
  }

  const cookieStore = await cookies();
  const response = NextResponse.redirect(redirectTarget);

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
  }

  if (type === "recovery") {
    return NextResponse.redirect(`${origin}/dashboard/settings?password=reset`);
  }

  return response;
}
