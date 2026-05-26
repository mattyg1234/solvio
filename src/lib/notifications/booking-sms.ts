import type { NotificationSendResult } from "@/lib/notifications/booking-emails";

function twilioConfig() {
  const sid = process.env.SOLVIO_TWILIO_ACCOUNT_SID?.trim() || process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.SOLVIO_TWILIO_AUTH_TOKEN?.trim() || process.env.TWILIO_AUTH_TOKEN?.trim();
  const from =
    process.env.SOLVIO_TWILIO_FROM_NUMBER?.trim() ||
    process.env.TWILIO_FROM_NUMBER?.trim() ||
    process.env.TWILIO_PHONE_NUMBER?.trim();
  return { sid, token, from };
}

/** Lightweight Twilio helper — no SDK dependency beyond fetch. */
export async function sendBookingSms(opts: {
  phoneE164: string;
  body: string;
}): Promise<NotificationSendResult> {
  const { sid, token, from } = twilioConfig();
  if (!sid || !token || !from) {
    return {
      ok: false,
      reason: "not_configured",
      message: "Twilio is not configured (SOLVIO_TWILIO_ACCOUNT_SID / AUTH_TOKEN / FROM_NUMBER).",
    };
  }

  const to = opts.phoneE164.trim().replace(/\s+/g, "");
  if (!to.startsWith("+") || opts.body.trim().length < 3) {
    return { ok: false, reason: "invalid_recipient", message: "Guest phone number is missing or invalid." };
  }

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      To: to,
      From: from,
      Body: opts.body.slice(0, 1200),
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("[booking-sms] Twilio error:", res.status, detail.slice(0, 300));
    return {
      ok: false,
      reason: "provider_error",
      message: `Twilio returned ${res.status}.`,
    };
  }

  return { ok: true };
}

export async function sendBookingRequestReceivedSms(opts: {
  phoneE164: string;
  merchantName: string;
}): Promise<NotificationSendResult> {
  const merchant = opts.merchantName.trim() || "your venue";
  return sendBookingSms({
    phoneE164: opts.phoneE164,
    body: `${merchant}: we received your booking request and will confirm soon. — Solvio`,
  });
}

export function isTwilioConfigured(): boolean {
  const { sid, token, from } = twilioConfig();
  return Boolean(sid && token && from);
}
