import { NextResponse } from "next/server";

import { parseTwilioFormBody, webhookBaseUrl } from "@/lib/twilio-webhook";

export const runtime = "nodejs";

/**
 * Runs after the owner's phone was rung. If they answered, the call is over —
 * hang up. If they didn't (no-answer / busy / failed), take a voicemail.
 */
export async function POST(req: Request) {
  const params = await parseTwilioFormBody(req);
  const status = (params.DialCallStatus || "").toLowerCase();

  if (status === "completed") {
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?>\n<Response><Hangup/></Response>`,
      { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } },
    );
  }

  const recordDone = `${webhookBaseUrl()}/api/webhooks/twilio/personal-voice/voicemail`;
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Brian">Sorry, I can't take your call right now. Please leave a message after the tone, and I'll get back to you.</Say>
  <Record maxLength="120" playBeep="true" transcribe="true" action="${recordDone}" method="POST"/>
  <Say voice="Polly.Brian">Thanks, goodbye.</Say>
  <Hangup/>
</Response>`;

  return new NextResponse(twiml, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

export async function GET(req: Request) {
  return POST(req);
}
