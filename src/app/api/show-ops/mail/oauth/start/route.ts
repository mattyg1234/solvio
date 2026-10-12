import { NextResponse, type NextRequest } from "next/server";

import {
  EMAIL_BOOKINGS_PATH,
  mailRedirectUri,
  mailSiteOrigin,
  newOAuthState,
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_COOKIE_PATH,
  OAUTH_STATE_MAX_AGE_S,
  sha256,
} from "@/lib/show-ops/email-bookings/connection";
import { describeMailError, mailGate } from "@/lib/show-ops/email-bookings/gate";
import { gmailConfigured, googleAuthUrl } from "@/lib/show-ops/email-bookings/gmail";
import { secretsKeyConfigured } from "@/lib/show-ops/secrets";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Sends the browser to Google to allow read-only access to the business bookings inbox. */
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const back = (error: string) => NextResponse.redirect(new URL(`${EMAIL_BOOKINGS_PATH}?error=${error}`, origin));

  // Google returns to the site URL, so the state cookie (and the sign-in) must belong to that host too.
  const site = new URL(mailSiteOrigin(origin));
  if (req.nextUrl.host !== site.host) {
    return NextResponse.redirect(new URL(`${req.nextUrl.pathname}${req.nextUrl.search}`, site));
  }
  if (!gmailConfigured()) return back("config");
  if (!secretsKeyConfigured()) return back("secrets");

  const gate = await mailGate("office");
  if ("error" in gate) return back("not_allowed");
  const { ctx } = gate;

  try {
    const state = newOAuthState();
    // Build the Google URL first so missing settings fail before anything is stored.
    const url = googleAuthUrl(state, mailRedirectUri(origin));
    const admin = createSupabaseServiceRoleClient();
    await admin.from("show_email_booking_oauth_states").delete().lt("created_at", new Date(Date.now() - 3600_000).toISOString());
    const { error } = await admin
      .from("show_email_booking_oauth_states")
      .insert({ state_hash: sha256(state), business_id: ctx.business.id, user_id: ctx.user.id, provider: "gmail" });
    if (error) throw new Error(`oauth state not saved: ${error.message}`);

    const res = NextResponse.redirect(url);
    res.cookies.set(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: OAUTH_STATE_COOKIE_PATH,
      maxAge: OAUTH_STATE_MAX_AGE_S,
    });
    res.headers.set("cache-control", "no-store");
    return res;
  } catch (e) {
    console.error(`[show-ops/mail/oauth/start] ${describeMailError(e)}`);
    return back("server");
  }
}
