import { NextRequest, NextResponse } from "next/server";

import { getSolvioElevenLabsApiKey } from "@/lib/voice-platform-env";
import { getVapiMarketingBootstrap } from "@/lib/vapi-marketing-bootstrap";

const MAX_CHARS = 800;

/**
 * Marketing demo only: synthesize short lines with the deployment’s ElevenLabs key + voice id.
 * Never trust this for authenticated merchant flows — rate-limit by length; expand with IP limits if abused.
 */
export async function POST(req: NextRequest) {
  const apiKey = getSolvioElevenLabsApiKey();
  const explicitVoice = process.env.SOLVIO_VOICE_DEMO_VOICE_ID?.trim() ?? "";
  let voiceId = explicitVoice;
  if (!voiceId) {
    const boot = await getVapiMarketingBootstrap();
    if (boot?.elevenlabsVoiceId) voiceId = boot.elevenlabsVoiceId;
  }

  if (!apiKey || !voiceId) {
    return NextResponse.json(
      {
        error: "not_configured",
        hint:
          "Set SOLVIO_ELEVENLABS_API_KEY plus either SOLVIO_VOICE_DEMO_VOICE_ID or NEXT_PUBLIC_VAPI_ASSISTANT_ID + SOLVIO_VAPI_API_KEY so the demo can mirror your Vapi ElevenLabs voice (see .env.example).",
      },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const raw =
    body !== null && typeof body === "object" && "text" in (body as object)
      ? String((body as { text?: unknown }).text ?? "")
          .trim()
          .replace(/\s+/g, " ")
      : "";
  if (!raw) {
    return NextResponse.json({ error: "text_required" }, { status: 400 });
  }
  if (raw.length > MAX_CHARS) {
    return NextResponse.json({ error: "text_too_long" }, { status: 400 });
  }

  const modelId = process.env.SOLVIO_VOICE_DEMO_MODEL_ID?.trim() || "eleven_multilingual_v2";

  const upstream = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: raw,
      model_id: modelId,
    }),
  });

  if (!upstream.ok) {
    const snippet = await upstream.text();
    return NextResponse.json(
      { error: "elevenlabs_error", status: upstream.status, detail: snippet.slice(0, 240) },
      { status: 502 },
    );
  }

  const buf = await upstream.arrayBuffer();
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "private, max-age=300",
    },
  });
}
