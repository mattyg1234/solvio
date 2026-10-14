/**
 * Pure inbox rules: phone numbers, the WhatsApp 24-hour window, who may see or
 * answer a conversation, Twilio webhook parsing and signatures. No I/O, so it
 * can be unit tested.
 */

import crypto from "node:crypto";

import type { InboxChannel, InboxMessageStatus } from "@/lib/show-ops/inbox/types";

export const INBOX_MAX_TEXT = 1600;
export const INBOX_MAX_NOTE = 500;
export const INBOX_POLL_MS = 5000;
/** WhatsApp lets a business send free text for 24 hours after the guest's last message. */
export const WHATSAPP_WINDOW_MS = 24 * 60 * 60 * 1000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/** Roles that get the inbox at all. Partner logins (seller) never do. */
export function canUseShowOpsInbox(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin" || role === "finance" || role === "office" || role === "booker";
}

/** Owners and Superadmins always see the whole inbox; others only when ticked. */
export function inboxSeesAll(role: string | null | undefined, inboxAllFlag: boolean | null | undefined): boolean {
  if (role === "owner" || role === "admin") return true;
  return Boolean(inboxAllFlag) && canUseShowOpsInbox(role);
}

/**
 * A guest number as E.164 (+34612345678), or null if it cannot be one.
 * MHT guests are mostly Spanish and British: a bare 9-digit Spanish mobile gets
 * +34, a UK 07… mobile gets +44; 00 becomes +. Anything else must already carry
 * its country code.
 */
export function normalisePhone(raw: unknown, defaultCountry: "34" | "44" = "34"): string | null {
  if (typeof raw !== "string") return null;
  let s = raw.trim().replace(/^whatsapp:/i, "").replace(/[\s().\-/]/g, "");
  if (!s) return null;
  if (s.startsWith("00")) s = `+${s.slice(2)}`;
  if (!s.startsWith("+")) {
    if (!/^\d+$/.test(s)) return null;
    if (/^07\d{9}$/.test(s)) s = `+44${s.slice(1)}`;
    else if (/^[6789]\d{8}$/.test(s)) s = `+34${s}`;
    else if (defaultCountry === "44" && /^0\d{9,10}$/.test(s)) s = `+44${s.slice(1)}`;
    else if (/^(34|44)\d{9,10}$/.test(s)) s = `+${s}`;
    else return null;
  }
  // +44 (0)7… written with the trunk zero kept.
  s = s.replace(/^\+440/, "+44");
  return /^\+[1-9]\d{6,15}$/.test(s) ? s : null;
}

/** Last nine digits — enough to match a guest number however it was typed on the booking. */
export function phoneTail(phone: string): string {
  return phone.replace(/\D/g, "").slice(-9);
}

/** Show a number grouped for reading: +34 612 345 678, +44 7700 900123. */
export function formatPhone(e164: string): string {
  const es = /^\+34(\d{3})(\d{3})(\d{3})$/.exec(e164);
  if (es) return `+34 ${es[1]} ${es[2]} ${es[3]}`;
  const uk = /^\+44(\d{4})(\d{6})$/.exec(e164);
  if (uk) return `+44 ${uk[1]} ${uk[2]}`;
  return e164;
}

export function whatsappWindowOpen(lastInboundAt: string | null | undefined, now = Date.now()): boolean {
  if (!lastInboundAt) return false;
  const t = Date.parse(lastInboundAt);
  return Number.isFinite(t) && now - t < WHATSAPP_WINDOW_MS;
}

/** Hours and minutes left in the WhatsApp window, for the composer hint. */
export function whatsappWindowLeft(lastInboundAt: string | null | undefined, now = Date.now()): number {
  if (!lastInboundAt) return 0;
  const t = Date.parse(lastInboundAt);
  return Number.isFinite(t) ? Math.max(0, t + WHATSAPP_WINDOW_MS - now) : 0;
}

export type ReplyBlock =
  | { ok: true }
  | { ok: false; reason: "closed" | "not_yours" | "window" | "no_sender"; message: string };

/**
 * Whether this person may type a reply to the guest right now.
 * Anyone who sees the whole inbox may answer; others only conversations assigned to them.
 */
export function replyBlock(input: {
  seesAll: boolean;
  meId: string;
  assignedTo: string | null;
  channel: InboxChannel;
  lastInboundAt: string | null;
  senderConfigured: boolean;
  now?: number;
}): ReplyBlock {
  if (!input.seesAll && input.assignedTo !== input.meId) {
    return { ok: false, reason: "not_yours", message: "Accept this chat first." };
  }
  if (!input.senderConfigured) {
    return {
      ok: false,
      reason: "no_sender",
      message:
        input.channel === "whatsapp"
          ? "No WhatsApp number set up yet (Settings)."
          : "No SMS number set up yet (Settings).",
    };
  }
  if (input.channel === "whatsapp" && !whatsappWindowOpen(input.lastInboundAt, input.now)) {
    return {
      ok: false,
      reason: "window",
      message:
        "Over 24 hours since their last message. Send the template or text them instead.",
    };
  }
  return { ok: true };
}

/** Message text as stored: trimmed, capped. */
export function cleanText(text: unknown, max = INBOX_MAX_TEXT): string {
  return typeof text === "string" ? text.replace(/\r\n/g, "\n").trim().slice(0, max) : "";
}

/** One line for the conversation list. */
export function previewOf(body: string, direction: string, mediaCount = 0): string {
  const flat = body.replace(/\s+/g, " ").trim();
  const text = flat || (mediaCount ? (mediaCount === 1 ? "Photo or file" : `${mediaCount} photos or files`) : "");
  const who = direction === "out" ? "You: " : direction === "note" ? "Note: " : "";
  return (who + text).slice(0, 160);
}

/** A first name for a WhatsApp template ("Hi {{1}}"). */
export function firstName(name: string | null | undefined): string {
  const first = String(name ?? "").trim().split(/\s+/)[0] ?? "";
  return first.slice(0, 40) || "there";
}

/* ------------------------------------------------------------------ *
 * Twilio webhooks
 * ------------------------------------------------------------------ */

/** X-Twilio-Signature for a form-encoded POST, with the workspace's own auth token. */
export function twilioSignature(authToken: string, url: string, params: Record<string, string>): string {
  let data = url;
  for (const key of Object.keys(params).sort()) data += key + params[key];
  return crypto.createHmac("sha1", authToken).update(data, "utf8").digest("base64");
}

export function validTwilioSignature(
  authToken: string,
  signature: string | null,
  urls: readonly string[],
  params: Record<string, string>,
): boolean {
  if (!authToken || !signature) return false;
  const given = Buffer.from(signature);
  return urls.some((url) => {
    const expected = Buffer.from(twilioSignature(authToken, url, params));
    return expected.length === given.length && crypto.timingSafeEqual(expected, given);
  });
}

export type InboundTwilioMessage = {
  sid: string;
  channel: InboxChannel;
  from: string;
  /** The business number it was sent to (E.164). */
  to: string;
  body: string;
  profileName: string;
  media: { url: string; type: string }[];
};

/** A Twilio "message comes in" webhook, validated. Null if it is not one we can use. */
export function parseInboundTwilio(params: Record<string, string>): InboundTwilioMessage | null {
  const sid = String(params.MessageSid ?? params.SmsMessageSid ?? "").trim();
  if (!/^(SM|MM)[0-9a-f]{32}$/i.test(sid)) return null;
  const rawFrom = String(params.From ?? "");
  const channel: InboxChannel = /^whatsapp:/i.test(rawFrom) ? "whatsapp" : "sms";
  const from = normalisePhone(rawFrom);
  const to = normalisePhone(String(params.To ?? ""));
  if (!from || !to) return null;
  const count = Math.min(Math.max(Number.parseInt(params.NumMedia ?? "0", 10) || 0, 0), 10);
  const media: { url: string; type: string }[] = [];
  for (let i = 0; i < count; i++) {
    const url = String(params[`MediaUrl${i}`] ?? "");
    // Only Twilio's own media host: the Hub fetches these with the workspace's credentials.
    if (/^https:\/\/api\.twilio\.com\//.test(url)) {
      media.push({ url, type: String(params[`MediaContentType${i}`] ?? "application/octet-stream").slice(0, 100) });
    }
  }
  return {
    sid,
    channel,
    from,
    to,
    body: cleanText(params.Body, 4000),
    profileName: String(params.ProfileName ?? "").trim().slice(0, 120),
    media,
  };
}

const STATUS_ORDER: Record<string, number> = {
  sending: 0,
  queued: 1,
  sent: 2,
  delivered: 3,
  read: 4,
  failed: 5,
  undelivered: 5,
};

/** Twilio's MessageStatus as our status, or null to ignore (accepted, scheduled, receiving…). */
export function mapTwilioStatus(raw: unknown): InboxMessageStatus | null {
  const s = String(raw ?? "").toLowerCase();
  if (s === "queued" || s === "accepted" || s === "scheduled") return "queued";
  if (s === "sending") return "sending";
  if (s === "sent" || s === "delivered" || s === "read" || s === "failed" || s === "undelivered") return s;
  return null;
}

/** Status callbacks can arrive out of order; never move a message backwards (failures always win). */
export function shouldApplyStatus(current: string, next: InboxMessageStatus): boolean {
  if (current === next) return false;
  if (next === "failed" || next === "undelivered") return current !== "read" && current !== "delivered";
  const a = STATUS_ORDER[current];
  const b = STATUS_ORDER[next];
  if (a === undefined || b === undefined) return false;
  if (a === 5) return false;
  return b > a;
}

/** Plain-English reason for the Twilio error codes guests actually hit. */
export function twilioErrorText(code: unknown, fallback?: string): string {
  const c = String(code ?? "");
  const known: Record<string, string> = {
    "63016": "Outside WhatsApp's 24-hour window: send the re-open template instead.",
    "63003": "This number is not on WhatsApp.",
    "63024": "WhatsApp rejected the recipient number.",
    "63049": "WhatsApp did not deliver this marketing message to the guest.",
    "30003": "The phone is switched off or unreachable.",
    "30005": "Unknown number, or the phone no longer exists.",
    "30006": "That number cannot receive texts (landline or blocked).",
    "30007": "The carrier filtered the message as spam.",
    "21211": "The phone number is not valid.",
    "21408": "Texting this country is not switched on in the Twilio account.",
    "21610": "The guest has opted out (replied STOP).",
    "21614": "That number cannot receive SMS.",
  };
  return (known[c] ?? fallback ?? (c ? `Twilio error ${c}.` : "Not delivered.")).slice(0, 500);
}

/* ------------------------------------------------------------------ *
 * The list
 * ------------------------------------------------------------------ */

export type InboxFilter = "mine" | "sent" | "unassigned" | "all" | "closed";

/** Which tabs someone gets: whole-inbox people also see Unassigned and All. */
export function inboxFilters(seesAll: boolean): InboxFilter[] {
  return seesAll ? ["unassigned", "mine", "sent", "all", "closed"] : ["mine", "sent", "closed"];
}

export function matchesInboxFilter(
  c: { status: string; assignedTo: string | null; pendingHandoff: unknown; lastInboundAt?: string | null },
  filter: InboxFilter,
  meId: string,
): boolean {
  switch (filter) {
    case "mine":
      return c.status === "open" && c.assignedTo === meId;
    case "sent":
      return Boolean(c.pendingHandoff);
    case "unassigned":
      // A guest has written and nobody has the chat. Tickets the Hub sent with no reply yet stay under All.
      return c.status === "open" && !c.assignedTo && Boolean(c.lastInboundAt);
    case "all":
      return c.status === "open";
    case "closed":
      return c.status === "closed";
  }
}

/** Search by guest name or any run of digits in the number. */
export function matchesInboxSearch(c: { customerName: string; customerPhone: string }, q: string): boolean {
  const query = q.trim().toLowerCase();
  if (!query) return true;
  const digits = query.replace(/\D/g, "");
  if (digits.length >= 3 && c.customerPhone.replace(/\D/g, "").includes(digits)) return true;
  return c.customerName.toLowerCase().includes(query);
}
