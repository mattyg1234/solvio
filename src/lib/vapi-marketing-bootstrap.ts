import { getSolvioVapiApiKey } from "@/lib/voice-platform-env";

/** Cached GET /assistant/{id} for marketing previews (TTL reduces duplicate calls from TTS + scenario). */
export type VapiMarketingBootstrap = {
  elevenlabsVoiceId: string | null;
  /** Vapi assistant `firstMessage`; used to align scripted previews with browser voice. */
  firstMessage: string | null;
};

type CacheSlot = {
  fetchedAtMs: number;
  payload: VapiMarketingBootstrap | "error";
};

const TTL_MS = 120_000;
let cacheSlot: CacheSlot | null = null;
let cachedAssistantId = "";

async function fetchAssistantPayload(assistantId: string): Promise<{ ok: boolean; payload: Record<string, unknown> | null }> {
  const key = getSolvioVapiApiKey().trim();
  if (!key) return { ok: false, payload: null };

  let res: Response;
  try {
    res = await fetch(`https://api.vapi.ai/assistant/${encodeURIComponent(assistantId)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
  } catch {
    return { ok: false, payload: null };
  }

  if (!res.ok) return { ok: false, payload: null };

  try {
    const json = (await res.json()) as unknown;
    if (json !== null && typeof json === "object") {
      return { ok: true, payload: json as Record<string, unknown> };
    }
  } catch {
    /* empty */
  }
  return { ok: false, payload: null };
}

function pickElevenLabsVoiceId(raw: Record<string, unknown>): string | null {
  const v = raw.voice;
  if (!v || typeof v !== "object") return null;
  const vo = v as Record<string, unknown>;
  const id = typeof vo.voiceId === "string" ? vo.voiceId.trim() : "";
  if (!id) return null;
  const provider = typeof vo.provider === "string" ? vo.provider.toLowerCase() : "";
  if (provider === "11labs" || provider === "elevenlabs") return id;
  // Some workspaces omit provider on legacy assistants but still expose an ElevenLabs id.
  return id.length >= 8 ? id : null;
}

function pickFirstMessage(raw: Record<string, unknown>): string | null {
  const fm = raw.firstMessage;
  if (typeof fm === "string" && fm.trim()) return fm.trim();
  return null;
}

function mapPayload(payload: Record<string, unknown>): VapiMarketingBootstrap {
  return {
    elevenlabsVoiceId: pickElevenLabsVoiceId(payload),
    firstMessage: pickFirstMessage(payload),
  };
}

/** Reads server env assistant id plus `SOLVIO_VAPI_API_KEY`. Safe for SSR routes. */

export async function getVapiMarketingBootstrap(
  assistantIdOverride?: string,
): Promise<VapiMarketingBootstrap | null> {
  const assistantId =
    assistantIdOverride?.trim() ||
    process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID?.trim() ||
    process.env.SOLVIO_MARKETING_VAPI_ASSISTANT_ID?.trim() ||
    "";
  if (!assistantId) return null;

  const now = Date.now();
  if (
    cacheSlot &&
    cachedAssistantId === assistantId &&
    now - cacheSlot.fetchedAtMs < TTL_MS
  ) {
    return cacheSlot.payload === "error" ? null : cacheSlot.payload;
  }

  const { ok, payload } = await fetchAssistantPayload(assistantId);
  if (!ok || !payload) {
    cacheSlot = { fetchedAtMs: now, payload: "error" };
    cachedAssistantId = assistantId;
    return null;
  }

  const mapped = mapPayload(payload);
  cacheSlot = { fetchedAtMs: now, payload: mapped };
  cachedAssistantId = assistantId;
  return mapped;
}
