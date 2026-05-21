/** Dial codes offered on guest booking forms and merchant phone fields. */
export const BOOKING_PHONE_DIAL_CODES = [
  { dial: "+44", label: "UK (+44)" },
  { dial: "+1", label: "US / Canada (+1)" },
  { dial: "+34", label: "Spain (+34)" },
  { dial: "+353", label: "Ireland (+353)" },
  { dial: "+33", label: "France (+33)" },
  { dial: "+49", label: "Germany (+49)" },
  { dial: "+39", label: "Italy (+39)" },
  { dial: "+61", label: "Australia (+61)" },
] as const;

export type BookingPhoneDialCode = (typeof BOOKING_PHONE_DIAL_CODES)[number]["dial"];

const E164_RE = /^\+\d{8,15}$/;

/** Normalize a phone string to E.164 (best-effort). Returns null if invalid. */
export function normalizePhoneE164(raw: string, defaultCountry: BookingPhoneDialCode | string = "+44"): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^\+\d{6,15}$/.test(trimmed)) return trimmed;

  const digits = trimmed.replace(/[^\d]/g, "");
  if (digits.length < 6) return null;

  const dial = defaultCountry.startsWith("+") ? defaultCountry : "+44";

  if (dial === "+44" && digits.startsWith("0") && digits.length >= 10) {
    return `+44${digits.slice(1)}`;
  }
  if (dial === "+34" && digits.startsWith("0") && digits.length >= 9) {
    return `+34${digits.slice(1)}`;
  }
  if (dial === "+1" && digits.length === 10) {
    return `+1${digits}`;
  }
  if (dial === "+1" && digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }
  if (digits.startsWith("44") && digits.length >= 11) return `+${digits}`;
  if (digits.startsWith("34") && digits.length >= 11) return `+${digits}`;
  if (digits.startsWith("1") && digits.length === 11) return `+${digits}`;

  return `${dial}${digits.replace(/^0+/, "")}`;
}

/** Combine dial code + local digits (or accept a full +E.164 pasted in local). */
export function composePhoneE164(dialCode: string, localNumber: string): string | null {
  const local = localNumber.trim();
  if (!local) return null;
  if (local.startsWith("+")) return normalizePhoneE164(local);
  const dial = dialCode.trim();
  if (!dial.startsWith("+")) return null;
  const digits = local.replace(/[^\d]/g, "");
  if (!digits) return null;
  return normalizePhoneE164(`${dial}${digits}`, dial);
}

export function isValidE164Phone(value: string | null | undefined): value is string {
  return typeof value === "string" && E164_RE.test(value.trim());
}

export function validateBookingPhone(
  dialCode: string,
  localNumber: string,
): { ok: true; e164: string } | { ok: false; message: string } {
  const e164 = composePhoneE164(dialCode, localNumber);
  if (!isValidE164Phone(e164)) {
    return {
      ok: false,
      message: "Enter a valid mobile number with country code — pick your country and include the rest of the number.",
    };
  }
  return { ok: true, e164 };
}

/** Try common venue dial codes when legacy rows omit the + prefix. */
export function normalizePhoneE164WithFallbacks(
  raw: string,
  preferredDial: BookingPhoneDialCode | string = "+44",
): string | null {
  const direct = normalizePhoneE164(raw, preferredDial);
  if (isValidE164Phone(direct)) return direct;

  for (const { dial } of BOOKING_PHONE_DIAL_CODES) {
    if (dial === preferredDial) continue;
    const attempt = normalizePhoneE164(raw, dial);
    if (isValidE164Phone(attempt)) return attempt;
  }
  return null;
}
