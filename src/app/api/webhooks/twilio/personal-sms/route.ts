import { NextResponse } from "next/server";

import {
  getTwilioAccountSid,
  getTwilioAuthToken,
  getTwilioForwardTo,
  getTwilioSmsFrom,
  parseTwilioFormBody,
} from "@/lib/twilio-webhook";

export const runtime = "nodejs";

function emptyTwiml() {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

function digits(s: string): string {
  return (s || "").replace(/[^\d]/g, "");
}

/**
 * Inbound SMS to the owner's JARVIS line → relayed to their personal mobile as a
 * JARVIS-branded notification, so they see every text (who + what) even when the
 * Mac is off. Guarded so the owner's own replies don't echo back to themselves.
 */
export async function POST(request: Request) {
  const params = await parseTwilioFormBody(request);
  const from = (params.From || "").trim() || "unknown";
  const body = (params.Body || "").trim();

  const sid = getTwilioAccountSid();
  const token = getTwilioAuthToken();
  const fromLine = getTwilioSmsFrom();
  const mobile = getTwilioForwardTo();

  // Don't relay the owner's own messages back to themselves (no echo loop).
  const isOwner = mobile && digits(from).endsWith(digits(mobile).slice(-9));

  if (body && sid && token && fromLine && mobile && !isOwner) {
    const text = `📱 JARVIS — new text from ${from}:\n"${body}"`.slice(0, 1500);
    try {
      const auth = Buffer.from(`${sid}:${token}`).toString("base64");
      await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: mobile, From: fromLine, Body: text }),
      });
    } catch (e) {
      console.error("[personal-sms] relay failed", e);
    }
  }

  return emptyTwiml();
}

export async function GET() {
  return NextResponse.json({ ok: true, handler: "jarvis-personal-sms-relay" });
}
