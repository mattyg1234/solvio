/** Outbound dialing via Vapi — fire a single call against an assistant. */

import { getSolvioOutboundPhoneNumberId, getSolvioVapiApiKey } from "@/lib/voice-platform-env";

export type StartOutboundCallParams = {
  assistantId: string;
  toPhoneE164: string;
  /** Stored on the Vapi call object for webhook correlation back to our DB rows. */
  metadata?: Record<string, string>;
  /** Optional dynamic data merged into the assistant's prompt variables. */
  assistantOverrides?: Record<string, unknown>;
};

export type StartOutboundCallResult =
  | { ok: true; callId: string }
  | { ok: false; message: string };

export async function startOutboundCall(params: StartOutboundCallParams): Promise<StartOutboundCallResult> {
  const apiKey = getSolvioVapiApiKey();
  if (!apiKey) return { ok: false, message: "Voice service isn't configured for this deployment." };

  const phoneNumberId = getSolvioOutboundPhoneNumberId();
  if (!phoneNumberId) {
    return {
      ok: false,
      message:
        "Outbound dialing isn't configured for this account yet. Contact Solvio support to enable campaign calls.",
    };
  }

  const toClean = params.toPhoneE164.trim();
  if (!/^\+\d{6,15}$/.test(toClean)) {
    return { ok: false, message: `Phone "${toClean}" must be E.164 format (e.g. +447700123456).` };
  }

  const body: Record<string, unknown> = {
    assistantId: params.assistantId.trim(),
    phoneNumberId,
    customer: { number: toClean },
  };
  if (params.metadata) body.metadata = params.metadata;
  if (params.assistantOverrides) body.assistantOverrides = params.assistantOverrides;

  let res: Response;
  try {
    res = await fetch("https://api.vapi.ai/call", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    return { ok: false, message: "Couldn't reach the call service — try again shortly." };
  }

  if (!res.ok) {
    let detail = "";
    try {
      const raw = await res.json();
      detail = typeof raw?.message === "string" ? raw.message : JSON.stringify(raw).slice(0, 200);
    } catch {}
    return { ok: false, message: `Call service rejected the call (${res.status})${detail ? ": " + detail : ""}.` };
  }

  let json: Record<string, unknown> | null = null;
  try {
    const raw = await res.json();
    json = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  } catch {}

  const callId = typeof json?.id === "string" ? json.id.trim() : "";
  if (!callId) return { ok: false, message: "Call service didn't return a call id." };
  return { ok: true, callId };
}
