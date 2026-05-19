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

async function vapiFetch(
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

function mergeSystemMessage(model: VapiModelPayload, systemPrompt: string): VapiModelPayload {
  const messages = Array.isArray(model.messages) ? [...model.messages] : [];
  const sysIdx = messages.findIndex((m) => m && typeof m === "object" && m.role === "system");
  const next = { role: "system" as const, content: systemPrompt };
  if (sysIdx >= 0) messages[sysIdx] = next;
  else messages.unshift(next);
  return { ...model, messages };
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
    return { ok: false, message: `Vapi returned ${status || "error"} creating your assistant.` };
  }

  const id = typeof json.id === "string" ? json.id.trim() : "";
  if (!id) return { ok: false, message: "Vapi created an assistant but no id was returned." };
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
    return { ok: false, message: "Could not load assistant from Vapi — check the assistant id and API key." };
  }

  const existing = existingRes.json;
  const body: Record<string, unknown> = {};

  if (patch.assistantName?.trim()) body.name = patch.assistantName.trim();
  if (patch.firstMessage?.trim()) body.firstMessage = patch.firstMessage.trim();

  if (patch.systemPrompt?.trim()) {
    const rawModel = existing.model;
    const model =
      rawModel !== null && typeof rawModel === "object" ? (rawModel as VapiModelPayload) : ({} as VapiModelPayload);
    if (!model.provider) model.provider = "anthropic";
    if (!model.model) model.model = getSolvioVapiAgentAnthropicModel();
    body.model = mergeSystemMessage(model, patch.systemPrompt.trim());
  }

  if (patch.elevenlabsVoiceId?.trim()) {
    const voiceModel = patch.elevenlabsVoiceModel?.trim() || PLATFORM_ELEVENLABS_VOICE_MODEL;
    body.voice = defaultMerchantVoice(patch.elevenlabsVoiceId.trim(), voiceModel);
  }

  if (!Object.keys(body).length) {
    return { ok: false, message: "Nothing to sync — add a name, voice, greeting, or instructions." };
  }

  const { ok, status } = await vapiFetch(apiKey, `/assistant/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

  if (!ok) {
    return { ok: false, message: `Vapi returned ${status} updating the assistant.` };
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
