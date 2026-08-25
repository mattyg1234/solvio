import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { isStaleAuthSessionError } from "@/lib/supabase/auth-errors";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isProtected =
    pathname.startsWith("/dashboard") || pathname.startsWith("/admin") || pathname.startsWith("/partner");

  if (error && isStaleAuthSessionError(error.message)) {
    const clearingClient = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    });
    await clearingClient.auth.signOut();

    if (isProtected) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set("error", "Your session expired — please sign in again.");
      return NextResponse.redirect(loginUrl);
    }

    return supabaseResponse;
  }

  if (!user && (pathname.startsWith("/dashboard") || pathname.startsWith("/partner"))) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = pathname.startsWith("/partner") ? "?next=/partner" : "";
    return NextResponse.redirect(loginUrl);
  }

  // White-label Show Ops: pass custom host through for tenant branding / future rewrite.
  const host = request.headers.get("host")?.split(":")[0]?.toLowerCase() ?? "";
  if (
    host &&
    !host.endsWith(".vercel.app") &&
    host !== "localhost" &&
    !host.startsWith("127.0.0.1") &&
    host !== "www.solviosystems.com" &&
    host !== "solviosystems.com"
  ) {
    supabaseResponse.headers.set("x-solvio-custom-host", host);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
