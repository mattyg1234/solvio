import type { NotificationSendResult } from "@/lib/notifications/booking-emails";
import {
  getTwilioAccountSid,
  getTwilioAuthToken,
  getTwilioSmsFrom,
  isTwilioSmsConfigured,
} from "@/lib/twilio-webhook";

function twilioConfig() {
  return {
    sid: getTwilioAccountSid(),
    token: getTwilioAuthToken(),
    from: getTwilioSmsFrom(),
  };
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

export async function sendBookingConfirmedSms(opts: {
  phoneE164: string;
  merchantName: string;
  title: string;
  timeZone?: string;
}): Promise<NotificationSendResult> {
  const merchant = opts.merchantName.trim() || "your venue";
  const title = opts.title.trim() || "your booking";
  const tz = opts.timeZone?.trim();
  const tzNote = tz ? ` (${tz})` : "";
  return sendBookingSms({
    phoneE164: opts.phoneE164,
    body: `Confirmed: ${merchant.slice(0, 60)} · ${title.slice(0, 72)}${tzNote}. Details emailed. — Solvio`,
  });
}

export function isTwilioConfigured(): boolean {
  return isTwilioSmsConfigured();
}

function kindLabel(bookingKind: string): string {
  return bookingKind
    ? bookingKind.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "Booking";
}

/** Text the venue owner when a guest books — uses the mobile from onboarding. */
export async function sendNewBookingNotificationSms(opts: {
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

  const headline = opts.autoConfirmed ? `${venue}: booking confirmed` : `${venue}: new ${kind.toLowerCase()} request`;

  const lines = [
    headline,
    `Guest: ${guest}`,
    `Date: ${date}`,
    `Time: ${time}`,
    ...(guests ? [`Party: ${guests}`] : []),
    `Diary: ${diaryUrl}`,
    "— Solvio",
  ];

  return sendBookingSms({
    phoneE164: opts.merchantPhoneE164,
    body: lines.join("\n"),
  });
}
