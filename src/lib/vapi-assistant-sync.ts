import { PLATFORM_ELEVENLABS_VOICE_MODEL } from "@/lib/platform-voice-config";
import {
  getSolvioVapiAgentAnthropicModel,
  getSolvioVapiApiKey,
} from "@/lib/voice-platform-env";

export type VapiAssistantSyncPatch = {
  assistantName?: string;
  firstMessage?: string;
  systemPrompt?: string;
  elevenlabsVoiceId?: string;
  elevenlabsVoiceModel?: string;
};

type VapiModelPayload = {
  provider?: string;
  model?: string;
  messages?: { role?: string; content?: string }[];
  [key: string]: unknown;
};

type VapiVoicePayload = {
  provider?: string;
  voiceId?: string;
  model?: string;
  [key: string]: unknown;
};

async function vapiFetchOnce(
  apiKey: string,
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> | null }> {
  let res: Response;
  try {
    res = await fetch(`https://api.vapi.ai${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
      cache: "no-store",
    });
  } catch {
    return { ok: false, status: 0, json: null };
  }
  try {
    const raw = await res.json();
    const json = raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
    return { ok: res.ok, status: res.status, json };
  } catch {
    return { ok: res.ok, status: res.status, json: null };
  }
}

/** One retry on 5xx / network error — Vapi 503s are typically transient. */
async function vapiFetch(
  apiKey: string,
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> | null }> {
  const first = await vapiFetchOnce(apiKey, path, init);
  if (first.ok) return first;
  if (first.status !== 0 && first.status < 500) return first;
  await new Promise((r) => setTimeout(r, 600));
  return vapiFetchOnce(apiKey, path, init);
}

/** Short, human-readable reason from a Vapi error body — best-effort. */
function summarizeVapiError(json: Record<string, unknown> | null): string {
  if (!json) return "";
  const msg = (json as { message?: unknown }).message;
  if (typeof msg === "string" && msg.trim()) return msg.trim().slice(0, 200);
  if (Array.isArray(msg)) {
    const joined = msg.filter((m) => typeof m === "string").join("; ");
    if (joined) return joined.slice(0, 200);
  }
  const err = (json as { error?: unknown }).error;
  if (typeof err === "string" && err.trim()) return err.trim().slice(0, 200);
  return "";
}

function isTransientVapiStatus(status: number): boolean {
  return status === 503 || status === 502 || status === 504 || status === 429;
}

function formatVapiError(action: string, status: number, json: Record<string, unknown> | null): string {
  const detail = summarizeVapiError(json);
  const suffix = detail ? `: ${detail}` : "";
  if (isTransientVapiStatus(status)) {
    return `Voice service is temporarily unavailable (${status}) while ${action}${suffix}. Wait a moment and save again.`;
  }
  if (status === 401 || status === 403) {
    return `Voice service authentication failed (${status}) while ${action}${suffix}. Contact Solvio support if this persists.`;
  }
  return `Voice service returned ${status || "error"} while ${action}${suffix}.`;
}

async function vapiFetchWithRetry(
  apiKey: string,
  path: string,
  init?: RequestInit,
  attempts = 3,
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> | null }> {
  let last = await vapiFetch(apiKey, path, init);
  for (let i = 1; i < attempts && !last.ok && isTransientVapiStatus(last.status); i++) {
    await new Promise((r) => setTimeout(r, 1200 * i));
    last = await vapiFetch(apiKey, path, init);
  }
  return last;
}

function defaultMerchantModel(systemPrompt: string): VapiModelPayload {
  return {
    provider: "anthropic",
    model: getSolvioVapiAgentAnthropicModel(),
    messages: [{ role: "system", content: systemPrompt }],
  };
}

function defaultMerchantVoice(voiceId: string, model = PLATFORM_ELEVENLABS_VOICE_MODEL): VapiVoicePayload {
  return {
    provider: "11labs",
    voiceId,
    model,
  };
}

function defaultMerchantTranscriber() {
  return {
    provider: "deepgram",
    model: "nova-3",
    language: "multi",
  };
}

/** Create a dedicated Vapi assistant for a merchant venue. */
export async function createMerchantVapiAssistant(
  patch: Required<
    Pick<VapiAssistantSyncPatch, "assistantName" | "firstMessage" | "systemPrompt" | "elevenlabsVoiceId">
  > &
    Pick<VapiAssistantSyncPatch, "elevenlabsVoiceModel">,
): Promise<{ ok: true; assistantId: string } | { ok: false; message: string }> {
  const apiKey = getSolvioVapiApiKey().trim();
  if (!apiKey) {
    return { ok: false, message: "SOLVIO_VAPI_API_KEY is not configured on this deployment." };
  }

  const body = {
    name: patch.assistantName.trim(),
    firstMessage: patch.firstMessage.trim(),
    firstMessageMode: "assistant-speaks-first",
    model: defaultMerchantModel(patch.systemPrompt.trim()),
    voice: defaultMerchantVoice(
      patch.elevenlabsVoiceId.trim(),
      patch.elevenlabsVoiceModel?.trim() || PLATFORM_ELEVENLABS_VOICE_MODEL,
    ),
    transcriber: defaultMerchantTranscriber(),
  };

  const { ok, status, json } = await vapiFetch(apiKey, "/assistant", {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!ok || !json) {
    return { ok: false, message: formatVapiError("creating your assistant", status, json) };
  }

  const id = typeof json.id === "string" ? json.id.trim() : "";
  if (!id) return { ok: false, message: "Assistant was created but no id was returned. Try saving again." };
  return { ok: true, assistantId: id };
}

/** PATCH Vapi assistant name, voice, first message, and system prompt. */
export async function syncVapiAssistantConfig(
  assistantId: string,
  patch: VapiAssistantSyncPatch,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const id = assistantId.trim();
  if (!id) return { ok: false, message: "Missing assistant id." };

  const apiKey = getSolvioVapiApiKey().trim();
  if (!apiKey) {
    return { ok: false, message: "SOLVIO_VAPI_API_KEY is not configured on this deployment." };
  }

  const existingRes = await vapiFetch(apiKey, `/assistant/${encodeURIComponent(id)}`, { method: "GET" });
  if (!existingRes.ok || !existingRes.json) {
    const hint = summarizeVapiError(existingRes.json);
    return {
      ok: false,
      message: hint
        ? `Couldn't load your assistant (${existingRes.status}): ${hint}`
        : "Couldn't load your assistant. Try saving again — contact Solvio support if it persists.",
    };
  }

  const body: Record<string, unknown> = {};

  if (patch.assistantName?.trim()) body.name = patch.assistantName.trim();
  if (patch.firstMessage?.trim()) body.firstMessage = patch.firstMessage.trim();

  if (patch.systemPrompt?.trim()) {
    body.model = defaultMerchantModel(patch.systemPrompt.trim());
  }

  if (patch.elevenlabsVoiceId?.trim()) {
    const voiceModel = patch.elevenlabsVoiceModel?.trim() || PLATFORM_ELEVENLABS_VOICE_MODEL;
    body.voice = defaultMerchantVoice(patch.elevenlabsVoiceId.trim(), voiceModel);
  }

  if (!Object.keys(body).length) {
    return { ok: false, message: "Nothing to sync — add a name, voice, greeting, or instructions." };
  }

  const patchAssistant = async (payload: Record<string, unknown>) => {
    return vapiFetchWithRetry(apiKey, `/assistant/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  };

  let { ok, status, json } = await patchAssistant(body);

  // If voice block triggers upstream 503, retry prompt-only so merchants can still save.
  if (!ok && isTransientVapiStatus(status) && body.voice) {
    const withoutVoice = { ...body };
    delete withoutVoice.voice;
    if (Object.keys(withoutVoice).length) {
      const retry = await patchAssistant(withoutVoice);
      ok = retry.ok;
      status = retry.status;
      json = retry.json;
      if (ok) {
        return { ok: true };
      }
    }
  }

  if (!ok) {
    return { ok: false, message: formatVapiError("updating the assistant", status, json) };
  }

  return { ok: true };
}

/** @deprecated Use syncVapiAssistantConfig */
export async function syncVapiAssistantPrompt(
  assistantId: string,
  patch: { firstMessage?: string; systemPrompt?: string },
): Promise<{ ok: true } | { ok: false; message: string }> {
  return syncVapiAssistantConfig(assistantId, patch);
}
