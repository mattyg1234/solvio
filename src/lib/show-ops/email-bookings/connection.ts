import { createHash, randomBytes } from "node:crypto";

import type { ShowOpsContext } from "@/lib/show-ops/access";
import { decryptSecret, encryptSecret } from "@/lib/show-ops/secrets";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

import { googleRefresh, MailProviderError, type TokenSet } from "./gmail";
import type { SellerFound } from "./types";

/**
 * The bookings inbox row (readable by the bookings desk under RLS) and its encrypted tokens
 * (service role only). Server code only; nothing here returns a token to the browser.
 */

export const OAUTH_CALLBACK_PATH = "/api/show-ops/mail/oauth/callback";
export const OAUTH_STATE_COOKIE = "show_ops_mail_oauth_state";
export const OAUTH_STATE_COOKIE_PATH = "/api/show-ops/mail/oauth";
export const OAUTH_STATE_MAX_AGE_S = 600;
export const EMAIL_BOOKINGS_PATH = "/dashboard/show-ops/email-bookings";

/** The site Google sends people back to: NEXT_PUBLIC_SITE_URL, else the request's own origin. */
export function mailSiteOrigin(requestOrigin: string): string {
  return (process.env.NEXT_PUBLIC_SITE_URL?.trim() || requestOrigin).replace(/\/+$/, "");
}

export function mailRedirectUri(requestOrigin: string): string {
  return `${mailSiteOrigin(requestOrigin)}${OAUTH_CALLBACK_PATH}`;
}

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
export const newOAuthState = () => randomBytes(32).toString("base64url");

export type EmailBookingConnection = {
  id: string;
  business_id: string;
  provider: "gmail" | "microsoft";
  address: string;
  sellers: SellerFound[];
  skipped: number;
  last_scan_at: string | null;
  last_sync_at: string | null;
  created_at: string;
};

export const CONNECTION_COLUMNS = "id,business_id,provider,address,sellers,skipped,last_scan_at,last_sync_at,created_at";

/** The bookings inbox for a business, read with the signed-in user's client (RLS applies). */
export async function loadEmailConnection(supabase: ShowOpsContext["supabase"], businessId: string): Promise<EmailBookingConnection | null> {
  const { data, error } = await supabase.from("show_email_booking_connections").select(CONNECTION_COLUMNS).eq("business_id", businessId).maybeSingle();
  if (error) {
    // Before the migration is applied the table doesn't exist: treat as not connected.
    if (/show_email_booking_connections|does not exist|schema cache/i.test(error.message)) return null;
    throw new Error("Could not load the bookings inbox.");
  }
  if (!data) return null;
  const row = data as EmailBookingConnection;
  return { ...row, sellers: Array.isArray(row.sellers) ? row.sellers : [] };
}

/** Saves (or replaces) the encrypted tokens for a connection. Service role. */
export async function saveEmailTokens(connectionId: string, businessId: string, tokens: TokenSet, keepRefresh = true): Promise<void> {
  const admin = createSupabaseServiceRoleClient();
  const accessEnc = encryptSecret(tokens.accessToken);
  const refreshEnc = tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null;
  const now = new Date().toISOString();
  if (keepRefresh && !refreshEnc) {
    const { data: existing } = await admin.from("show_email_booking_tokens").select("connection_id").eq("connection_id", connectionId).maybeSingle();
    if (existing) {
      const { error } = await admin
        .from("show_email_booking_tokens")
        .update({ access_token_enc: accessEnc, expires_at: tokens.expiresAt?.toISOString() ?? null, updated_at: now })
        .eq("connection_id", connectionId);
      if (error) throw new Error("Could not save the inbox sign-in.");
      return;
    }
  }
  const { error } = await admin.from("show_email_booking_tokens").upsert(
    {
      connection_id: connectionId,
      business_id: businessId,
      access_token_enc: accessEnc,
      refresh_token_enc: refreshEnc,
      expires_at: tokens.expiresAt?.toISOString() ?? null,
      updated_at: now,
    },
    { onConflict: "connection_id" },
  );
  if (error) throw new Error("Could not save the inbox sign-in.");
}

const REFRESH_MARGIN_MS = 2 * 60 * 1000;

/** A working Gmail access token, refreshed (and saved) when it expires within two minutes. */
export async function getEmailAccessToken(conn: Pick<EmailBookingConnection, "id" | "business_id" | "provider">): Promise<string> {
  if (conn.provider !== "gmail") throw new MailProviderError("Only Gmail inboxes can be read so far", 400);
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from("show_email_booking_tokens")
    .select("access_token_enc,refresh_token_enc,expires_at")
    .eq("connection_id", conn.id)
    .eq("business_id", conn.business_id)
    .maybeSingle();
  if (error) throw new Error("Could not read the inbox sign-in.");
  if (!data) throw new MailProviderError("No saved sign-in; the inbox needs to be connected again", 401);
  const expires = data.expires_at ? new Date(data.expires_at).getTime() : 0;
  if (expires - Date.now() > REFRESH_MARGIN_MS) return decryptSecret(String(data.access_token_enc));
  if (!data.refresh_token_enc) throw new MailProviderError("No refresh token saved; the inbox needs to be connected again", 401);
  const fresh = await googleRefresh(decryptSecret(String(data.refresh_token_enc)));
  await saveEmailTokens(conn.id, conn.business_id, fresh, true);
  return fresh.accessToken;
}
