import type { NotificationSendResult } from "@/lib/notifications/booking-emails";
import { isLikelyWhatsAppE164, toTwilioWhatsAppAddress } from "@/lib/whatsapp-phone";
import {
  getTwilioAccountSid,
  getTwilioAuthToken,
  getTwilioWhatsAppFrom,
} from "@/lib/twilio-webhook";

function twilioConfig() {
  return {
    sid: getTwilioAccountSid(),
    token: getTwilioAuthToken(),
    whatsappFrom: getTwilioWhatsAppFrom(),
  };
}

export function isTwilioWhatsAppConfigured(): boolean {
  const { sid, token, whatsappFrom } = twilioConfig();
  return Boolean(sid && token && whatsappFrom);
}

export async function sendBookingWhatsApp(opts: {
  phoneE164: string;
  body: string;
}): Promise<NotificationSendResult> {
  const { sid, token, whatsappFrom } = twilioConfig();
  if (!sid || !token || !whatsappFrom) {
    return {
      ok: false,
      reason: "not_configured",
      message:
        "Twilio WhatsApp is not configured (SOLVIO_TWILIO_ACCOUNT_SID / AUTH_TOKEN / SOLVIO_TWILIO_WHATSAPP_FROM).",
    };
  }

  const to = opts.phoneE164.trim();
  if (!to.startsWith("+") || !isLikelyWhatsAppE164(to)) {
    return {
      ok: false,
      reason: "invalid_recipient",
      message: "Merchant number is missing or not a WhatsApp-capable mobile.",
    };
  }

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;

  const params = new URLSearchParams({
    To: toTwilioWhatsAppAddress(to),
    From: toTwilioWhatsAppAddress(whatsappFrom),
  });

  params.set("Body", opts.body.slice(0, 1200));

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("[booking-whatsapp] Twilio error:", res.status, detail.slice(0, 400));
    return {
      ok: false,
      reason: "provider_error",
      message: `Twilio WhatsApp returned ${res.status}.`,
    };
  }

  return { ok: true };
}

function kindLabel(bookingKind: string): string {
  return bookingKind
    ? bookingKind.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "Booking";
}

/** Alert the venue owner on WhatsApp when a guest books via /book or voice. */
export async function sendNewBookingNotificationWhatsApp(opts: {
  merchantPhoneE164: string;
  merchantName: string;
  guestName: string;
  bookingKind: string;
  requestedDate?: string;
  preferredTime?: string;
  guestCount?: string;
  dashboardUrl: string;
  autoConfirmed?: boolean;
}): Promise<NotificationSendResult> {
  const venue = opts.merchantName.trim() || "Your venue";
  const guest = opts.guestName.trim() || "Guest";
  const kind = kindLabel(opts.bookingKind);
  const date = opts.requestedDate?.trim() || "—";
  const time = opts.preferredTime?.trim() || "—";
  const guests = opts.guestCount?.trim();
  const diaryUrl = `${opts.dashboardUrl.replace(/\/$/, "")}/dashboard/bookings`;

  const headline = opts.autoConfirmed
    ? `✅ ${venue}: booking confirmed`
    : `📅 ${venue}: new ${kind.toLowerCase()} request`;

  const lines = [
    headline,
    `Guest: ${guest}`,
    `Date: ${date}`,
    `Time: ${time}`,
    ...(guests ? [`Party: ${guests}`] : []),
    `Open diary: ${diaryUrl}`,
    "— Solvio",
  ];

  return sendBookingWhatsApp({
    phoneE164: opts.merchantPhoneE164,
    body: lines.join("\n"),
  });
}
