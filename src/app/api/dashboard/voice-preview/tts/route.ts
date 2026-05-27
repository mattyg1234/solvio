import { NextRequest, NextResponse } from "next/server";

import {
  findVoiceInLibrary,
  isVoiceAllowedForTier,
  SOLVIO_VOICE_DEMO_SENTENCE,
  type SubscriptionTier,
} from "@/lib/solvio-voice-library";
import { getPlatformElevenLabsVoiceIdFromEnv } from "@/lib/platform-voice-config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSolvioElevenLabsApiKey } from "@/lib/voice-platform-env";

const MAX_CHARS = 800;

function parseTier(raw: unknown): SubscriptionTier {
  if (
    raw === "booking" ||
    raw === "pro" ||
    raw === "business" ||
    raw === "scale" ||
    raw === "enterprise"
  ) {
    return raw;
  }
  return "trial";
}

/** Authenticated merchant preview — synthesize the demo sentence (or short custom text) for a library voice. */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const apiKey = getSolvioElevenLabsApiKey();
  if (!apiKey) {
    return NextResponse.json({ error: "not_configured", hint: "SOLVIO_ELEVENLABS_API_KEY missing." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const payload = body !== null && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const voiceId = typeof payload.voiceId === "string" ? payload.voiceId.trim() : "";
  const businessId = typeof payload.businessId === "string" ? payload.businessId.trim() : "";

  if (!voiceId || !businessId) {
    return NextResponse.json({ error: "voiceId_and_businessId_required" }, { status: 400 });
  }

  const { data: biz } = await supabase
    .from("businesses")
    .select("subscription_tier")
    .eq("id", businessId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!biz) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const tier = parseTier(biz.subscription_tier);
  const platformVoiceId = getPlatformElevenLabsVoiceIdFromEnv();
  const voice = findVoiceInLibrary(voiceId, platformVoiceId);

  if (!voice) {
    return NextResponse.json({ error: "unknown_voice" }, { status: 400 });
  }

  if (!isVoiceAllowedForTier(voice, tier)) {
    return NextResponse.json({ error: "plan_required", minTier: voice.minTier }, { status: 403 });
  }

  const rawText =
    typeof payload.text === "string"
      ? payload.text.trim().replace(/\s+/g, " ")
      : SOLVIO_VOICE_DEMO_SENTENCE;

  if (!rawText) {
    return NextResponse.json({ error: "text_required" }, { status: 400 });
  }
  if (rawText.length > MAX_CHARS) {
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
      text: rawText,
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
