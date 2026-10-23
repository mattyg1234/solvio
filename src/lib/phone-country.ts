/**
 * Country codes for the phone fields (country dropdown + number). Pure, so the
 * browser component and the tests share it. Spain and the guests' usual home
 * countries come first.
 */

export type PhoneCountry = { iso: string; code: string; name: string };

export const PHONE_COUNTRIES: readonly PhoneCountry[] = [
  { iso: "ES", code: "34", name: "Spain" },
  { iso: "GB", code: "44", name: "United Kingdom" },
  { iso: "IE", code: "353", name: "Ireland" },
  { iso: "DE", code: "49", name: "Germany" },
  { iso: "NL", code: "31", name: "Netherlands" },
  { iso: "BE", code: "32", name: "Belgium" },
  { iso: "FR", code: "33", name: "France" },
  { iso: "IT", code: "39", name: "Italy" },
  { iso: "PT", code: "351", name: "Portugal" },
  { iso: "AR", code: "54", name: "Argentina" },
  { iso: "AU", code: "61", name: "Australia" },
  { iso: "AT", code: "43", name: "Austria" },
  { iso: "BR", code: "55", name: "Brazil" },
  { iso: "CA", code: "1", name: "Canada" },
  { iso: "CL", code: "56", name: "Chile" },
  { iso: "CN", code: "86", name: "China" },
  { iso: "CO", code: "57", name: "Colombia" },
  { iso: "CZ", code: "420", name: "Czechia" },
  { iso: "DK", code: "45", name: "Denmark" },
  { iso: "FI", code: "358", name: "Finland" },
  { iso: "GR", code: "30", name: "Greece" },
  { iso: "HU", code: "36", name: "Hungary" },
  { iso: "IS", code: "354", name: "Iceland" },
  { iso: "IN", code: "91", name: "India" },
  { iso: "IL", code: "972", name: "Israel" },
  { iso: "LU", code: "352", name: "Luxembourg" },
  { iso: "MX", code: "52", name: "Mexico" },
  { iso: "MA", code: "212", name: "Morocco" },
  { iso: "NZ", code: "64", name: "New Zealand" },
  { iso: "NO", code: "47", name: "Norway" },
  { iso: "PL", code: "48", name: "Poland" },
  { iso: "RO", code: "40", name: "Romania" },
  { iso: "RU", code: "7", name: "Russia" },
  { iso: "ZA", code: "27", name: "South Africa" },
  { iso: "SE", code: "46", name: "Sweden" },
  { iso: "CH", code: "41", name: "Switzerland" },
  { iso: "UA", code: "380", name: "Ukraine" },
  { iso: "AE", code: "971", name: "United Arab Emirates" },
  { iso: "US", code: "1", name: "United States" },
  { iso: "UY", code: "598", name: "Uruguay" },
  { iso: "VE", code: "58", name: "Venezuela" },
];

const BY_ISO = new Map(PHONE_COUNTRIES.map((c) => [c.iso, c]));
/** +1 is shared: the later entry (United States) wins over Canada. */
const BY_CODE = new Map(PHONE_COUNTRIES.map((c) => [c.code, c]));
const CODES_LONGEST_FIRST = [...new Set(PHONE_COUNTRIES.map((c) => c.code))].sort((a, b) => b.length - a.length);

export function phoneCountry(iso: string): PhoneCountry {
  return BY_ISO.get(iso) ?? PHONE_COUNTRIES[0];
}

/** 🇪🇸 from "ES". */
export function flagOf(iso: string): string {
  return String.fromCodePoint(...[...iso.toUpperCase()].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

function compact(raw: string): string {
  let s = raw.trim().replace(/[\s().\-/]/g, "");
  if (s.startsWith("00")) s = `+${s.slice(2)}`;
  return s;
}

/**
 * A stored or pasted number → country + the rest. "+44 7700 900123" → GB /
 * "7700900123"; a bare Spanish mobile or UK 07… is recognised; anything else stays
 * as typed under the fallback country.
 */
export function splitPhone(raw: string | null | undefined, fallbackIso = "ES"): { iso: string; rest: string } {
  const typed = String(raw ?? "").trim();
  if (!typed) return { iso: fallbackIso, rest: "" };
  let s = compact(typed);
  if (!s.startsWith("+")) {
    if (/^07\d{9}$/.test(s)) s = `+44${s.slice(1)}`;
    else if (/^[6789]\d{8}$/.test(s)) s = `+34${s}`;
    else if (/^(34|44)\d{9,10}$/.test(s)) s = `+${s}`;
    else return { iso: fallbackIso, rest: typed };
  }
  const digits = s.slice(1);
  if (!/^\d+$/.test(digits)) return { iso: fallbackIso, rest: typed };
  const code = CODES_LONGEST_FIRST.find((c) => digits.startsWith(c));
  if (!code) return { iso: fallbackIso, rest: typed };
  return { iso: BY_CODE.get(code)!.iso, rest: digits.slice(code.length) };
}

/**
 * Country + number → "+34604189230". The trunk 0 (UK 07…, Ireland 08…) is
 * dropped, except for Italy where it is part of the number. A full number typed
 * with + or 00 wins over the dropdown; text with letters is kept as typed so an
 * old note in the field is never lost on save.
 */
export function joinPhone(iso: string, rest: string): string {
  const typed = rest.trim();
  if (!typed) return "";
  if (/[a-z]/i.test(typed)) return typed;
  const s = compact(typed);
  if (s.startsWith("+")) return `+${s.slice(1).replace(/\D/g, "")}`;
  let digits = s.replace(/\D/g, "");
  if (!digits) return typed;
  const { code } = phoneCountry(iso);
  if (code !== "39") digits = digits.replace(/^0/, "");
  return `+${code}${digits}`;
}
