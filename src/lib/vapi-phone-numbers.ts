import { getSolvioVapiApiKey } from "@/lib/voice-platform-env";

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
  const body: Record<string, unknown> = {
    provider: "vapi",
    numberDesiredAreaCode: undefined,
    country: opts.country,
    assistantId: opts.assistantId,
  };
  if (opts.name?.trim()) body.name = opts.name.trim().slice(0, 60);

  const { ok, status, json } = await vapiFetch("/phone-number", {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!ok || !json) {
    const detail = summarizeError(json);
    if (status === 400 || status === 404) {
      return {
        ok: false,
        message: detail
          ? `That country isn't available in the number pool right now: ${detail}`
          : "That country isn't available in the number pool right now. Try a different one or contact Solvio support.",
      };
    }
    if (status === 401 || status === 403) {
      return { ok: false, message: "Voice service authentication failed. Contact Solvio support." };
    }
    if (status >= 500) {
      return {
        ok: false,
        message: "Voice service is temporarily unavailable. Wait a moment and try again.",
      };
    }
    return {
      ok: false,
      message: detail || `Couldn't reserve a number (${status || "error"}). Try again or contact support.`,
    };
  }

  const record = pickRecord(json);
  if (!record) return { ok: false, message: "Number was provisioned but no id was returned. Contact Solvio support." };
  return { ok: true, record: { ...record, country: opts.country } };
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
