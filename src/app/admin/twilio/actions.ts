"use server";

import { redirect } from "next/navigation";

import { isSolvioAdminEmail } from "@/lib/solvio-admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  hasTwilioCredentials,
  purchaseTwilioNumber,
  searchAvailableNumbers,
  type TwilioAvailableNumber,
  type TwilioCountryCode,
  type TwilioOwnedNumber,
} from "@/lib/twilio-phone-numbers";
import { getSolvioVapiApiKey } from "@/lib/voice-platform-env";

function trimEnv(name: string): string {
  const v = process.env[name];
  return typeof v === "string" ? v.trim() : "";
}

async function requireAdmin() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isSolvioAdminEmail(user.email ?? null)) {
    redirect("/dashboard");
  }
}

export type TwilioSearchResult =
  | { ok: true; configured: true; numbers: TwilioAvailableNumber[] }
  | { ok: false; configured: false }
  | { ok: false; configured: true; message: string };

export async function searchTwilioNumbersAction(input: {
  country: string;
  areaCode?: string;
}): Promise<TwilioSearchResult> {
  await requireAdmin();
  if (!hasTwilioCredentials()) return { ok: false, configured: false };

  const country = input.country.trim().toUpperCase();
  const res = await searchAvailableNumbers({
    country: country as TwilioCountryCode,
    areaCode: input.areaCode?.trim() || undefined,
  });
  if (!res.ok) return { ok: false, configured: true, message: res.message };
  return { ok: true, configured: true, numbers: res.numbers };
}

export type TwilioBuyResult =
  | { ok: true; number: TwilioOwnedNumber }
  | { ok: false; message: string };

export async function buyTwilioNumberAction(input: {
  phoneNumber: string;
  friendlyName?: string;
}): Promise<TwilioBuyResult> {
  await requireAdmin();
  if (!hasTwilioCredentials()) {
    return { ok: false, message: "Set SOLVIO_TWILIO_ACCOUNT_SID + SOLVIO_TWILIO_AUTH_TOKEN on Vercel first." };
  }

  return purchaseTwilioNumber({
    phoneNumber: input.phoneNumber,
    friendlyName: input.friendlyName,
  });
}

export type ListVapiPhoneNumbersResult =
  | { ok: true; numbers: Array<{ id: string; number: string | null; provider: string | null; name: string | null }> }
  | { ok: false; message: string };

/** GET /phone-number — list all Vapi phone-number resources on Solvio's workspace, so we can verify what's actually registered. */
export async function listVapiPhoneNumbersAction(): Promise<ListVapiPhoneNumbersResult> {
  await requireAdmin();
  const vapiKey = getSolvioVapiApiKey().trim();
  if (!vapiKey) return { ok: false, message: "SOLVIO_VAPI_API_KEY isn't configured." };

  let res: Response;
  try {
    res = await fetch("https://api.vapi.ai/phone-number", {
      headers: { Authorization: `Bearer ${vapiKey}` },
      cache: "no-store",
    });
  } catch {
    return { ok: false, message: "Couldn't reach Vapi." };
  }
  if (!res.ok) return { ok: false, message: `Vapi returned ${res.status}.` };
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* empty */
  }
  if (!Array.isArray(json)) return { ok: false, message: "Vapi returned an unexpected shape." };
  const numbers = json
    .filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === "object")
    .map((r) => ({
      id: typeof r.id === "string" ? r.id : "",
      number: typeof r.number === "string" ? r.number : null,
      provider: typeof r.provider === "string" ? r.provider : null,
      name: typeof r.name === "string" ? r.name : null,
    }))
    .filter((r) => r.id);
  return { ok: true, numbers };
}

export type RegisterSolvioOutboundResult =
  | { ok: true; vapiPhoneNumberId: string; phoneE164: string }
  | { ok: false; message: string };

/**
 * Take the shared Solvio outbound Twilio number (SOLVIO_TWILIO_FROM_NUMBER) and
 * register it with Vapi as a non-assistant-bound phone number. The resulting
 * Vapi phone-number resource id is what SOLVIO_VAPI_OUTBOUND_PHONE_NUMBER_ID
 * needs to be set to so AI-dialled campaign calls can use it.
 */
export async function registerSolvioOutboundNumberAction(): Promise<RegisterSolvioOutboundResult> {
  await requireAdmin();

  const fromNumber = trimEnv("SOLVIO_TWILIO_FROM_NUMBER");
  if (!fromNumber) {
    return {
      ok: false,
      message:
        "SOLVIO_TWILIO_FROM_NUMBER isn't set on this deployment. Claim a number first, set the env var, redeploy, then try again.",
    };
  }

  const sid = trimEnv("SOLVIO_TWILIO_ACCOUNT_SID") || trimEnv("TWILIO_ACCOUNT_SID");
  const token = trimEnv("SOLVIO_TWILIO_AUTH_TOKEN") || trimEnv("TWILIO_AUTH_TOKEN");
  if (!sid || !token) {
    return { ok: false, message: "Twilio credentials aren't configured on this deployment." };
  }

  const vapiKey = getSolvioVapiApiKey().trim();
  if (!vapiKey) return { ok: false, message: "SOLVIO_VAPI_API_KEY isn't configured." };

  let res: Response;
  try {
    res = await fetch("https://api.vapi.ai/phone-number", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${vapiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        provider: "twilio",
        number: fromNumber,
        twilioAccountSid: sid,
        twilioAuthToken: token,
        name: "Solvio shared outbound",
      }),
      cache: "no-store",
    });
  } catch {
    return { ok: false, message: "Couldn't reach Vapi to register the number — try again." };
  }

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* empty */
  }

  if (!res.ok || !json || typeof json !== "object") {
    const detail =
      json && typeof json === "object" && "message" in json && typeof (json as { message?: unknown }).message === "string"
        ? (json as { message: string }).message
        : "";
    return {
      ok: false,
      message: detail
        ? `Vapi rejected the import (${res.status}): ${detail}`
        : `Vapi rejected the import (${res.status || "network"}). Common cause: the number is already imported under another Vapi workspace.`,
    };
  }

  const id = typeof (json as { id?: unknown }).id === "string" ? (json as { id: string }).id.trim() : "";
  if (!id) return { ok: false, message: "Vapi imported the number but returned no id." };

  return { ok: true, vapiPhoneNumberId: id, phoneE164: fromNumber };
}
