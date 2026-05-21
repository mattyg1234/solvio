import {
  hasTwilioCredentials,
  purchaseTwilioNumber,
  releaseTwilioNumber,
  searchAvailableNumbers,
  type TwilioCountryCode,
} from "@/lib/twilio-phone-numbers";
import { getSolvioVapiApiKey } from "@/lib/voice-platform-env";

function trimEnv(name: string): string {
  const v = process.env[name];
  return typeof v === "string" ? v.trim() : "";
}

/** Countries Solvio currently offers for inbound numbers. */
export const SUPPORTED_PHONE_COUNTRIES = [
  { code: "GB", label: "United Kingdom", flag: "🇬🇧" },
  { code: "ES", label: "Spain", flag: "🇪🇸" },
] as const;

export type PhoneCountryCode = (typeof SUPPORTED_PHONE_COUNTRIES)[number]["code"];

export type VapiPhoneNumberRecord = {
  id: string;
  number: string | null;
  country: string | null;
  assistantId: string | null;
};

type VapiResponse = { ok: boolean; status: number; json: Record<string, unknown> | null };

async function vapiFetch(path: string, init?: RequestInit): Promise<VapiResponse> {
  const key = getSolvioVapiApiKey().trim();
  if (!key) return { ok: false, status: 0, json: null };
  let res: Response;
  try {
    res = await fetch(`https://api.vapi.ai${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${key}`,
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

function summarizeError(json: Record<string, unknown> | null): string {
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

function pickRecord(json: Record<string, unknown> | null): VapiPhoneNumberRecord | null {
  if (!json) return null;
  const id = typeof json.id === "string" ? json.id.trim() : "";
  if (!id) return null;
  const number = typeof json.number === "string" ? json.number.trim() : null;
  const assistantId = typeof json.assistantId === "string" ? json.assistantId.trim() : null;
  const country = null; // Vapi doesn't always return country on the record — caller knows it from the request.
  return { id, number, country, assistantId };
}

/**
 * Provision a new inbound phone number through Vapi's pool, attached to the
 * given assistant. On success the assistant will start receiving calls dialled
 * to the returned number.
 *
 * Note: Vapi's marketplace coverage varies by country. If the returned status
 * is 4xx with "country not supported" or similar, the caller should surface a
 * "we can't get a number in that country yet" message rather than retrying.
 */
export async function purchaseInboundNumber(opts: {
  country: PhoneCountryCode;
  assistantId: string;
  name?: string;
}): Promise<
  | { ok: true; record: VapiPhoneNumberRecord }
  | { ok: false; message: string }
> {
  // Vapi's own pool is US-only; every other country needs Twilio under the hood
  // (we search Twilio, buy a number on Solvio's account, then import it to Vapi
  // and attach to the merchant's assistant).
  return purchaseViaTwilioThenImport(opts);
}

async function purchaseViaTwilioThenImport(opts: {
  country: PhoneCountryCode;
  assistantId: string;
  name?: string;
}): Promise<{ ok: true; record: VapiPhoneNumberRecord } | { ok: false; message: string }> {
  if (!hasTwilioCredentials()) {
    return {
      ok: false,
      message:
        "Phone number provisioning isn't enabled for this country yet — Solvio needs to finish Twilio setup. Contact support.",
    };
  }

  const search = await searchAvailableNumbers({
    country: opts.country as TwilioCountryCode,
    smsEnabled: true,
    voiceEnabled: true,
    limit: 5,
  });
  if (!search.ok) return { ok: false, message: search.message };
  if (!search.numbers.length) {
    return { ok: false, message: `No ${opts.country} numbers available right now. Try again in a minute.` };
  }

  const candidate = search.numbers[0]!;
  const buy = await purchaseTwilioNumber({
    phoneNumber: candidate.phoneNumber,
    friendlyName: opts.name,
  });
  if (!buy.ok) return { ok: false, message: buy.message };

  const sid = trimEnv("SOLVIO_TWILIO_ACCOUNT_SID") || trimEnv("TWILIO_ACCOUNT_SID");
  const token = trimEnv("SOLVIO_TWILIO_AUTH_TOKEN") || trimEnv("TWILIO_AUTH_TOKEN");

  const importBody: Record<string, unknown> = {
    provider: "twilio",
    number: buy.number.phoneNumber,
    twilioAccountSid: sid,
    twilioAuthToken: token,
    assistantId: opts.assistantId,
  };
  if (opts.name?.trim()) importBody.name = opts.name.trim().slice(0, 60);

  const imported = await vapiFetch("/phone-number", {
    method: "POST",
    body: JSON.stringify(importBody),
  });

  if (!imported.ok || !imported.json) {
    // Couldn't link to Vapi — release the Twilio number so we don't bill for a ghost.
    await releaseTwilioNumber(buy.number.sid).catch(() => {});
    const detail = summarizeError(imported.json);
    return {
      ok: false,
      message: detail
        ? `Bought the number but couldn't link it to your receptionist: ${detail}. The number was released.`
        : "Bought the number but couldn't link it to your receptionist. The number was released — try again or contact support.",
    };
  }

  const record = pickRecord(imported.json);
  if (!record) {
    await releaseTwilioNumber(buy.number.sid).catch(() => {});
    return { ok: false, message: "Number was provisioned but no id was returned. The number was released." };
  }

  return {
    ok: true,
    record: {
      ...record,
      number: buy.number.phoneNumber,
      country: opts.country,
    },
  };
}

/** Release a previously-purchased number — frees it from Vapi (and stops the monthly carry charge). */
export async function releaseInboundNumber(phoneNumberId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const id = phoneNumberId.trim();
  if (!id) return { ok: false, message: "Missing phone number id." };

  const { ok, status, json } = await vapiFetch(`/phone-number/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!ok) {
    const detail = summarizeError(json);
    return { ok: false, message: detail || `Couldn't release the number (${status || "error"}).` };
  }
  return { ok: true };
}
