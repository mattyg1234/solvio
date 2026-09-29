import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import {
  EMAIL_BOOKINGS_PATH,
  loadEmailConnection,
  mailRedirectUri,
  mailSiteOrigin,
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_COOKIE_PATH,
  saveEmailTokens,
  sha256,
} from "@/lib/show-ops/email-bookings/connection";
import { describeMailError, mailGate } from "@/lib/show-ops/email-bookings/gate";
import { googleEmail, googleExchangeCode, MailConfigError } from "@/lib/show-ops/email-bookings/gmail";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sameString(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Google sends the browser back here with a one-time code for the bookings inbox. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const origin = mailSiteOrigin(req.nextUrl.origin);
  const cookieState = req.cookies.get(OAUTH_STATE_COOKIE)?.value ?? "";
  const finish = (query: string) => {
    const res = NextResponse.redirect(new URL(`${EMAIL_BOOKINGS_PATH}?${query}`, origin));
    res.cookies.set(OAUTH_STATE_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: OAUTH_STATE_COOKIE_PATH, maxAge: 0 });
    res.headers.set("cache-control", "no-store");
    return res;
  };

  if (q.get("error")) return finish(q.get("error") === "access_denied" ? "error=denied" : "error=provider");
  const state = q.get("state") ?? "";
  const code = q.get("code") ?? "";
  if (!state || !code || !cookieState || !sameString(state, cookieState)) return finish("error=bad_state");

  const gate = await mailGate("office");
  if ("error" in gate) return finish("error=not_allowed");
  const { ctx } = gate;

  try {
    // Single use: the row is removed whatever happens next.
    const admin = createSupabaseServiceRoleClient();
    const { data: row } = await admin
      .from("show_email_booking_oauth_states")
      .delete()
      .eq("state_hash", sha256(state))
      .select("business_id,user_id,created_at")
      .maybeSingle();
    if (!row || row.user_id !== ctx.user.id || row.business_id !== ctx.business.id) return finish("error=bad_state");
    if (Date.now() - new Date(row.created_at).getTime() > 10 * 60 * 1000) return finish("error=expired");

    let tokens;
    try {
      tokens = await googleExchangeCode(code, mailRedirectUri(req.nextUrl.origin));
    } catch (e) {
      console.error(`[show-ops/mail/oauth/callback] ${describeMailError(e)}`);
      return finish(e instanceof MailConfigError ? "error=config" : "error=exchange_failed");
    }
    const address = await googleEmail(tokens.accessToken);
    if (!address) return finish("error=no_email");

    // Reconnecting the same address keeps its senders and sync position; a different address starts afresh.
    const existing = await loadEmailConnection(ctx.supabase, ctx.business.id);
    const now = new Date().toISOString();
    let connectionId: string;
    const same = existing && existing.provider === "gmail" && existing.address.toLowerCase() === address;
    if (existing) {
      const patch = same
        ? { updated_at: now, connected_by: ctx.user.id }
        : { provider: "gmail", address, sellers: [], skipped: 0, last_scan_at: null, last_sync_at: null, updated_at: now, connected_by: ctx.user.id };
      const { error } = await ctx.supabase.from("show_email_booking_connections").update(patch).eq("id", existing.id).eq("business_id", ctx.business.id);
      if (error) throw new Error(`connection not updated: ${error.message}`);
      connectionId = existing.id;
    } else {
      const { data, error } = await ctx.supabase
        .from("show_email_booking_connections")
        .insert({ business_id: ctx.business.id, provider: "gmail", address, connected_by: ctx.user.id })
        .select("id")
        .single();
      if (error || !data) throw new Error(`connection not saved: ${error?.message ?? "no row"}`);
      connectionId = String(data.id);
    }
    await saveEmailTokens(connectionId, ctx.business.id, tokens, Boolean(same));
    return finish("connected=1");
  } catch (e) {
    console.error(`[show-ops/mail/oauth/callback] ${describeMailError(e)}`);
    return finish(e instanceof Error && /SHOW_OPS_SECRETS_KEY/.test(e.message) ? "error=secrets" : "error=server");
  }
}
