import { NextResponse } from "next/server";

import { getVapiMarketingBootstrap } from "@/lib/vapi-marketing-bootstrap";

type Line = { role: "user" | "assistant"; text: string };

const DEFAULT_LINES_PERSONAL_VOICE: Line[] = [
  {
    role: "assistant",
    text: "Tap the purple microphone when Vapi keys are configured to talk live with your assistant.",
  },
  {
    role: "user",
    text: "What can you help me with?",
  },
  {
    role: "assistant",
    text: "Your assistant answers from the prompt you configured in the Vapi dashboard.",
  },
];

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
