/**
 * Fill partner invoicing details from the company's Holded contacts.
 *
 * MHT keeps its customer contacts (NIF, billing address, email) in Holded; the Hub's
 * partners came from Lanzasoft with almost none of that. This matches each Hub partner
 * to a Holded contact and proposes values only for the fields the Hub has empty.
 * Nothing already in the Hub is ever overwritten. Pure (no I/O) so it can be unit tested.
 */

import { checkTaxId, cleanTaxId, normaliseCountry } from "./partner-billing";

export type HoldedContactRecord = {
  id: string;
  name: string;
  tradeName: string | null;
  taxId: string | null;
  email: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  province: string | null;
  countryCode: string | null;
  isPerson: boolean | null;
  tags: string[];
};

export type HubPartner = {
  id: string;
  name: string;
  island: string | null;
  legal_name: string | null;
  tax_id: string | null;
  email: string | null;
  invoice_address: string | null;
  invoice_postal_code: string | null;
  invoice_city: string | null;
  invoice_province: string | null;
  invoice_country_code: string | null;
  is_person: boolean | null;
  holded_contact_id: string | null;
};

export const FILLABLE_FIELDS = [
  "legal_name",
  "tax_id",
  "email",
  "invoice_address",
  "invoice_postal_code",
  "invoice_city",
  "invoice_province",
  "invoice_country_code",
  "is_person",
  "holded_contact_id",
] as const;
export type FillableField = (typeof FILLABLE_FIELDS)[number];
export type PartnerFill = Partial<Record<FillableField, string | boolean>>;

export const FIELD_LABELS: Record<FillableField, string> = {
  legal_name: "Legal name",
  tax_id: "NIF",
  email: "Email",
  invoice_address: "Address",
  invoice_postal_code: "Postcode",
  invoice_city: "City",
  invoice_province: "Province",
  invoice_country_code: "Country",
  is_person: "Person",
  holded_contact_id: "Holded link",
};

export type MatchedBy = "holded link" | "NIF" | "name";

export type ImportRow =
  | { kind: "fill"; partner: HubPartner; contact: HoldedContactRecord; matchedBy: MatchedBy; fill: PartnerFill }
  | { kind: "complete"; partner: HubPartner; contact: HoldedContactRecord; matchedBy: MatchedBy }
  | { kind: "conflict"; partner: HubPartner; contact: HoldedContactRecord; reason: string }
  | { kind: "ambiguous"; partner: HubPartner; contacts: HoldedContactRecord[] }
  | { kind: "unmatched"; partner: HubPartner };

const str = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
  return s ? s : null;
};

/** One Holded contact from either API shape (v2 snake_case, v1 camelCase). Null when it has no id or name. */
export function holdedContactRecord(raw: Record<string, unknown>): HoldedContactRecord | null {
  const id = str(raw.id);
  const name = str(raw.name);
  if (!id || !name) return null;
  const bill = ((raw.bill_address ?? raw.billAddress) ?? {}) as Record<string, unknown>;
  const tags = Array.isArray(raw.tags) ? raw.tags.map((t) => String(t ?? "").trim()).filter(Boolean) : [];
  const person = raw.is_person ?? raw.isperson ?? raw.isPerson;
  return {
    id,
    name,
    tradeName: str(raw.trade_name ?? raw.tradeName ?? raw.tradename),
    taxId: str(raw.vat_number ?? raw.vatnumber ?? raw.code),
    email: str(raw.email)?.toLowerCase() ?? null,
    address: str(bill.address),
    postalCode: str(bill.postal_code ?? bill.postalCode),
    city: str(bill.city),
    province: str(bill.province),
    countryCode: str(bill.country_code ?? bill.countryCode)?.toUpperCase() ?? null,
    isPerson: typeof person === "boolean" ? person : person === 1 || person === "1" ? true : person === 0 || person === "0" ? false : null,
    tags,
  };
}

const ISLAND_CODES = new Set(["ace", "tfs", "lpa", "fue", "gc", "uk"]);
const BILLING_WORDS = new Set(["deposit", "dep", "invoice", "inv", "only", "cash", "%", "comision", "commission"]);
const ARTICLES = new Set(["the", "el", "la", "los", "las"]);
const COMPANY_WORDS = new Set(["sl", "slu", "sa", "sll", "sc", "cb", "ltd", "limited", "slne"]);

/**
 * The business behind a name, for matching: "TFS Excursions 4 U - 30% Deposit" and
 * "EXCURSIONS 4 U S.L." both become "excursions 4 u". Island codes, the billing
 * suffix after " - ", percentages and company forms are dropped.
 */
export function coreName(raw: string): string {
  let s = String(raw || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  // "Name - INVOICE", "Name -30% DEP": the part after a spaced dash is the billing note.
  s = s.replace(/\s+-\s*\d*\s*%?.*$/, (m) => (/(deposit|dep|invoice|%)/.test(m) ? "" : m));
  s = s.replace(/s\.\s?l\.?(\s?u\.?)?\b/g, " sl ").replace(/s\.\s?a\.?\b/g, " sa ");
  const words = s
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9%]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .filter((w) => !/^\d+%$/.test(w) && !BILLING_WORDS.has(w));
  while (words.length > 1 && (ISLAND_CODES.has(words[0]) || ARTICLES.has(words[0]))) words.shift();
  while (words.length > 1 && COMPANY_WORDS.has(words[words.length - 1])) words.pop();
  return words.join(" ");
}

const ISLAND_TAGS: Record<string, string[]> = {
  Lanzarote: ["lanzarote", "islandlanzarote", "ace"],
  Tenerife: ["tenerife", "islandtenerife", "tfs"],
  "Gran Canaria": ["grancanaria", "islandgrancanaria", "lpa", "gc"],
};

/** A Holded contact tagged for one island is not the same business as a partner on another. */
function islandClash(partner: HubPartner, contact: HoldedContactRecord): boolean {
  const tags = new Set(contact.tags.map((t) => t.toLowerCase().replace(/[^a-z0-9]/g, "")));
  const tagged = Object.entries(ISLAND_TAGS).filter(([, keys]) => keys.some((k) => tags.has(k))).map(([island]) => island);
  if (!tagged.length || !partner.island || !ISLAND_TAGS[partner.island]) return false;
  return !tagged.includes(partner.island);
}

const empty = (v: unknown) => v === null || v === undefined || (typeof v === "string" && !v.trim());

/** Values from the contact for the partner's empty fields only. */
export function fillFor(partner: HubPartner, contact: HoldedContactRecord): PartnerFill {
  const country = contact.countryCode ? normaliseCountry(contact.countryCode) : null;
  // Only a tax id that passes the same check as the partner form (Holded and Verifactu reject the rest).
  const tax = contact.taxId ? checkTaxId(contact.taxId, country ?? "ES") : null;
  const offer: PartnerFill = {
    legal_name: contact.name,
    tax_id: tax?.ok ? tax.value : undefined,
    email: contact.email && contact.email.includes("@") ? contact.email : undefined,
    invoice_address: contact.address ?? undefined,
    invoice_postal_code: contact.postalCode ?? undefined,
    invoice_city: contact.city ?? undefined,
    invoice_province: contact.province ?? undefined,
    invoice_country_code: country ?? undefined,
    is_person: contact.isPerson ?? undefined,
    holded_contact_id: contact.id,
  };
  const out: PartnerFill = {};
  for (const f of FILLABLE_FIELDS) {
    const v = offer[f];
    if (v === undefined || v === "") continue;
    if (f === "is_person" ? partner.is_person !== null && partner.is_person !== undefined : !empty(partner[f])) continue;
    out[f] = v;
  }
  return out;
}

/**
 * Every value Holded has for the partner's invoicing details, for an explicit
 * "use Holded's details": unlike fillFor it replaces what the Hub has. Values
 * Holded doesn't have (or an invalid NIF) leave the Hub's field alone.
 */
export function holdedDetailsFor(contact: HoldedContactRecord): PartnerFill {
  const country = contact.countryCode ? normaliseCountry(contact.countryCode) : null;
  const tax = contact.taxId ? checkTaxId(contact.taxId, country ?? "ES") : null;
  const out: PartnerFill = { legal_name: contact.name, holded_contact_id: contact.id };
  if (tax?.ok) out.tax_id = tax.value;
  if (contact.email && contact.email.includes("@")) out.email = contact.email;
  if (contact.address) out.invoice_address = contact.address;
  if (contact.postalCode) out.invoice_postal_code = contact.postalCode;
  if (contact.city) out.invoice_city = contact.city;
  if (contact.province) out.invoice_province = contact.province;
  if (country) out.invoice_country_code = country;
  if (contact.isPerson !== null) out.is_person = contact.isPerson;
  return out;
}

function sameTaxId(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return cleanTaxId(a) === cleanTaxId(b);
}

/** Match every Hub partner to Holded and say what would be filled. */
export function planPartnerImport(partners: HubPartner[], contacts: HoldedContactRecord[]): ImportRow[] {
  const byId = new Map(contacts.map((c) => [c.id, c]));
  const byTax = new Map<string, HoldedContactRecord[]>();
  const byName = new Map<string, HoldedContactRecord[]>();
  const add = (m: Map<string, HoldedContactRecord[]>, k: string, c: HoldedContactRecord) => {
    if (!k) return;
    const list = m.get(k) ?? [];
    if (!list.some((x) => x.id === c.id)) list.push(c);
    m.set(k, list);
  };
  for (const c of contacts) {
    if (c.taxId) add(byTax, cleanTaxId(c.taxId), c);
    add(byName, coreName(c.name), c);
    if (c.tradeName) add(byName, coreName(c.tradeName), c);
  }

  return partners.map((partner): ImportRow => {
    let contact: HoldedContactRecord | undefined;
    let matchedBy: MatchedBy | undefined;
    if (partner.holded_contact_id && byId.has(partner.holded_contact_id)) {
      contact = byId.get(partner.holded_contact_id);
      matchedBy = "holded link";
    } else if (partner.tax_id && byTax.get(cleanTaxId(partner.tax_id))?.length === 1) {
      contact = byTax.get(cleanTaxId(partner.tax_id))![0];
      matchedBy = "NIF";
    } else {
      const keys = [...new Set([coreName(partner.name), partner.legal_name ? coreName(partner.legal_name) : ""].filter(Boolean))];
      const hits = new Map<string, HoldedContactRecord>();
      for (const k of keys) for (const c of byName.get(k) ?? []) if (!islandClash(partner, c)) hits.set(c.id, c);
      if (hits.size > 1) return { kind: "ambiguous", partner, contacts: [...hits.values()] };
      if (hits.size === 1) {
        contact = [...hits.values()][0];
        matchedBy = "name";
      }
    }
    if (!contact || !matchedBy) return { kind: "unmatched", partner };
    if (partner.tax_id && contact.taxId && !sameTaxId(partner.tax_id, contact.taxId)) {
      return { kind: "conflict", partner, contact, reason: `Hub NIF ${partner.tax_id} differs from Holded ${contact.taxId}` };
    }
    if (partner.holded_contact_id && partner.holded_contact_id !== contact.id) {
      return { kind: "conflict", partner, contact, reason: "Partner is already linked to a different Holded contact" };
    }
    const fill = fillFor(partner, contact);
    return Object.keys(fill).length ? { kind: "fill", partner, contact, matchedBy, fill } : { kind: "complete", partner, contact, matchedBy };
  });
}
