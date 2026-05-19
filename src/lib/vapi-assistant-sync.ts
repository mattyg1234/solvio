import { getSolvioVapiApiKey } from "@/lib/voice-platform-env";

export type VapiAssistantPromptPatch = {
  firstMessage?: string;
  systemPrompt?: string;
};

type VapiModelPayload = {
  provider?: string;
  model?: string;
  messages?: { role?: string; content?: string }[];
  [key: string]: unknown;
};

async function fetchAssistant(assistantId: string, apiKey: string): Promise<Record<string, unknown> | null> {
  let res: Response;
  try {
    res = await fetch(`https://api.vapi.ai/assistant/${encodeURIComponent(assistantId)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  try {
    const json = (await res.json()) as unknown;
    return json !== null && typeof json === "object" ? (json as Record<string, unknown>) : null;
  } catch {
    return null;
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

/** PATCH Vapi assistant firstMessage + system prompt (preserves model provider/id). */
export async function syncVapiAssistantPrompt(
  assistantId: string,
  patch: VapiAssistantPromptPatch,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const id = assistantId.trim();
  if (!id) return { ok: false, message: "Missing assistant id." };

  const apiKey = getSolvioVapiApiKey().trim();
  if (!apiKey) {
    return { ok: false, message: "SOLVIO_VAPI_API_KEY is not configured on this deployment." };
  }

  const existing = await fetchAssistant(id, apiKey);
  if (!existing) {
    return { ok: false, message: "Could not load assistant from Vapi — check the assistant id and API key." };
  }

  const body: Record<string, unknown> = {};
  if (patch.firstMessage?.trim()) body.firstMessage = patch.firstMessage.trim();

  if (patch.systemPrompt?.trim()) {
    const rawModel = existing.model;
    const model =
      rawModel !== null && typeof rawModel === "object" ? (rawModel as VapiModelPayload) : ({} as VapiModelPayload);
    body.model = mergeSystemMessage(model, patch.systemPrompt.trim());
  }

  if (!Object.keys(body).length) {
    return { ok: false, message: "Nothing to sync — provide a first message or system prompt." };
  }

  let res: Response;
  try {
    res = await fetch(`https://api.vapi.ai/assistant/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    return { ok: false, message: "Could not reach Vapi — try again shortly." };
  }

  if (!res.ok) {
    return { ok: false, message: `Vapi returned ${res.status} updating the assistant.` };
  }

  return { ok: true };
}
