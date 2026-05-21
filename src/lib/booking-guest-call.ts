import { getSolvioVapiAgentAnthropicModel } from "@/lib/voice-platform-env";

import {
  appendPaymentCollectionPrompt,
  buildDepositPaymentLinkTool,
  type GuestCallPaymentContext,
} from "@/lib/booking-guest-call-tools";

export type BookingGuestCallPurpose =
  | "booking_updated"
  | "booking_cancelled"
  | "confirm_request"
  | "guest_request_reply"
  | "custom";

export const BOOKING_GUEST_CALL_PURPOSE_LABELS: Record<BookingGuestCallPurpose, string> = {
  booking_updated: "Booking details changed",
  booking_cancelled: "Booking cancelled",
  confirm_request: "Confirm their request",
  guest_request_reply: "Reply to their request",
  custom: "Custom message",
};

export type BookingGuestCallScript = {
  firstMessage: string;
  systemPrompt: string;
  successCriteria: string;
  logBody: string;
};

function receptionistIntro(name: string | undefined, businessName: string): string {
  const who = name?.trim() || "the team";
  return `${who} from ${businessName}`;
}

export function composeBookingGuestCallScript(params: {
  businessName: string;
  guestName: string;
  bookingTitle: string;
  bookingWhen: string;
  purpose: BookingGuestCallPurpose;
  changeSummary?: string;
  customScript?: string;
  receptionistName?: string;
}): BookingGuestCallScript {
  const guest = params.guestName.trim() || "there";
  const biz = params.businessName.trim() || "the venue";
  const title = params.bookingTitle.trim() || "your booking";
  const when = params.bookingWhen.trim() || "your scheduled time";
  const intro = receptionistIntro(params.receptionistName, biz);
  const change = params.changeSummary?.trim() || params.customScript?.trim() || "";

  let firstMessage = "";
  let task = "";
  let successCriteria = "";
  let logBody = "";

  switch (params.purpose) {
    case "booking_cancelled":
      firstMessage = `Hi ${guest}, this is ${intro}. I'm calling about ${title} on ${when}.`;
      task = change
        ? `Explain the cancellation clearly: ${change}. Apologise briefly if appropriate. Offer to help rebook if they want.`
        : `Explain that ${title} on ${when} has been cancelled. Apologise briefly and offer to help rebook if they'd like.`;
      successCriteria = "Guest understands the booking is cancelled and feels looked after.";
      logBody = change ? `Cancellation call: ${change}` : "Cancellation call";
      break;
    case "booking_updated":
      firstMessage = `Hi ${guest}, this is ${intro} with a quick update about ${title}.`;
      task = change
        ? `Tell them what changed: ${change}. Confirm the new details (${when}). Answer simple questions; if unsure, say the venue will follow up by email.`
        : `Tell them something about ${title} on ${when} has changed. Share the updated details and confirm they understand.`;
      successCriteria = "Guest acknowledges the update and knows the new booking details.";
      logBody = change ? `Update call: ${change}` : "Booking update call";
      break;
    case "confirm_request":
      firstMessage = `Hi ${guest}, this is ${intro} following up on your enquiry for ${title}.`;
      task = change
        ? `Help confirm their request: ${change}. Capture any missing details (party size, time preferences, contact).`
        : `Confirm their enquiry for ${title}. Check party size, preferred time, and whether the details on file are still correct.`;
      successCriteria = "Guest confirms or clarifies their booking request.";
      logBody = change ? `Confirm request: ${change}` : "Confirm booking request";
      break;
    case "guest_request_reply":
      firstMessage = `Hi ${guest}, this is ${intro} about your message to us.`;
      task = change
        ? `Respond to what they asked: ${change}. Be helpful and concise.`
        : `Answer their enquiry politely and capture anything still needed to confirm ${title}.`;
      successCriteria = "Guest's question or change request was addressed clearly.";
      logBody = change ? `Reply to guest: ${change}` : "Reply to guest request";
      break;
    case "custom":
    default:
      firstMessage = `Hi ${guest}, this is ${intro}.`;
      task = change
        ? change
        : `Share a helpful update about ${title} on ${when}. Keep it brief and professional.`;
      successCriteria = "Guest received the message and had a chance to respond.";
      logBody = change || "Custom guest call";
      break;
  }

  const systemPrompt = [
    `You are an AI phone agent calling on behalf of ${biz}.`,
    `Guest on the line: ${guest}.`,
    `Booking context: ${title} — ${when}.`,
    "",
    "Tone: warm, clear, unhurried hospitality — never salesy.",
    "If they ask to stop or say wrong number, apologise and end the call immediately.",
    "If they want a human, note that and say someone from the venue will follow up.",
    "",
    `Your job on this call: ${task}`,
  ].join("\n");

  return { firstMessage, systemPrompt, successCriteria, logBody };
}

/** Vapi outbound override payload — mirrors merchant assistant stack. */
export function buildBookingGuestAssistantOverrides(
  script: BookingGuestCallScript,
  payment?: GuestCallPaymentContext,
): Record<string, unknown> {
  const systemPrompt = payment
    ? appendPaymentCollectionPrompt(script.systemPrompt, payment)
    : script.systemPrompt;

  const model: Record<string, unknown> = {
    provider: "anthropic",
    model: getSolvioVapiAgentAnthropicModel(),
    messages: [{ role: "system", content: systemPrompt }],
  };

  if (payment) {
    model.tools = [buildDepositPaymentLinkTool()];
  }

  return {
    firstMessage: script.firstMessage,
    firstMessageMode: "assistant-speaks-first",
    model,
  };
}

export function formatBookingWhen(startsAtIso: string, endsAtIso: string, timeZone?: string): string {
  const start = new Date(startsAtIso);
  const end = new Date(endsAtIso);
  if (Number.isNaN(start.getTime())) return "";
  const opts: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timeZone?.trim() || undefined,
  };
  const startStr = start.toLocaleString(undefined, opts);
  if (Number.isNaN(end.getTime())) return startStr;
  const endStr = end.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZone: timeZone?.trim() || undefined });
  return `${startStr} – ${endStr}`;
}

export function summarizeBookingEditChange(params: {
  prevStartsAt: string;
  prevEndsAt: string;
  nextStartsAt: string;
  nextEndsAt: string;
  prevGuestCount?: number | null;
  nextGuestCount?: number | null;
  timeZone?: string;
}): string {
  const parts: string[] = [];
  if (params.prevStartsAt !== params.nextStartsAt || params.prevEndsAt !== params.nextEndsAt) {
    parts.push(
      `Time moved from ${formatBookingWhen(params.prevStartsAt, params.prevEndsAt, params.timeZone)} to ${formatBookingWhen(params.nextStartsAt, params.nextEndsAt, params.timeZone)}.`,
    );
  }
  if (
    params.prevGuestCount != null &&
    params.nextGuestCount != null &&
    params.prevGuestCount !== params.nextGuestCount
  ) {
    parts.push(`Party size changed from ${params.prevGuestCount} to ${params.nextGuestCount}.`);
  }
  return parts.join(" ");
}
