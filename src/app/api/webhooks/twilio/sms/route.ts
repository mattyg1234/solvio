import { NextResponse } from "next/server";

import {
  parseTwilioFormBody,
  relayTwilioMessageToMobile,
  validateTwilioSignature,
  webhookBaseUrl,
} from "@/lib/twilio-webhook";

export const runtime = "nodejs";

function emptyTwimlResponse() {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

/** Inbound SMS → relay to SOLVIO_TWILIO_FORWARD_TO as an SMS notification. */
export async function POST(request: Request) {
  const params = await parseTwilioFormBody(request);
  const signature = request.headers.get("x-twilio-signature");
  const url = `${webhookBaseUrl()}/api/webhooks/twilio/sms`;

  if (getTwilioAuthTokenSafe() && !validateTwilioSignature(signature, url, params)) {
    return NextResponse.json({ error: "Invalid Twilio signature." }, { status: 403 });
  }

  const from = params.From?.trim() || "unknown";
  const body = params.Body?.trim() || "";

  if (body) {
    await relayTwilioMessageToMobile({
      fromLabel: from,
      body,
      channel: "sms",
    });
  }

  return emptyTwimlResponse();
}

function getTwilioAuthTokenSafe(): string {
  return process.env.SOLVIO_TWILIO_AUTH_TOKEN?.trim() || process.env.TWILIO_AUTH_TOKEN?.trim() || "";
}

export async function GET() {
  return NextResponse.json({ ok: true, handler: "twilio-sms-forward" });
}
