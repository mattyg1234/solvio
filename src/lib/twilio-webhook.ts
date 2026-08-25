import crypto from "crypto";

export const DEFAULT_TWILIO_FORWARD_TO = "+34604189230";

export function getTwilioForwardTo(): string {
  const raw =
    process.env.SOLVIO_TWILIO_FORWARD_TO?.trim() ||
    process.env.TWILIO_FORWARD_TO?.trim() ||
    DEFAULT_TWILIO_FORWARD_TO;
  return raw.replace(/\s+/g, "");
}

function cleanEnv(value: string | undefined): string {
  if (!value) return "";
  return value.trim().replace(/^["']|["']$/g, "").replace(/\\n/g, "").replace(/\r?\n/g, "").trim();
}

export function getTwilioAuthToken(): string {
  return cleanEnv(process.env.SOLVIO_TWILIO_AUTH_TOKEN) || cleanEnv(process.env.TWILIO_AUTH_TOKEN);
}

export function getTwilioAccountSid(): string {
  return cleanEnv(process.env.SOLVIO_TWILIO_ACCOUNT_SID) || cleanEnv(process.env.TWILIO_ACCOUNT_SID);
}

export function getTwilioSmsFrom(): string {
  return (
    cleanEnv(process.env.SOLVIO_TWILIO_FROM_NUMBER) ||
    cleanEnv(process.env.TWILIO_FROM_NUMBER) ||
    cleanEnv(process.env.TWILIO_PHONE_NUMBER)
  );
}

export function getTwilioWhatsAppFrom(): string {
  return cleanEnv(process.env.SOLVIO_TWILIO_WHATSAPP_FROM) || cleanEnv(process.env.TWILIO_WHATSAPP_NUMBER);
}

export function isTwilioSmsConfigured(): boolean {
  return Boolean(getTwilioAccountSid() && getTwilioAuthToken() && getTwilioSmsFrom());
}

/** Validate X-Twilio-Signature for application/x-www-form-urlencoded POSTs. */
export function validateTwilioSignature(
  signature: string | null,
  url: string,
  params: Record<string, string>,
): boolean {
  const authToken = getTwilioAuthToken();
  if (!authToken || !signature) return false;

  const sortedKeys = Object.keys(params).sort();
  let data = url;
  for (const key of sortedKeys) {
    data += key + params[key];
  }

  const expected = crypto.createHmac("sha1", authToken).update(data, "utf8").digest("base64");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export async function parseTwilioFormBody(request: Request): Promise<Record<string, string>> {
  const text = await request.text();
  const params: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(text)) {
    params[key] = value;
  }
  return params;
}

export function webhookBaseUrl(): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (site) return site;
  return "https://www.solviosystems.com";
}

export async function relayTwilioMessageToMobile(opts: {
  fromLabel: string;
  body: string;
  channel: "sms" | "whatsapp";
}): Promise<{ ok: boolean; detail?: string }> {
  const sid = getTwilioAccountSid();
  const token = getTwilioAuthToken();
  const from = getTwilioSmsFrom();
  const to = getTwilioForwardTo();

  if (!sid || !token || !from) {
    return { ok: false, detail: "Twilio not configured for outbound relay SMS." };
  }

  const prefix = opts.channel === "whatsapp" ? "WhatsApp" : "SMS";
  const relayBody = `[Solvio ${prefix} → ${opts.fromLabel}]\n${opts.body.trim()}`.slice(0, 1200);

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      To: to,
      From: from,
      Body: relayBody,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("[twilio-relay] send failed:", res.status, detail.slice(0, 300));
    return { ok: false, detail: `Twilio ${res.status}` };
  }

  return { ok: true };
}
