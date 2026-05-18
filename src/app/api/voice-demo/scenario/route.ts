import { NextResponse } from "next/server";

import { getVapiMarketingBootstrap } from "@/lib/vapi-marketing-bootstrap";

type Line = { role: "user" | "assistant"; text: string };

/** Mirrors `voice-demo-panel` `personal_voice` — first assistant bubble can be swapped for Vapi `firstMessage`. */
const DEFAULT_LINES_PERSONAL_VOICE: Line[] = [
  {
    role: "assistant",
    text:
      "This is how a tailored Solvio voice layer sounds when guests ask for dinner slots, tastings or private rooms—matching the pacing and colouring you bake into the persona.",
  },
  {
    role: "user",
    text: "What will you automate while I coach the floor?",
  },
  {
    role: "assistant",
    text:
      "Reminders chase themselves, itineraries stay tidy, confirmations flow by SMS or email, and transcripts land in Solvio instead of voicemail chaos—even when you are juggling multiple venues.",
  },
];

/** Public marketing bootstrap: scripted opener + ElevenLabs id aligned with NEXT_PUBLIC_VAPI_ASSISTANT_ID when fetch works. */

export async function GET() {
  const boot = await getVapiMarketingBootstrap();

  const lines: Line[] = DEFAULT_LINES_PERSONAL_VOICE.map((l, i) =>
    i === 0 && boot?.firstMessage?.trim()
      ? { role: "assistant", text: boot.firstMessage.trim() }
      : l,
  );

  const openingFromVapi = Boolean(boot?.firstMessage?.trim());

  return NextResponse.json(
    {
      source: openingFromVapi ? "vapi_opening" : "default",
      syncedVoiceId: Boolean(boot?.elevenlabsVoiceId),
      lines,
    },
    { headers: { "Cache-Control": "private, max-age=60" } },
  );
}
