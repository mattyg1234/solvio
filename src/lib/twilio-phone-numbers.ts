/**
 * Twilio AvailablePhoneNumbers + IncomingPhoneNumbers helpers — used by Solvio
 * admins to provision the shared outbound number that sends SMS confirmations
 * and powers AI-dialled campaign calls for every merchant.
 *
 * Twilio API ref: https://www.twilio.com/docs/phone-numbers/api/availablephonenumber-resource
 */

const ALLOWED_COUNTRIES = ["GB", "ES", "US", "CA", "IE", "FR", "DE", "AU"] as const;
export type TwilioCountryCode = (typeof ALLOWED_COUNTRIES)[number];

export type TwilioAvailableNumber = {
  phoneNumber: string;
  friendlyName: string;
  locality: string | null;
  region: string | null;
  isoCountry: string;
  capabilities: { voice: boolean; sms: boolean; mms: boolean };
  monthlyPriceUsd: string | null;
};

export type TwilioOwnedNumber = {
  sid: string;
  phoneNumber: string;
  friendlyName: string;
  capabilities: { voice: boolean; sms: boolean; mms: boolean };
};

function trimEnv(name: string): string {
  const v = process.env[name];
  return typeof v === "string" ? v.trim() : "";
}

function getTwilioCreds(): { sid: string; token: string } | null {
  const sid = trimEnv("SOLVIO_TWILIO_ACCOUNT_SID") || trimEnv("TWILIO_ACCOUNT_SID");
  const token = trimEnv("SOLVIO_TWILIO_AUTH_TOKEN") || trimEnv("TWILIO_AUTH_TOKEN");
  if (!sid || !token) return null;
  return { sid, token };
}

async function twilioFetch(
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; json: unknown }> {
  const creds = getTwilioCreds();
  if (!creds) return { ok: false, status: 0, json: { message: "Twilio credentials not configured." } };

  const auth = Buffer.from(`${creds.sid}:${creds.token}`).toString("base64");
  let res: Response;
  try {
    res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${creds.sid}${path}`, {
      ...init,
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
        ...init?.headers,
      },
      cache: "no-store",
    });
  } catch {
    return { ok: false, status: 0, json: null };
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* empty */
  }
  return { ok: res.ok, status: res.status, json };
}

function pickAvailable(raw: unknown): TwilioAvailableNumber[] {
  if (!raw || typeof raw !== "object") return [];
  const list = (raw as { available_phone_numbers?: unknown }).available_phone_numbers;
  if (!Array.isArray(list)) return [];
  const out: TwilioAvailableNumber[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const phoneNumber = typeof r.phone_number === "string" ? r.phone_number : "";
    if (!phoneNumber) continue;
    const cap = (r.capabilities ?? {}) as Record<string, unknown>;
    out.push({
      phoneNumber,
      friendlyName: typeof r.friendly_name === "string" ? r.friendly_name : phoneNumber,
      locality: typeof r.locality === "string" ? r.locality : null,
      region: typeof r.region === "string" ? r.region : null,
      isoCountry: typeof r.iso_country === "string" ? r.iso_country : "",
      capabilities: {
        voice: Boolean(cap.voice),
        sms: Boolean(cap.SMS ?? cap.sms),
        mms: Boolean(cap.MMS ?? cap.mms),
      },
      monthlyPriceUsd: null,
    });
  }
  return out;
}

function summarizeTwilioError(json: unknown): string {
  if (!json || typeof json !== "object") return "";
  const r = json as { message?: unknown; more_info?: unknown };
  const msg = typeof r.message === "string" ? r.message.trim() : "";
  return msg.slice(0, 200);
}

/**
 * GET /AvailablePhoneNumbers/{country}/Local.json — list buyable local numbers
 * matching the optional area code prefix. SMS-capable filter on by default
 * (we only buy numbers that can both call AND text from the shared Solvio line).
 */
export async function searchAvailableNumbers(opts: {
  country: TwilioCountryCode;
  areaCode?: string;
  smsEnabled?: boolean;
  voiceEnabled?: boolean;
  limit?: number;
}): Promise<{ ok: true; numbers: TwilioAvailableNumber[] } | { ok: false; message: string }> {
  if (!(ALLOWED_COUNTRIES as readonly string[]).includes(opts.country)) {
    return { ok: false, message: "Unsupported country code." };
  }

  const params = new URLSearchParams();
  if (opts.areaCode?.trim()) params.set("AreaCode", opts.areaCode.trim());
  if (opts.smsEnabled !== false) params.set("SmsEnabled", "true");
  if (opts.voiceEnabled !== false) params.set("VoiceEnabled", "true");
  params.set("PageSize", String(Math.max(1, Math.min(opts.limit ?? 20, 30))));

  const { ok, status, json } = await twilioFetch(
    `/AvailablePhoneNumbers/${opts.country}/Local.json?${params.toString()}`,
  );

  if (!ok) {
    const detail = summarizeTwilioError(json);
    if (status === 401 || status === 403) {
      return { ok: false, message: "Twilio rejected the credentials — check SOLVIO_TWILIO_ACCOUNT_SID + auth token." };
    }
    return {
      ok: false,
      message: detail || `Twilio search failed (${status || "network"}). Try a different country or area code.`,
    };
  }

  return { ok: true, numbers: pickAvailable(json) };
}

/**
 * POST /IncomingPhoneNumbers.json — claim a previously-searched number.
 * Returns the new IncomingPhoneNumbers SID + the E.164 number that's now
 * billing to Solvio's Twilio sub-account.
 */
export async function purchaseTwilioNumber(opts: {
  phoneNumber: string;
  friendlyName?: string;
  smsUrl?: string;
  voiceUrl?: string;
}): Promise<{ ok: true; number: TwilioOwnedNumber } | { ok: false; message: string }> {
  const body = new URLSearchParams();
  body.set("PhoneNumber", opts.phoneNumber.trim());
  if (opts.friendlyName?.trim()) body.set("FriendlyName", opts.friendlyName.trim().slice(0, 60));
  if (opts.smsUrl?.trim()) body.set("SmsUrl", opts.smsUrl.trim());
  if (opts.voiceUrl?.trim()) body.set("VoiceUrl", opts.voiceUrl.trim());

  const { ok, status, json } = await twilioFetch(`/IncomingPhoneNumbers.json`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!ok || !json || typeof json !== "object") {
    const detail = summarizeTwilioError(json);
    if (status === 401 || status === 403) {
      return { ok: false, message: "Twilio rejected the credentials — check SOLVIO_TWILIO_ACCOUNT_SID + auth token." };
    }
    return {
      ok: false,
      message: detail || `Twilio couldn't claim that number (${status || "network"}). Try another one.`,
    };
  }

  const r = json as Record<string, unknown>;
  const sid = typeof r.sid === "string" ? r.sid.trim() : "";
  const phoneNumber = typeof r.phone_number === "string" ? r.phone_number.trim() : "";
  if (!sid || !phoneNumber) {
    return { ok: false, message: "Twilio returned an incomplete record — re-check the account dashboard." };
  }

  const cap = (r.capabilities ?? {}) as Record<string, unknown>;

  return {
    ok: true,
    number: {
      sid,
      phoneNumber,
      friendlyName: typeof r.friendly_name === "string" ? r.friendly_name : phoneNumber,
      capabilities: {
        voice: Boolean(cap.voice),
        sms: Boolean(cap.SMS ?? cap.sms),
        mms: Boolean(cap.MMS ?? cap.mms),
      },
    },
  };
}

/** Quick check: do we have Twilio creds at all on this deployment? */
export function hasTwilioCredentials(): boolean {
  return getTwilioCreds() !== null;
}

export const SUPPORTED_TWILIO_COUNTRIES = ALLOWED_COUNTRIES.slice();
