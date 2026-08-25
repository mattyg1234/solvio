import { NextResponse } from "next/server";

import { getTwilioForwardTo, getTwilioSmsFrom } from "@/lib/twilio-webhook";

export const runtime = "nodejs";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Inbound voice → forward to SOLVIO_TWILIO_FORWARD_TO (default +34604189230). */
export async function POST() {
  const forwardTo = escapeXml(getTwilioForwardTo());
  const callerId = getTwilioSmsFrom();
  const callerAttr = callerId ? ` callerId="${escapeXml(callerId)}"` : "";
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial${callerAttr}>${forwardTo}</Dial>
</Response>`;

  return new NextResponse(twiml, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

export async function GET() {
  return POST();
}
