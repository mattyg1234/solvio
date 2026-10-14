/**
 * Partner billing details: what a full invoice (factura completa) to a business
 * needs, and what Holded needs to create the contact. Spanish tax ids are checked
 * with their control character; foreign ones only for shape.
 * Pure (no I/O) so it can be unit tested.
 */

export type TaxIdKind = "nif" | "nie" | "cif" | "foreign";

export type TaxIdCheck =
  | { ok: true; value: string; kind: TaxIdKind }
  | { ok: false; message: string };

const DNI_LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE";
const CIF_CONTROL_LETTERS = "JABCDEFGHI";

/** Uppercase, no spaces, dots or dashes; a leading "ES" country prefix is dropped for Spain. */
export function cleanTaxId(raw: unknown, countryCode = "ES"): string {
  let v = String(raw ?? "").toUpperCase().replace(/[\s.\-/]/g, "");
  if (countryCode === "ES" && /^ES[0-9A-Z]{9}$/.test(v)) v = v.slice(2);
  return v;
}

function dniOk(v: string): boolean {
  const m = /^(\d{8})([A-Z])$/.exec(v);
  return Boolean(m) && DNI_LETTERS[Number(m![1]) % 23] === m![2];
}

function nieOk(v: string): boolean {
  const m = /^([XYZ])(\d{7})([A-Z])$/.exec(v);
  if (!m) return false;
  const n = Number(`${"XYZ".indexOf(m[1])}${m[2]}`);
  return DNI_LETTERS[n % 23] === m[3];
}

function cifOk(v: string): boolean {
  const m = /^([ABCDEFGHJNPQRSUVW])(\d{7})([0-9A-J])$/.exec(v);
  if (!m) return false;
  const digits = m[2].split("").map(Number);
  let sum = 0;
  digits.forEach((d, i) => {
    if (i % 2 === 1) sum += d;
    else {
      const x = d * 2;
      sum += Math.floor(x / 10) + (x % 10);
    }
  });
  const control = (10 - (sum % 10)) % 10;
  const letter = CIF_CONTROL_LETTERS[control];
  const kind = m[1];
  const given = m[3];
  if ("PQRSNW".includes(kind)) return given === letter;
  if ("ABEH".includes(kind)) return given === String(control);
  return given === String(control) || given === letter;
}

/** A partner's tax id for its country. Empty is reported as missing, not invalid. */
export function checkTaxId(raw: unknown, countryCode = "ES"): TaxIdCheck {
  const country = normaliseCountry(countryCode);
  const v = cleanTaxId(raw, country);
  if (!v) return { ok: false, message: "NIF / tax ID is missing." };
  if (country !== "ES") {
    return /^[0-9A-Z]{4,20}$/.test(v)
      ? { ok: true, value: v, kind: "foreign" }
      : { ok: false, message: "That tax ID does not look right (letters and numbers only)." };
  }
  if (dniOk(v)) return { ok: true, value: v, kind: "nif" };
  if (nieOk(v)) return { ok: true, value: v, kind: "nie" };
  if (cifOk(v)) return { ok: true, value: v, kind: "cif" };
  return { ok: false, message: `${v} is not a valid Spanish NIF, NIE or CIF (the last character does not match).` };
}

/** ISO 3166-1 alpha-2, defaulting to Spain. */
export function normaliseCountry(raw: unknown): string {
  const v = String(raw ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(v) ? v : "ES";
}

export const COUNTRY_OPTIONS: ReadonlyArray<{ code: string; name: string }> = [
  { code: "ES", name: "Spain" },
  { code: "GB", name: "United Kingdom" },
  { code: "IE", name: "Ireland" },
  { code: "DE", name: "Germany" },
  { code: "NL", name: "Netherlands" },
  { code: "BE", name: "Belgium" },
  { code: "FR", name: "France" },
  { code: "IT", name: "Italy" },
  { code: "PT", name: "Portugal" },
  { code: "SE", name: "Sweden" },
  { code: "NO", name: "Norway" },
  { code: "DK", name: "Denmark" },
  { code: "FI", name: "Finland" },
  { code: "PL", name: "Poland" },
  { code: "CH", name: "Switzerland" },
  { code: "US", name: "United States" },
];

export function countryName(code: string): string {
  return COUNTRY_OPTIONS.find((c) => c.code === code)?.name ?? code;
}

export type PartnerBilling = {
  name: string;
  legal_name?: string | null;
  tax_id?: string | null;
  email?: string | null;
  invoice_address?: string | null;
  invoice_postal_code?: string | null;
  invoice_city?: string | null;
  invoice_province?: string | null;
  invoice_country_code?: string | null;
  is_person?: boolean | null;
};

/** One line for the invoice header and PDFs: street, postcode city, province, country (if not Spain). */
export function composeBillingAddress(p: PartnerBilling): string | null {
  const country = normaliseCountry(p.invoice_country_code);
  const town = [p.invoice_postal_code?.trim(), p.invoice_city?.trim()].filter(Boolean).join(" ");
  const parts = [p.invoice_address?.trim(), town, p.invoice_province?.trim(), country !== "ES" ? countryName(country) : null].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

/**
 * What still has to be filled in before a full invoice to this partner can be
 * issued through Holded. Empty list = ready.
 */
export function holdedReadiness(p: PartnerBilling | null | undefined): string[] {
  if (!p) return ["Pick the partner this invoice is for."];
  const missing: string[] = [];
  const country = normaliseCountry(p.invoice_country_code);
  const legal = String(p.legal_name || "").trim();
  if (legal.length < 2) missing.push("legal name (as on their tax registration)");
  const tax = checkTaxId(p.tax_id, country);
  if (!tax.ok) missing.push(String(p.tax_id ?? "").trim() ? tax.message : "NIF / tax ID");
  if (String(p.invoice_address || "").trim().length < 3) missing.push("street address");
  const postcode = String(p.invoice_postal_code || "").trim();
  if (!postcode) missing.push("postcode");
  else if (country === "ES" && !/^\d{5}$/.test(postcode)) missing.push("a 5-digit Spanish postcode");
  if (String(p.invoice_city || "").trim().length < 2) missing.push("town / city");
  return missing;
}

export type BillingFormResult =
  | { ok: true; patch: Record<string, unknown> }
  | { ok: false; error: string };

/**
 * The billing fields of a partner form (with an optional field-name prefix).
 * A tax id that is entered must be valid; empty fields are allowed so partners
 * that are never invoiced can still be saved.
 */
export function billingPatchFromForm(get: (name: string) => unknown, prefix = ""): BillingFormResult {
  const s = (k: string) => String(get(prefix + k) ?? "").trim();
  const country = normaliseCountry(s("invoice_country_code"));
  const rawTax = s("tax_id");
  let taxId: string | null = null;
  if (rawTax) {
    const check = checkTaxId(rawTax, country);
    if (!check.ok) return { ok: false, error: check.message };
    taxId = check.value;
  }
  const postcode = s("invoice_postal_code").toUpperCase();
  if (postcode && country === "ES" && !/^\d{5}$/.test(postcode)) return { ok: false, error: "Spanish postcodes have 5 digits." };
  const termsRaw = s("payment_terms_days");
  let terms: number | null = null;
  if (termsRaw) {
    const n = Number(termsRaw);
    if (!Number.isInteger(n) || n < 0 || n > 365) return { ok: false, error: "Payment days must be a whole number from 0 to 365." };
    terms = n;
  }
  const patch: Record<string, unknown> = {
    tax_id: taxId,
    legal_name: s("legal_name").slice(0, 200) || null,
    invoice_address: s("invoice_address").slice(0, 300) || null,
    invoice_postal_code: postcode.slice(0, 12) || null,
    invoice_city: s("invoice_city").slice(0, 120) || null,
    invoice_province: s("invoice_province").slice(0, 120) || null,
    invoice_country_code: country,
    is_person: s("is_person") === "1",
  };
  // Only forms that show the field send it, so older forms never clear it.
  if (get(prefix + "payment_terms_days") !== null && get(prefix + "payment_terms_days") !== undefined) patch.payment_terms_days = terms;
  return { ok: true, patch };
}
