import { NextResponse } from "next/server";

import { parseTwilioFormBody, relayTwilioMessageToMobile } from "@/lib/twilio-webhook";

export const runtime = "nodejs";

/**
 * Fires when a voicemail recording is complete. Texts the owner the caller's
 * number and a link to the recording, so they never miss a message.
 */
export async function POST(req: Request) {
  const params = await parseTwilioFormBody(req);
  const from = params.From || "an unknown number";
  const recordingUrl = params.RecordingUrl ? `${params.RecordingUrl}.mp3` : "";
  const transcript = (params.TranscriptionText || "").trim();

  const body = [
    `📞 New voicemail from ${from}.`,
    transcript ? `"${transcript}"` : null,
    recordingUrl ? `Listen: ${recordingUrl}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    await relayTwilioMessageToMobile({ fromLabel: from, body, channel: "sms" });
  } catch (e) {
    console.error("[personal-voice] voicemail notify failed", e);
  }

  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?>\n<Response><Hangup/></Response>`,
    { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } },
  );
}

export async function GET(req: Request) {
  return POST(req);
}
