import { NextResponse } from "next/server";

import {
  parseCallBookingDetailsFromToolArgs,
  resolveBusinessIdForVapiToolCall,
} from "@/lib/booking-from-phone-call";
import { SEND_DEPOSIT_PAYMENT_LINK_TOOL_NAME } from "@/lib/booking-guest-call-tools";
import { sendGuestDepositPaymentLink } from "@/lib/booking-guest-payment-link";
import { getSolvioVapiWebhookSecret } from "@/lib/voice-platform-env";

export const runtime = "nodejs";

type ToolCallRow = {
  id?: string;
  name?: string;
  arguments?: Record<string, unknown>;
};

type VapiToolCallsMessage = {
  type?: string;
  toolCallList?: ToolCallRow[];
  call?: {
    id?: string;
    assistantId?: string;
    phoneNumberId?: string;
    metadata?: Record<string, unknown>;
    customer?: { number?: string };
  };
  assistant?: { id?: string };
};

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function parseAmountEuroCents(args: Record<string, unknown> | undefined): number | undefined {
  const raw = args?.amountEuro ?? args?.amount_euro ?? args?.amount;
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number.parseFloat(raw) : NaN;
  if (!Number.isFinite(n) || n < 0.5) return undefined;
  return Math.round(n * 100);
}

function toolResultMessage(toolCallId: string, result: string): { toolCallId: string; result: string } {
  return { toolCallId, result };
}

/** Vapi server URL — handles live tool calls during outbound guest AI calls (deposit links per business). */
export async function POST(req: Request) {
  const expected = getSolvioVapiWebhookSecret();
  if (expected) {
    const provided = req.headers.get("x-vapi-secret") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
    if (provided !== expected) {
      return NextResponse.json({ ok: false, error: "bad secret" }, { status: 401 });
    }
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  const msg = (body && typeof body === "object" && "message" in body
    ? (body as { message: VapiToolCallsMessage }).message
    : (body as VapiToolCallsMessage)) ?? {};

  if (msg.type !== "tool-calls" || !Array.isArray(msg.toolCallList) || !msg.toolCallList.length) {
    return NextResponse.json({ ok: true, ignored: msg.type ?? "unknown" });
  }

  const metadata = msg.call?.metadata && typeof msg.call.metadata === "object" ? msg.call.metadata : {};
  const businessId = await resolveBusinessIdForVapiToolCall({
    metadata,
    assistantId: asString(msg.call?.assistantId) || asString(msg.assistant?.id),
    phoneNumberId: asString(msg.call?.phoneNumberId),
  });
  const bookingRequestId = asString(metadata.solvio_booking_request_id);
  const venueCalendarBookingId = asString(metadata.solvio_venue_calendar_booking_id);
  const guestPhone = asString(metadata.solvio_guest_phone) || asString(msg.call?.customer?.number);
  const vapiCallId = asString(msg.call?.id);

  const results: { toolCallId: string; result: string }[] = [];

  for (const toolCall of msg.toolCallList) {
    const toolCallId = asString(toolCall.id) || "unknown";
    const name = asString(toolCall.name);

    if (name !== SEND_DEPOSIT_PAYMENT_LINK_TOOL_NAME) {
      results.push(toolResultMessage(toolCallId, "That action isn't available on this call."));
      continue;
    }

    if (!businessId) {
      results.push(toolResultMessage(toolCallId, "This call isn't linked to a business — can't send a payment link."));
      continue;
    }

    if (!guestPhone) {
      results.push(
        toolResultMessage(toolCallId, "No mobile number on this call — ask the guest to confirm their phone first."),
      );
      continue;
    }

    const callBookingDetails = parseCallBookingDetailsFromToolArgs(toolCall.arguments) ?? undefined;

    if (!bookingRequestId && !venueCalendarBookingId && !callBookingDetails) {
      results.push(
        toolResultMessage(
          toolCallId,
          "Need their confirmed name, date (YYYY-MM-DD), time, and party size before sending payment — ask for anything missing, then call this tool again.",
        ),
      );
      continue;
    }

    const amountCents = parseAmountEuroCents(toolCall.arguments);

    const res = await sendGuestDepositPaymentLink({
      businessId,
      guestPhoneE164: guestPhone,
      bookingRequestId: bookingRequestId || undefined,
      venueCalendarBookingId: venueCalendarBookingId || undefined,
      amountCents,
      vapiCallId: vapiCallId || undefined,
      callBookingDetails: callBookingDetails ?? undefined,
    });

    if (!res.ok) {
      results.push(toolResultMessage(toolCallId, res.message));
      continue;
    }

    if (res.alreadyPaid) {
      results.push(
        toolResultMessage(
          toolCallId,
          "Their deposit is already marked paid — reassure them their booking is confirmed. Do not read any URL aloud.",
        ),
      );
      continue;
    }

    if (res.smsSent) {
      results.push(
        toolResultMessage(
          toolCallId,
          `Success: booking saved and a ${res.amountLabel} deposit link was texted to their phone with all their booking details. Tell them to open the text and pay on Stripe when ready. Do NOT read the URL aloud — it is only in the text.`,
        ),
      );
    } else {
      results.push(
        toolResultMessage(
          toolCallId,
          `Booking was saved and a ${res.amountLabel} deposit link was created, but SMS could not be sent. Apologise and say the venue team will text or email the link shortly. Never read the URL aloud on the phone.`,
        ),
      );
    }
  }

  return NextResponse.json({ results });
}
