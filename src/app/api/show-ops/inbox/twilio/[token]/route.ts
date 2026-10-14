import { NextResponse } from "next/server";

import { inboundWebhookUrl, loadTwilioConnectionByWebhookToken } from "@/lib/show-ops/inbox/connection";
import { parseInboundTwilio, validTwilioSignature } from "@/lib/show-ops/inbox/logic";
import { recordInboundMessage } from "@/lib/show-ops/inbox/server";
import { parseTwilioFormBody } from "@/lib/twilio-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function twiml(status = 200) {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, {
    status,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

/**
 * Twilio "A message comes in" for the workspace's WhatsApp sender and SMS number.
 * The token in the URL names the workspace; the signature proves it is Twilio,
 * checked with that workspace's own auth token. No auto-reply is sent.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const conn = await loadTwilioConnectionByWebhookToken(token);
  if (!conn) return new NextResponse("Not found.", { status: 404 });

  const form = await parseTwilioFormBody(request);
  const urls = [request.url, inboundWebhookUrl(token)];
  if (!validTwilioSignature(conn.creds.authToken, request.headers.get("x-twilio-signature"), urls, form)) {
    return new NextResponse("Invalid signature.", { status: 403 });
  }

  const msg = parseInboundTwilio(form);
  if (!msg) return twiml();
  try {
    await recordInboundMessage(conn, msg);
  } catch (e) {
    console.error("[show-ops inbox] inbound", e instanceof Error ? e.message : e);
    // 500 makes Twilio retry; the message id keeps a retry from saving it twice.
    return twiml(500);
  }
  return twiml();
}
