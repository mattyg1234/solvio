import { NextResponse } from "next/server";

import { SOLVIO_MARKETING_FIRST_MESSAGE } from "@/lib/solvio-marketing-receptionist";
import { getVapiMarketingBootstrap } from "@/lib/vapi-marketing-bootstrap";

type Line = { role: "user" | "assistant"; text: string };

const DEFAULT_LINES_PERSONAL_VOICE: Line[] = [
  {
    role: "assistant",
    text: SOLVIO_MARKETING_FIRST_MESSAGE,
  },
  {
    role: "user",
    text: "What does Solvio actually do for a busy restaurant?",
  },
  {
    role: "assistant",
    text:
      "We answer calls and take bookings around the clock, run your public booking page for tables and events, chase confirmations, and collect Stripe deposits — all in one calm dashboard.",
  },
];

/** Public marketing bootstrap: scripted opener + ElevenLabs id aligned with NEXT_PUBLIC_VAPI_ASSISTANT_ID when fetch works. */

export async function GET() {
  const boot = await getVapiMarketingBootstrap();

  const lines: Line[] = DEFAULT_LINES_PERSONAL_VOICE;

  const openingFromVapi = Boolean(boot?.elevenlabsVoiceId);

  return NextResponse.json(
    {
      source: openingFromVapi ? "vapi_voice" : "default",
      syncedVoiceId: Boolean(boot?.elevenlabsVoiceId),
      lines,
    },
    { headers: { "Cache-Control": "private, max-age=60" } },
  );
}
