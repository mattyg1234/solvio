import { NextResponse } from "next/server";

import { getTwilioForwardTo, webhookBaseUrl } from "@/lib/twilio-webhook";

export const runtime = "nodejs";

/**
 * Personal inbound line for the owner (e.g. the UK number that used to be
 * answered by an AI assistant). Behaviour:
 *   1. Ring the owner's mobile, showing the REAL caller's number so they know
 *      who it is.
 *   2. If they don't answer in time (or it's busy), take a voicemail.
 *
 * No AI answers the call — it just rings through to a human, then voicemail.
 * Forward target comes from SOLVIO_TWILIO_FORWARD_TO; ring time from
 * PERSONAL_FORWARD_TIMEOUT (default 20s).
 */
function xml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function callerNumber(req: Request): Promise<string> {
  try {
    const form = await req.formData();
    return String(form.get("From") || "").trim();
  } catch {
    return "";
  }
}

export async function POST(req: Request) {
  const forwardTo = getTwilioForwardTo();
  const from = await callerNumber(req);
  const timeout = Number(process.env.PERSONAL_FORWARD_TIMEOUT || "20");
  // Show the real caller's number to the owner when possible; fall back to the
  // owner's own line if Twilio won't allow the caller id.
  const callerAttr = from ? ` callerId="${xml(from)}"` : "";
  const afterUrl = `${webhookBaseUrl()}/api/webhooks/twilio/personal-voice/after`;

  // After the Dial finishes, Twilio re-requests the action URL with
  // DialCallStatus. If the owner didn't pick up, we drop into voicemail.
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial timeout="${timeout}"${callerAttr} action="${xml(afterUrl)}" method="POST">${xml(forwardTo)}</Dial>
</Response>`;

  return new NextResponse(twiml, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

export async function GET(req: Request) {
  return POST(req);
}
