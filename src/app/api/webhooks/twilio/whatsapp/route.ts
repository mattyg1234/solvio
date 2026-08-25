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

/** Inbound WhatsApp → SMS notification to SOLVIO_TWILIO_FORWARD_TO (no auto-reply to customer). */
export async function POST(request: Request) {
  const params = await parseTwilioFormBody(request);
  const signature = request.headers.get("x-twilio-signature");
  const url = `${webhookBaseUrl()}/api/webhooks/twilio/whatsapp`;

  const authToken =
    process.env.SOLVIO_TWILIO_AUTH_TOKEN?.trim() || process.env.TWILIO_AUTH_TOKEN?.trim() || "";
  if (authToken && !validateTwilioSignature(signature, url, params)) {
    return NextResponse.json({ error: "Invalid Twilio signature." }, { status: 403 });
  }

  const fromRaw = params.From?.trim() || "unknown";
  const fromLabel = fromRaw.replace(/^whatsapp:/i, "");
  const body = params.Body?.trim() || params.ProfileName?.trim() || "";

  if (body) {
    await relayTwilioMessageToMobile({
      fromLabel,
      body,
      channel: "whatsapp",
    });
  }

  return emptyTwimlResponse();
}

export async function GET() {
  return NextResponse.json({ ok: true, handler: "twilio-whatsapp-forward" });
}
