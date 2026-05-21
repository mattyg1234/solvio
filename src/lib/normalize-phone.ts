/** Normalize a phone string to E.164 (best-effort). Returns null if invalid. */
export function normalizePhoneE164(raw: string, defaultCountry = "+44"): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^\+\d{6,15}$/.test(trimmed)) return trimmed;

  const digits = trimmed.replace(/[^\d]/g, "");
  if (digits.length < 6) return null;

  if (defaultCountry === "+44" && digits.startsWith("0") && digits.length >= 10) {
    return `+44${digits.slice(1)}`;
  }
  if (defaultCountry === "+34" && digits.startsWith("0") && digits.length >= 9) {
    return `+34${digits.slice(1)}`;
  }
  if (digits.startsWith("44") && digits.length >= 11) return `+${digits}`;
  if (digits.startsWith("34") && digits.length >= 11) return `+${digits}`;

  return `${defaultCountry}${digits.replace(/^0+/, "")}`;
}
