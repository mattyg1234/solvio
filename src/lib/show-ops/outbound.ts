/** Outbound Show Ops mail/SMS stay off until we explicitly go live. */

const BUILTIN_ALLOWLIST = ["mattygale4@gmail.com"];

export function showOpsOutboundLive(): boolean {
  return process.env.SHOW_OPS_EMAILS_LIVE === "1";
}

/**
 * Guest texts and WhatsApp (Twilio) are live on the production site before email (Matty, 27 Oct):
 * they go to every guest while emails stay on the test allowlist. SHOW_OPS_MESSAGES_LIVE=0 puts
 * them back on the test list (SHOW_OPS_PHONE_ALLOWLIST); =1 also turns them on outside production.
 * Email going live takes texts with it.
 */
export function showOpsMessagesLive(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.SHOW_OPS_EMAILS_LIVE === "1" || env.SHOW_OPS_MESSAGES_LIVE === "1") return true;
  if (env.SHOW_OPS_MESSAGES_LIVE === "0") return false;
  return env.VERCEL_ENV === "production";
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
