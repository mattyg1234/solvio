/**
 * The workspace's Twilio connection (show_ops_integrations, provider 'twilio').
 * Read with the service role, because the webhook has no signed-in user and
 * staff below Superadmin cannot read credential rows.
 */

import { decryptSecret } from "@/lib/show-ops/secrets";
import { showOpsMessagesLive } from "@/lib/show-ops/outbound";
import { normalisePhone } from "@/lib/show-ops/inbox/logic";
import type { InboxConnectionSummary, TwilioIntegrationMeta, TwilioVenue } from "@/lib/show-ops/inbox/types";
import type { TwilioCreds } from "@/lib/show-ops/inbox/twilio";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export type TwilioConnection = {
  businessId: string;
  creds: TwilioCreds;
  meta: TwilioIntegrationMeta;
  status: string;
};

function parseVenues(raw: unknown): Record<string, TwilioVenue> {
  const out: Record<string, TwilioVenue> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [island, v] of Object.entries(raw as Record<string, unknown>)) {
    const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
    const address = typeof o.address === "string" ? o.address.trim() : "";
    const maps = typeof o.maps_url === "string" ? o.maps_url.trim() : "";
    if (address || maps) out[island] = { address, maps_url: /^https:\/\//.test(maps) ? maps : "" };
  }
  return out;
}

export function parseTwilioMeta(raw: unknown): TwilioIntegrationMeta {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const s = (k: string) => (typeof o[k] === "string" ? (o[k] as string).trim() : "");
  const hx = (k: string) => (/^HX[0-9a-f]{32}$/i.test(s(k)) ? s(k) : "");
  return {
    account_sid: s("account_sid"),
    whatsapp_from: normalisePhone(s("whatsapp_from")) ?? "",
    sms_from: normalisePhone(s("sms_from")) ?? "",
    webhook_token: /^[0-9a-f]{40}$/.test(s("webhook_token")) ? s("webhook_token") : "",
    reopen_content_sid: hx("reopen_content_sid"),
    reopen_uses_name: o.reopen_uses_name === true,
    booking_content_sid: hx("booking_content_sid"),
    booking_transport_content_sid: hx("booking_transport_content_sid"),
    pickup_content_sid: hx("pickup_content_sid"),
    venues: parseVenues(o.venues),
    hint: s("hint"),
  };
}

function toConnection(row: { business_id: string; secret_ciphertext: string; status: string; meta: unknown } | null): TwilioConnection | null {
  if (!row || row.status === "disabled") return null;
  const meta = parseTwilioMeta(row.meta);
  if (!meta.account_sid) return null;
  let authToken: string;
  try {
    authToken = decryptSecret(row.secret_ciphertext);
  } catch {
    console.error("[show-ops inbox] could not decrypt the Twilio token (SHOW_OPS_SECRETS_KEY changed?)");
    return null;
  }
  return { businessId: row.business_id, creds: { accountSid: meta.account_sid, authToken }, meta, status: row.status };
}

export async function loadTwilioConnection(businessId: string): Promise<TwilioConnection | null> {
  const admin = createSupabaseServiceRoleClient();
  const { data } = await admin
    .from("show_ops_integrations")
    .select("business_id,secret_ciphertext,status,meta")
    .eq("business_id", businessId)
    .eq("provider", "twilio")
    .maybeSingle();
  return toConnection(data);
}

/** The webhook URL carries a random token that names the workspace. */
export async function loadTwilioConnectionByWebhookToken(token: string): Promise<TwilioConnection | null> {
  if (!/^[0-9a-f]{40}$/.test(token)) return null;
  const admin = createSupabaseServiceRoleClient();
  const { data } = await admin
    .from("show_ops_integrations")
    .select("business_id,secret_ciphertext,status,meta")
    .eq("provider", "twilio")
    .eq("meta->>webhook_token", token)
    .maybeSingle();
  return toConnection(data);
}

/** Numbers that may be messaged while Show Ops is still in test mode (SHOW_OPS_PHONE_ALLOWLIST). */
export function phoneOutboundAllowed(phone: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (showOpsMessagesLive(env)) return true;
  const allow = String(env.SHOW_OPS_PHONE_ALLOWLIST ?? "")
    .split(/[,;\s]+/)
    .map((p) => normalisePhone(p))
    .filter((p): p is string => Boolean(p));
  return allow.includes(phone);
}

export function connectionSummary(c: TwilioConnection | null): InboxConnectionSummary {
  return {
    connected: Boolean(c),
    whatsapp: Boolean(c?.meta.whatsapp_from),
    sms: Boolean(c?.meta.sms_from),
    reopenTemplate: Boolean(c?.meta.whatsapp_from && c.meta.reopen_content_sid),
    live: showOpsMessagesLive(),
  };
}

/** Base URL Twilio calls back on: this deployment's own host. */
export function inboxWebhookBase(): string {
  const explicit = process.env.SHOW_OPS_INBOX_WEBHOOK_BASE?.trim().replace(/\/$/, "");
  if (explicit) return explicit;
  const site = process.env.NEXT_PUBLIC_SHOW_OPS_URL?.trim().replace(/\/$/, "");
  if (site) return site;
  return "https://mht.solviosystems.com";
}

export function inboundWebhookUrl(token: string): string {
  return `${inboxWebhookBase()}/api/show-ops/inbox/twilio/${token}`;
}

export function statusWebhookUrl(token: string): string {
  return `${inboxWebhookBase()}/api/show-ops/inbox/twilio/${token}/status`;
}
