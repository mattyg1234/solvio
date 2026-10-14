/**
 * The workspace's own Twilio account (not Solvio's): send WhatsApp/SMS, check
 * the credentials, and fetch guest photos. Credentials come from the encrypted
 * show_ops_integrations row and never leave the server.
 */

import { twilioErrorText } from "@/lib/show-ops/inbox/logic";

export type TwilioCreds = { accountSid: string; authToken: string };

export type TwilioSendResult =
  | { ok: true; sid: string; status: string }
  | { ok: false; code: string | null; message: string };

function authHeader(c: TwilioCreds): string {
  return `Basic ${Buffer.from(`${c.accountSid}:${c.authToken}`).toString("base64")}`;
}

export function isAccountSid(v: string): boolean {
  return /^AC[0-9a-f]{32}$/i.test(v);
}

export function isContentSid(v: string): boolean {
  return /^HX[0-9a-f]{32}$/i.test(v);
}

/** Checks the SID and token against Twilio. Returns the account's friendly name. */
export async function checkTwilioAccount(c: TwilioCreds): Promise<{ ok: true; name: string; status: string } | { ok: false; message: string }> {
  if (!isAccountSid(c.accountSid)) return { ok: false, message: "The Account SID starts with AC and has 34 characters." };
  let res: Response;
  try {
    res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${c.accountSid}.json`, {
      headers: { Authorization: authHeader(c) },
      cache: "no-store",
    });
  } catch {
    return { ok: false, message: "Could not reach Twilio. Try again." };
  }
  if (res.status === 401) return { ok: false, message: "Twilio refused the Account SID and Auth Token. Check both." };
  if (!res.ok) return { ok: false, message: `Twilio answered ${res.status}.` };
  const body = (await res.json().catch(() => ({}))) as { friendly_name?: string; status?: string };
  if (body.status && body.status !== "active") return { ok: false, message: `The Twilio account is ${body.status}.` };
  return { ok: true, name: String(body.friendly_name ?? "Twilio account"), status: String(body.status ?? "active") };
}

/**
 * One message. `from`/`to` are E.164; WhatsApp adds the whatsapp: prefix.
 * Either a body or a Content template (HX…) with variables.
 */
export async function sendTwilioMessage(
  c: TwilioCreds,
  input: {
    channel: "whatsapp" | "sms";
    from: string;
    to: string;
    body?: string;
    contentSid?: string;
    contentVariables?: Record<string, string>;
    statusCallback?: string;
  },
): Promise<TwilioSendResult> {
  const prefix = input.channel === "whatsapp" ? "whatsapp:" : "";
  const params = new URLSearchParams({ To: prefix + input.to, From: prefix + input.from });
  if (input.contentSid) {
    params.set("ContentSid", input.contentSid);
    if (input.contentVariables && Object.keys(input.contentVariables).length) {
      params.set("ContentVariables", JSON.stringify(input.contentVariables));
    }
  } else {
    params.set("Body", String(input.body ?? "").slice(0, 1600));
  }
  if (input.statusCallback) params.set("StatusCallback", input.statusCallback);

  let res: Response;
  try {
    res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${c.accountSid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: authHeader(c), "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
      cache: "no-store",
    });
  } catch {
    return { ok: false, code: null, message: "Could not reach Twilio. Nothing was sent." };
  }
  const body = (await res.json().catch(() => ({}))) as { sid?: string; status?: string; code?: number; message?: string };
  if (!res.ok || !body.sid) {
    const code = body.code != null ? String(body.code) : null;
    console.error("[show-ops inbox] Twilio send", res.status, code);
    return { ok: false, code, message: twilioErrorText(code, `Twilio answered ${res.status}. Nothing was sent.`) };
  }
  return { ok: true, sid: body.sid, status: String(body.status ?? "queued") };
}

/** A guest photo/file. Twilio media URLs need the account's credentials. */
export async function fetchTwilioMedia(c: TwilioCreds, url: string): Promise<Response | null> {
  if (!/^https:\/\/api\.twilio\.com\/2010-04-01\/Accounts\/AC[0-9a-f]{32}\/Messages\/(MM|SM)[0-9a-f]{32}\/Media\/ME[0-9a-f]{32}$/i.test(url)) {
    return null;
  }
  // The media must belong to this workspace's own account.
  if (!url.includes(`/Accounts/${c.accountSid}/`)) return null;
  try {
    const res = await fetch(url, { headers: { Authorization: authHeader(c) }, redirect: "follow", cache: "no-store" });
    return res.ok ? res : null;
  } catch {
    return null;
  }
}
