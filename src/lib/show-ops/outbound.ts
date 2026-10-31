/**
 * Outbound Show Ops email and texts. Emails are live on the production site for good (Matty,
 * 31 Oct go-live): the old SHOW_OPS_EMAILS_LIVE=0 no longer holds them back there, only
 * SHOW_OPS_TEST_MODE=1 does. SHOW_OPS_MESSAGES_LIVE=0 still holds texts back on production.
 * =1 turns either on outside production (previews stay in test mode by default).
 */

const BUILTIN_ALLOWLIST = ["mattygale4@gmail.com"];

function isProduction(env: NodeJS.ProcessEnv): boolean {
  return env.VERCEL_ENV === "production" || env.VERCEL_TARGET_ENV === "production";
}

function liveSwitch(value: string | undefined, env: NodeJS.ProcessEnv): boolean {
  if (value === "1") return true;
  if (value === "0") return false;
  return isProduction(env);
}

/** Emails to guests, agents and partners (Resend); off = only the test allowlist. */
export function showOpsOutboundLive(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.SHOW_OPS_TEST_MODE === "1") return false;
  if (env.SHOW_OPS_EMAILS_LIVE === "1") return true;
  return isProduction(env);
}

/** Guest texts and WhatsApp (Twilio); off = only SHOW_OPS_PHONE_ALLOWLIST. Email being forced on takes texts with it. */
export function showOpsMessagesLive(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.SHOW_OPS_EMAILS_LIVE === "1") return true;
  return liveSwitch(env.SHOW_OPS_MESSAGES_LIVE, env);
}

export function showOpsOutboundAllowlist(): Set<string> {
  const fromEnv = (process.env.SHOW_OPS_EMAIL_ALLOWLIST || "")
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.includes("@"));
  return new Set([...BUILTIN_ALLOWLIST, ...fromEnv]);
}

export const SHOW_OPS_OUTBOUND_HELD =
  "Show Ops is in test mode — no emails or guest texts are sent to real people yet.";

/** Recipients Resend may actually receive. Empty while testing unless an allowlist is set. */
export function filterShowOpsOutboundTo(to: string | string[]): string[] {
  const requested = (Array.isArray(to) ? to : [to])
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"));
  if (showOpsOutboundLive()) return [...new Set(requested)];
  const allow = showOpsOutboundAllowlist();
  if (!allow.size) return [];
  return [...new Set(requested.filter((e) => allow.has(e)))];
}

export function showOpsOutboundHeldResult(): {
  ok: false;
  reason: "not_configured";
  message: string;
} {
  return { ok: false, reason: "not_configured", message: SHOW_OPS_OUTBOUND_HELD };
}
