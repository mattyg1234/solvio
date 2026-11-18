import type { Resend } from "resend";

/**
 * Show Ops guest emails (tickets, payment links, invoices, partner links) can go
 * from the client's own address, e.g. SHOW_OPS_MAIL_FROM="MHT Shows <reservations@musichalltavern.com>"
 * (Matty, 18 Nov). Until that domain is verified in Resend, Resend refuses the send;
 * we then send again from the usual Solvio address with Reply-To set to the client's
 * address, so no email is lost and replies still reach the client.
 *
 * When SMTP2GO_API_KEY is set (MHT's SMTP2GO account, where musichalltavern.com is
 * their sender), emails go through SMTP2GO from SHOW_OPS_MAIL_FROM or
 * reservations@musichalltavern.com. If SMTP2GO refuses or is down, the same email
 * goes through Resend from the Solvio address with Reply-To set to MHT's address.
 */

export function defaultShowOpsFrom(env: NodeJS.ProcessEnv = process.env): string {
  return env.SOLVIO_MAIL_FROM?.trim() || env.RESEND_MAIL_FROM?.trim() || "Solvio Bookings <hello@solviosystems.com>";
}

export function preferredShowOpsFrom(env: NodeJS.ProcessEnv = process.env): string | null {
  const v = env.SHOW_OPS_MAIL_FROM?.trim();
  return v && v.includes("@") ? v : null;
}

/** "MHT Shows <reservations@musichalltavern.com>" → "reservations@musichalltavern.com". */
export function bareAddress(from: string): string {
  const m = from.match(/<([^>]+)>/);
  return (m ? m[1] : from).trim();
}

/** Resend's answer when the from-domain isn't (yet) verified on the account. */
export function isUnverifiedDomainError(message: string | null | undefined): boolean {
  return /domain.*(not verified|is not verified|unverified)|verify (a|your) domain|not.*verified.*domain/i.test(String(message ?? ""));
}

type SendPayload = Omit<Parameters<Resend["emails"]["send"]>[0], "from">;
type SendResult = { data: { id: string } | null; error: { message: string; name?: string } | null };

export const MHT_SMTP2GO_FROM = "MHT Shows <reservations@musichalltavern.com>";

function list(v: unknown): string[] {
  if (!v) return [];
  return (Array.isArray(v) ? v : [v]).map((x) => String(x).trim()).filter(Boolean);
}

function guessMime(filename: string): string {
  if (/\.pdf$/i.test(filename)) return "application/pdf";
  if (/\.png$/i.test(filename)) return "image/png";
  if (/\.jpe?g$/i.test(filename)) return "image/jpeg";
  if (/\.csv$/i.test(filename)) return "text/csv";
  return "application/octet-stream";
}

function toBase64(content: unknown): string {
  if (typeof content === "string") return content;
  if (content instanceof Uint8Array) return Buffer.from(content).toString("base64");
  return "";
}

/** Builds the SMTP2GO /v3/email/send body from a Resend-style payload. */
export function smtp2goBody(payload: SendPayload, sender: string) {
  const p = payload as Record<string, unknown>;
  const replyTo = list(p.replyTo);
  const attachments = (Array.isArray(p.attachments) ? p.attachments : [])
    .filter(Boolean)
    .map((a: { filename?: string; content?: unknown; contentType?: string }) => ({
      filename: a.filename || "attachment",
      fileblob: toBase64(a.content),
      mimetype: a.contentType || guessMime(a.filename || ""),
    }))
    .filter((a) => a.fileblob);
  return {
    sender,
    to: list(p.to),
    ...(list(p.cc).length ? { cc: list(p.cc) } : {}),
    ...(list(p.bcc).length ? { bcc: list(p.bcc) } : {}),
    subject: String(p.subject ?? ""),
    ...(p.html ? { html_body: String(p.html) } : {}),
    ...(p.text ? { text_body: String(p.text) } : {}),
    ...(replyTo.length ? { custom_headers: [{ header: "Reply-To", value: replyTo.join(", ") }] } : {}),
    ...(attachments.length ? { attachments } : {}),
  };
}

/** Sends through SMTP2GO (MHT's own sender for musichalltavern.com). Never throws. */
export async function sendViaSmtp2go(apiKey: string, payload: SendPayload, sender: string, fetchImpl: typeof fetch = fetch): Promise<SendResult> {
  try {
    const res = await fetchImpl("https://api.smtp2go.com/v3/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "X-Smtp2go-Api-Key": apiKey },
      body: JSON.stringify(smtp2goBody(payload, sender)),
    });
    const json = (await res.json().catch(() => ({}))) as { data?: { succeeded?: number; email_id?: string; error?: string; failures?: unknown[] } };
    const d = json.data ?? {};
    if (res.ok && (d.succeeded ?? 0) > 0) return { data: { id: d.email_id || "smtp2go" }, error: null };
    const why = d.error || (d.failures?.length ? JSON.stringify(d.failures).slice(0, 300) : `HTTP ${res.status}`);
    return { data: null, error: { message: `SMTP2GO: ${why}`.replace(/api-[A-Za-z0-9]{20,}/g, "[redacted]") } };
  } catch (err) {
    return { data: null, error: { message: `SMTP2GO: ${err instanceof Error ? err.message : String(err)}` } };
  }
}

export async function sendShowOpsMail(client: Resend, payload: SendPayload, env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch) {
  const smtp2goKey = env.SMTP2GO_API_KEY?.trim();
  if (smtp2goKey) {
    const sender = preferredShowOpsFrom(env) ?? MHT_SMTP2GO_FROM;
    const r = await sendViaSmtp2go(smtp2goKey, payload, sender, fetchImpl);
    if (!r.error) return r;
    console.warn(`[show-ops-mail] ${r.error.message}; sending through Resend instead.`);
    const replyTo = (payload as { replyTo?: string | string[] }).replyTo ?? bareAddress(sender);
    return client.emails.send({ ...payload, replyTo, from: defaultShowOpsFrom(env) } as Parameters<Resend["emails"]["send"]>[0]);
  }

  const preferred = preferredShowOpsFrom(env);
  const fallback = defaultShowOpsFrom(env);
  if (!preferred || preferred === fallback) return client.emails.send({ ...payload, from: fallback } as Parameters<Resend["emails"]["send"]>[0]);

  const first = await client.emails.send({ ...payload, from: preferred } as Parameters<Resend["emails"]["send"]>[0]);
  if (!first.error || !isUnverifiedDomainError(first.error.message)) return first;
  console.warn(`[show-ops-mail] ${bareAddress(preferred)} not verified in Resend yet; sent from the default address instead.`);
  const replyTo = (payload as { replyTo?: string | string[] }).replyTo ?? bareAddress(preferred);
  return client.emails.send({ ...payload, replyTo, from: fallback } as Parameters<Resend["emails"]["send"]>[0]);
}
