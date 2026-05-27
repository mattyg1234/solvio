import { type EmailOtpType } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type AuthExchangeResult = { response: NextResponse } | { errorRedirect: NextResponse };

function loginErrorRedirect(origin: string, message: string): NextResponse {
  return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(message)}`);
}

function destinationAfterAuth(type: EmailOtpType | null, origin: string, nextPath: string | null): string {
  if (type === "recovery") {
    return `${origin}/dashboard/settings?password=reset`;
  }
  if (type === "signup" || type === "email") {
    return `${origin}/dashboard/onboarding`;
  }
  if (nextPath && nextPath.startsWith("/")) {
    return `${origin}${nextPath}`;
  }
  return `${origin}/dashboard`;
}

/** Server-side email auth — works when the user opens the link on a different device than signup/reset. */
export async function verifyEmailTokenHash(
  tokenHash: string,
  type: EmailOtpType,
  nextPath: string | null,
  origin: string,
): Promise<AuthExchangeResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return { errorRedirect: loginErrorRedirect(origin, "Server missing Supabase env configuration.") };
  }

  const cookieStore = await cookies();
  const redirectTarget = destinationAfterAuth(type, origin, nextPath);
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
    return { errorRedirect: loginErrorRedirect(origin, error.message) };
  }

  return { response };
}

/** PKCE code exchange — only works if the user opens the link in the same browser that started the flow. */
export async function exchangeAuthCode(
  code: string,
  type: EmailOtpType | null,
  nextPath: string | null,
  origin: string,
): Promise<AuthExchangeResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return { errorRedirect: loginErrorRedirect(origin, "Server missing Supabase env configuration.") };
  }

  const cookieStore = await cookies();
  const redirectTarget = destinationAfterAuth(type, origin, nextPath);
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

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const pkceHint =
      error.message.includes("PKCE") || error.message.includes("code verifier")
        ? " Open the email link in the same browser where you signed up or clicked Forgot password — or update Supabase email templates to use token links (see docs/solvio-launch-checklist.md)."
        : "";
    return { errorRedirect: loginErrorRedirect(origin, `${error.message}${pkceHint}`) };
  }

  return { response };
}
