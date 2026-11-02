/**
 * WhatsApp through Meta's own Cloud API, instead of Twilio. The workspace's
 * WhatsApp Business Account, its number's ID, a permanent system-user token and
 * the app secret come from the encrypted settings row and never leave the server.
 */

import crypto from "node:crypto";

import { normalisePhone } from "@/lib/show-ops/inbox/logic";
import type { InboundTwilioMessage } from "@/lib/show-ops/inbox/logic";
import type { InboxMessageStatus } from "@/lib/show-ops/inbox/types";
import type { TwilioSendResult } from "@/lib/show-ops/inbox/twilio";

const GRAPH = "https://graph.facebook.com/v21.0";

export type MetaCreds = { accessToken: string; phoneNumberId: string; wabaId: string; appSecret: string };

export function isMetaId(v: string): boolean {
  return /^\d{6,25}$/.test(v);
}

async function graph(creds: MetaCreds, path: string, init?: { method: "POST"; body: unknown }): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  let res: Response;
  try {
    res = await fetch(`${GRAPH}/${path}`, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        ...(init ? { "Content-Type": "application/json" } : {}),
      },
      body: init ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
  } catch {
    return { ok: false, status: 0, body: { error: { message: "Could not reach Meta. Try again." } } };
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, body };
}

function graphError(body: Record<string, unknown>): { code: string | null; message: string } {
  const e = (body.error ?? {}) as { code?: unknown; message?: unknown; error_data?: { details?: unknown } };
  const detail = typeof e.error_data?.details === "string" ? e.error_data.details : "";
  return {
    code: e.code != null ? String(e.code) : null,
    message: String(detail || e.message || "Meta refused the request.").slice(0, 300),
  };
}

/** Plain-English reason for the Meta error codes guests actually hit. */
export function metaErrorText(code: unknown, fallback?: string): string {
  const known: Record<string, string> = {
    "131047": "Outside WhatsApp's 24-hour window: send the re-open template instead.",
    "131026": "WhatsApp could not deliver to this number (not on WhatsApp, or an old app).",
    "131049": "WhatsApp did not deliver this message to the guest (Meta limits how many templates a guest gets).",
    "131051": "WhatsApp does not support this kind of message.",
    "132000": "The template's blanks don't match what Meta approved.",
    "132001": "Meta has no approved template with that name and language.",
    "131056": "Too many messages to this guest in a short time. Wait a minute.",
    "190": "The Meta access token has expired or was revoked. Paste a new one in Settings.",
    "100": "Meta refused the request (check the phone number ID in Settings).",
  };
  return known[String(code ?? "")] ?? fallback ?? "Meta refused the message. Nothing was sent.";
}

/** The number's name and phone as Meta has it. Proves the token and phone number ID. */
export async function checkMetaNumber(creds: MetaCreds): Promise<{ ok: true; name: string; phone: string; quality: string } | { ok: false; message: string }> {
  if (!isMetaId(creds.phoneNumberId)) return { ok: false, message: "The phone number ID is the long number Meta shows under API Setup." };
  const r = await graph(creds, `${creds.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`);
  if (!r.ok) {
    const e = graphError(r.body);
    return { ok: false, message: metaErrorText(e.code, e.message) };
  }
  return {
    ok: true,
    name: String(r.body.verified_name ?? "WhatsApp number"),
    phone: normalisePhone(String(r.body.display_phone_number ?? "")) ?? "",
    quality: String(r.body.quality_rating ?? ""),
  };
}

/** Approved templates in the WhatsApp Business Account: name → language code (English first). */
/** An approved template's body as Meta holds it, so a blank mismatch can be read from the row. */
export type MetaTemplateBody = { language: string; format: string; body: string };

export async function listApprovedTemplates(
  creds: MetaCreds,
): Promise<{ ok: true; templates: Record<string, string>; bodies: Record<string, MetaTemplateBody> } | { ok: false; message: string }> {
  if (!isMetaId(creds.wabaId)) return { ok: false, message: "The WhatsApp Business Account ID is the long number Meta shows under API Setup." };
  const out: Record<string, string> = {};
  const bodies: Record<string, MetaTemplateBody> = {};
  let path = `${creds.wabaId}/message_templates?fields=name,language,status,parameter_format,components&limit=200`;
  for (let page = 0; page < 5 && path; page++) {
    const r = await graph(creds, path);
    if (!r.ok) {
      const e = graphError(r.body);
      return { ok: false, message: metaErrorText(e.code, e.message) };
    }
    const rows = Array.isArray(r.body.data)
      ? (r.body.data as Array<{ name?: unknown; language?: unknown; status?: unknown; parameter_format?: unknown; components?: unknown }>)
      : [];
    for (const t of rows) {
      const name = String(t.name ?? "");
      const lang = String(t.language ?? "");
      if (String(t.status ?? "").toUpperCase() !== "APPROVED" || !name || !lang) continue;
      if (!out[name] || (/^en/i.test(lang) && !/^en/i.test(out[name]))) {
        out[name] = lang;
        const parts = Array.isArray(t.components) ? (t.components as Array<{ type?: unknown; text?: unknown }>) : [];
        const body = parts.find((c) => String(c.type ?? "").toUpperCase() === "BODY");
        bodies[name] = { language: lang, format: String(t.parameter_format ?? "POSITIONAL"), body: String(body?.text ?? "").slice(0, 2000) };
      }
    }
    const next = ((r.body.paging ?? {}) as { next?: unknown }).next;
    path = typeof next === "string" && next.startsWith(`${GRAPH}/`) ? next.slice(GRAPH.length + 1) : "";
  }
  return { ok: true, templates: out, bodies };
}

/**
 * Subscribes the token's Meta app to the WhatsApp Business Account, so guest messages
 * reach the app's webhook. Safe to repeat.
 */
export async function subscribeMetaApp(creds: MetaCreds): Promise<{ ok: true } | { ok: false; message: string }> {
  const r = await graph(creds, `${creds.wabaId}/subscribed_apps`, { method: "POST", body: {} });
  if (r.ok) return { ok: true };
  const e = graphError(r.body);
  return { ok: false, message: metaErrorText(e.code, e.message) };
}

/** The request body for one message: free text, or an approved template with its blanks in order. */
export function metaMessagePayload(
  to: string,
  input: { body?: string; template?: { name: string; language: string; variables?: Record<string, string> } },
): Record<string, unknown> {
  const base = { messaging_product: "whatsapp", recipient_type: "individual", to: to.replace(/^\+/, "") };
  if (!input.template) return { ...base, type: "text", text: { preview_url: true, body: String(input.body ?? "").slice(0, 4096) } };
  const vars = Object.entries(input.template.variables ?? {})
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, text]) => ({ type: "text", text }));
  return {
    ...base,
    type: "template",
    template: {
      name: input.template.name,
      language: { code: input.template.language },
      ...(vars.length ? { components: [{ type: "body", parameters: vars }] } : {}),
    },
  };
}

export async function sendMetaMessage(
  creds: MetaCreds,
  to: string,
  input: { body?: string; template?: { name: string; language: string; variables?: Record<string, string> } },
): Promise<TwilioSendResult> {
  const r = await graph(creds, `${creds.phoneNumberId}/messages`, { method: "POST", body: metaMessagePayload(to, input) });
  const id = ((r.body.messages as Array<{ id?: unknown }> | undefined) ?? [])[0]?.id;
  if (!r.ok || typeof id !== "string") {
    const e = graphError(r.body);
    console.error("[show-ops inbox] Meta send", r.status, e.code, e.message);
    return { ok: false, code: e.code, message: metaErrorText(e.code, `Meta answered ${r.status} (${e.message}). Nothing was sent.`) };
  }
  return { ok: true, sid: id, status: "sent" };
}

/** A guest photo/file: Meta gives a short-lived URL for the media ID, fetched with the same token. */
export async function fetchMetaMedia(creds: MetaCreds, mediaId: string): Promise<Response | null> {
  if (!isMetaId(mediaId)) return null;
  const r = await graph(creds, mediaId);
  const url = typeof r.body.url === "string" ? r.body.url : "";
  if (!r.ok || !/^https:\/\/[a-z0-9.-]+\.(fbsbx|facebook|whatsapp)\.(com|net)\//i.test(url)) return null;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${creds.accessToken}` }, cache: "no-store" });
    return res.ok ? res : null;
  } catch {
    return null;
  }
}

/** X-Hub-Signature-256 = sha256=HMAC(app secret, raw body). */
export function validMetaSignature(appSecret: string, header: string | null, rawBody: string): boolean {
  if (!appSecret || !header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(`sha256=${crypto.createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex")}`);
  const given = Buffer.from(header);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

/** Media stored on an inbound message: `meta-media:<id>`, fetched later through the proxy. */
export const META_MEDIA_PREFIX = "meta-media:";

export type MetaStatusUpdate = { id: string; status: InboxMessageStatus; code: string | null; message: string };

/** One webhook delivery: guest messages and delivery updates for our phone number ID only. */
export function parseMetaWebhook(payload: unknown, phoneNumberId: string): { messages: InboundTwilioMessage[]; statuses: MetaStatusUpdate[] } {
  const messages: InboundTwilioMessage[] = [];
  const statuses: MetaStatusUpdate[] = [];
  const p = (payload ?? {}) as { object?: unknown; entry?: unknown };
  if (p.object !== "whatsapp_business_account" || !Array.isArray(p.entry)) return { messages, statuses };
  for (const entry of p.entry as Array<{ changes?: unknown }>) {
    for (const change of Array.isArray(entry?.changes) ? (entry.changes as Array<{ field?: unknown; value?: unknown }>) : []) {
      if (change?.field !== "messages") continue;
      const v = (change.value ?? {}) as {
        metadata?: { phone_number_id?: unknown; display_phone_number?: unknown };
        contacts?: Array<{ wa_id?: unknown; profile?: { name?: unknown } }>;
        messages?: Array<Record<string, unknown>>;
        statuses?: Array<Record<string, unknown>>;
      };
      if (String(v.metadata?.phone_number_id ?? "") !== phoneNumberId) continue;
      const to = normalisePhone(`+${String(v.metadata?.display_phone_number ?? "").replace(/\D/g, "")}`);
      const names = new Map((v.contacts ?? []).map((c) => [String(c.wa_id ?? ""), String(c.profile?.name ?? "")]));
      for (const m of v.messages ?? []) {
        const id = String(m.id ?? "");
        const fromId = String(m.from ?? "").replace(/\D/g, "");
        const from = normalisePhone(`+${fromId}`);
        if (!id || id.length > 64 || !from || !to) continue;
        const type = String(m.type ?? "");
        const part = (m[type] ?? {}) as { body?: unknown; caption?: unknown; id?: unknown; mime_type?: unknown; filename?: unknown };
        let body = "";
        const media: { url: string; type: string }[] = [];
        if (type === "text") body = String(part.body ?? "");
        else if (type === "image" || type === "video" || type === "audio" || type === "document" || type === "sticker") {
          body = String(part.caption ?? part.filename ?? "");
          if (isMetaId(String(part.id ?? ""))) {
            media.push({ url: `${META_MEDIA_PREFIX}${String(part.id)}`, type: String(part.mime_type ?? "application/octet-stream").slice(0, 100) });
          }
        } else if (type === "button") body = String((m.button as { text?: unknown } | undefined)?.text ?? "");
        else if (type === "interactive") {
          const i = (m.interactive ?? {}) as { button_reply?: { title?: unknown }; list_reply?: { title?: unknown } };
          body = String(i.button_reply?.title ?? i.list_reply?.title ?? "");
        } else if (type === "location") {
          const l = (m.location ?? {}) as { latitude?: unknown; longitude?: unknown; name?: unknown };
          body = `Location: ${l.name ? `${String(l.name)} ` : ""}https://maps.google.com/?q=${Number(l.latitude)},${Number(l.longitude)}`;
        } else body = `[${type || "message"} not shown in the Hub]`;
        messages.push({ sid: id, channel: "whatsapp", from, to, body: body.slice(0, 4096), profileName: names.get(fromId) ?? "", media });
      }
      for (const s of v.statuses ?? []) {
        const id = String(s.id ?? "");
        const raw = String(s.status ?? "").toLowerCase();
        const status: InboxMessageStatus | null =
          raw === "sent" || raw === "delivered" || raw === "read" || raw === "failed" ? raw : null;
        if (!id || id.length > 64 || !status) continue;
        const err = (Array.isArray(s.errors) ? (s.errors as Array<{ code?: unknown; title?: unknown; message?: unknown }>) : [])[0];
        statuses.push({ id, status, code: err?.code != null ? String(err.code) : null, message: String(err?.message ?? err?.title ?? "") });
      }
    }
  }
  return { messages, statuses };
}
