import { getVapiMarketingBootstrap } from "@/lib/vapi-marketing-bootstrap";

/** Same ElevenLabs model as the homepage marketing Vapi agent. */
export const PLATFORM_ELEVENLABS_VOICE_MODEL = "eleven_turbo_v2_5";

export type PlatformElevenLabsVoice = {
  voiceId: string;
  model: string;
  source: "env" | "marketing_vapi" | "none";
};

function trimEnv(name: string): string {
  const v = process.env[name];
  return typeof v === "string" ? v.trim() : "";
}

/** Explicit platform voice id — set to match homepage / marketing Vapi assistant. */
export function getPlatformElevenLabsVoiceIdFromEnv(): string {
  return trimEnv("SOLVIO_PLATFORM_ELEVENLABS_VOICE_ID") || trimEnv("SOLVIO_VOICE_DEMO_VOICE_ID");
}

/**
 * The one Solvio platform voice (homepage + every merchant receptionist).
 * Env first, then ElevenLabs voice id from the marketing Vapi assistant profile.
 */
export async function resolvePlatformElevenLabsVoice(): Promise<PlatformElevenLabsVoice> {
  const fromEnv = getPlatformElevenLabsVoiceIdFromEnv();
  if (fromEnv) {
    return { voiceId: fromEnv, model: PLATFORM_ELEVENLABS_VOICE_MODEL, source: "env" };
  }

  const boot = await getVapiMarketingBootstrap();
  const fromMarketing = boot?.elevenlabsVoiceId?.trim() ?? "";
  if (fromMarketing) {
    return { voiceId: fromMarketing, model: PLATFORM_ELEVENLABS_VOICE_MODEL, source: "marketing_vapi" };
  }

  return { voiceId: "", model: PLATFORM_ELEVENLABS_VOICE_MODEL, source: "none" };
}
