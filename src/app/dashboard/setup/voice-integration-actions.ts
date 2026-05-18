"use server";

import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSolvioElevenLabsApiKey, getSolvioVapiApiKey } from "@/lib/voice-platform-env";

async function assertAuthenticatedUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

async function assertBusinessOwnedByUser(businessId: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  const { data: biz } = await supabase.from("businesses").select("id").eq("id", businessId).eq("owner_id", user.id).maybeSingle();

  if (!biz) {
    throw new Error("Business not found.");
  }
}

export type ElevenLabsVoiceOption = {
  voice_id: string;
  name: string;
};

export type VapiAssistantOption = {
  id: string;
  name: string;
};

async function fetchVapiAssistantList(trimmedKey: string): Promise<{ assistants: VapiAssistantOption[]; error?: string }> {
  if (!trimmedKey) {
    return {
      assistants: [],
      error:
        "Solvio calls are not configured on this deployment yet (missing SOLVIO_VAPI_API_KEY). Ask your Solvio admin.",
    };
  }

  let res: Response;
  try {
    res = await fetch("https://api.vapi.ai/assistant?limit=500", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${trimmedKey}`,
      },
      cache: "no-store",
    });
  } catch {
    return { assistants: [], error: "Could not reach Vapi — check your connection." };
  }

  if (!res.ok) {
    const msg =
      res.status === 401 || res.status === 403
        ? "Solvio Vapi token rejected — check SOLVIO_VAPI_API_KEY."
        : `Vapi returned ${res.status}.`;
    return { assistants: [], error: msg };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { assistants: [], error: "Unexpected response listing Vapi assistants." };
  }

  let rawRows: unknown[] = [];
  if (Array.isArray(body)) {
    rawRows = body;
  } else if (typeof body === "object" && body !== null) {
    const o = body as Record<string, unknown>;
    const candidates = ["assistants", "data", "results", "items"] as const;
    for (const k of candidates) {
      const v = o[k];
      if (Array.isArray(v)) {
        rawRows = v as unknown[];
        break;
      }
    }
  }

  const assistants: VapiAssistantOption[] = [];
  for (const row of rawRows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id : "";
    let name = typeof r.name === "string" ? r.name.trim() : "";
    if (!id) continue;
    if (!name.length) name = "Unnamed assistant";
    assistants.push({ id, name });
  }

  assistants.sort((a, b) => a.name.localeCompare(b.name));

  return { assistants };
}

/** Lists assistants on Solvio’s Vapi workspace (private key — merchants only pick names/ids here). */
export async function listVapiAssistantsForBusiness(
  businessId: string,
): Promise<{ assistants: VapiAssistantOption[]; error?: string }> {
  await assertAuthenticatedUser();
  await assertBusinessOwnedByUser(businessId);
  return fetchVapiAssistantList(getSolvioVapiApiKey());
}

async function fetchElevenLabsVoiceList(
  trimmedKey: string,
): Promise<{ voices: ElevenLabsVoiceOption[]; error?: string }> {
  if (!trimmedKey) {
    return {
      voices: [],
      error:
        "Solvio speech is not configured on this deployment yet (missing SOLVIO_ELEVENLABS_API_KEY). Ask your Solvio admin.",
    };
  }

  let res: Response;
  try {
    res = await fetch("https://api.elevenlabs.io/v1/voices", {
      method: "GET",
      headers: {
        "xi-api-key": trimmedKey,
      },
      cache: "no-store",
    });
  } catch {
    return { voices: [], error: "Could not reach ElevenLabs — check your connection." };
  }

  if (!res.ok) {
    const msg =
      res.status === 401 ? "Invalid Solvio ElevenLabs configuration." : `ElevenLabs returned ${res.status}.`;
    return { voices: [], error: msg };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { voices: [], error: "Unexpected response from ElevenLabs." };
  }

  const rawVoices =
    typeof body === "object" && body !== null && "voices" in body && Array.isArray((body as { voices: unknown }).voices)
      ? (body as { voices: unknown[] }).voices
      : [];

  const voices: ElevenLabsVoiceOption[] = [];
  for (const v of rawVoices) {
    if (!v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    const voice_id = typeof o.voice_id === "string" ? o.voice_id : "";
    const name = typeof o.name === "string" ? o.name : "";
    if (!voice_id || !name) continue;
    voices.push({ voice_id, name });
  }

  voices.sort((a, b) => a.name.localeCompare(b.name));
  return { voices };
}

/** Lists voices from Solvio’s ElevenLabs workspace (env key — merchants never paste keys). */
export async function listElevenLabsVoicesForBusiness(
  businessId: string,
): Promise<{ voices: ElevenLabsVoiceOption[]; error?: string }> {
  await assertAuthenticatedUser();
  await assertBusinessOwnedByUser(businessId);
  return fetchElevenLabsVoiceList(getSolvioElevenLabsApiKey());
}

async function pingVapi(trimmedKey: string): Promise<{ ok: boolean; message: string }> {
  if (!trimmedKey) {
    return {
      ok: false,
      message:
        "Solvio calls are not configured on this deployment yet (missing SOLVIO_VAPI_API_KEY). Ask your Solvio admin.",
    };
  }

  let res: Response;
  try {
    res = await fetch("https://api.vapi.ai/assistant?limit=1", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${trimmedKey}`,
      },
      cache: "no-store",
    });
  } catch {
    return { ok: false, message: "Could not reach Vapi — check your connection." };
  }

  if (res.ok) {
    return { ok: true, message: "Solvio Vapi workspace reachable." };
  }
  if (res.status === 401 || res.status === 403) {
    return { ok: false, message: "Solvio Vapi token rejected — check SOLVIO_VAPI_API_KEY." };
  }
  return { ok: false, message: `Vapi returned ${res.status}. Try again later.` };
}

/** Checks Solvio’s platform Vapi token (logged-in merchants only). */
export async function verifySolvioVapiConnection(): Promise<{ ok: boolean; message: string }> {
  await assertAuthenticatedUser();
  return pingVapi(getSolvioVapiApiKey());
}

/** Confirms ElevenLabs access via Solvio’s platform key and reports voice count. */
export async function verifySolvioElevenLabsConnection(): Promise<{ ok: boolean; message: string }> {
  await assertAuthenticatedUser();
  const key = getSolvioElevenLabsApiKey();
  const r = await fetchElevenLabsVoiceList(key);
  if (r.error) {
    return { ok: false, message: r.error };
  }
  return { ok: true, message: `ElevenLabs OK — ${r.voices.length} voices available from Solvio.` };
}
