/**
 * Holded connector — the operator's accounts package and legal invoice issuer
 * (Verifactu). Solvio pushes partner packs as draft sales invoices; Holded
 * assigns the legal number and reports to AEAT when the office approves.
 *
 * Pure mappers live here (unit-tested); network calls go through HoldedClient.
 *
 * Two Holded APIs: v1 API keys (32 hex, `key` header, /invoicing/v1, being retired)
 * and v2 API tokens (pat_…, Bearer, /v2, Oct 2026). HoldedClient picks the API from
 * the token and keeps one interface, so callers never care which one is in use.
 */

export const HOLDED_BASE = "https://api.holded.com/api";

export type HoldedTax = { id?: string; key: string; name: string; amount: number; scope?: string; legalTreatment?: string; category?: string };
export type HoldedIgicTaxApproval = { id: string; key: string; rate: number; legalTreatment: "igic"; category: "sales" };

export type HoldedContactInput = {
  name: string;
  code?: string | null;
  email?: string | null;
  /** Street line. */
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
  province?: string | null;
  /** ISO 3166-1 alpha-2. */
  countryCode?: string | null;
  isPerson?: boolean | null;
  /** Commercial name when it differs from the legal one. */
  tradeName?: string | null;
  tags?: string[];
  /** Holded contact type: partners we invoice are clients, people we pay are suppliers. */
  type?: "client" | "supplier";
};

export type HoldedItem = {
  name: string;
  desc?: string;
  units: number;
  subtotal: number;
  tax?: number;
  taxes?: string[];
};

export type HoldedInvoiceInput = {
  contactId: string;
  desc: string;
  date: number;
  dueDate?: number;
  items: HoldedItem[];
  notes?: string;
  tags?: string[];
  approveDoc: boolean;
  currency?: string;
};

export type HoldedDocumentSummary = {
  id: string;
  docNumber: string | null;
  draft: boolean;
  status: "draft" | "approved" | "paid";
  net: number;
  tax: number;
  total: number;
  paymentsPending: number;
  approvedAt: string | null;
};

export type HoldedDocumentTotals = Pick<HoldedDocumentSummary, "net" | "tax" | "total">;

export type HoldedTotalsComparison = {
  matches: boolean;
  expected: HoldedDocumentTotals;
  actual: HoldedDocumentTotals;
  difference: HoldedDocumentTotals;
};

export type HoldedCreditNoteInput = HoldedInvoiceInput;
export type HoldedDraftOperation = { reference: string; knownDocumentId?: string; ambiguous?: boolean };

export type HoldedStatus = "not_sent" | "creating" | "draft" | "approved" | "paid" | "corrected" | "error" | "failed" | "unknown";
export type HoldedReconciliationStatus = "not_required" | "required" | "reconciling" | "resolved" | "failed";

/**
 * Holded's tax catalogue has no legal-treatment field; the treatment is in the
 * key/name (s_igic_7, "IGIC 7%"). Normalise once so approvals can be checked.
 */
export function normaliseHoldedTax(raw: unknown): HoldedTax | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const t = raw as Record<string, unknown>;
  const key = typeof t.key === "string" ? t.key.trim() : "";
  const name = typeof t.name === "string" ? t.name.trim() : "";
  const amount = Number(t.amount);
  if (!key || !Number.isFinite(amount)) return null;
  const scope = typeof t.scope === "string" && t.scope ? t.scope : "sales";
  const legalTreatment = /igic/i.test(`${key} ${name}`) ? "igic" : /iva|vat/i.test(`${key} ${name}`) ? "iva" : "other";
  return { id: typeof t.id === "string" ? t.id : undefined, key, name, amount, scope, legalTreatment, category: scope };
}

/** Approved IGIC sales taxes live in the integration meta, keyed by rate ("7" → approval). */
export function parseIgicApprovals(meta: unknown): Record<string, HoldedIgicTaxApproval> {
  const out: Record<string, HoldedIgicTaxApproval> = {};
  const src = meta && typeof meta === "object" && !Array.isArray(meta) ? (meta as Record<string, unknown>).igic_taxes : null;
  if (!src || typeof src !== "object" || Array.isArray(src)) return out;
  for (const [rateKey, v] of Object.entries(src as Record<string, unknown>)) {
    if (!v || typeof v !== "object" || Array.isArray(v)) continue;
    const a = v as Record<string, unknown>;
    const rate = Number(a.rate);
    if (typeof a.id !== "string" || typeof a.key !== "string" || !Number.isFinite(rate)) continue;
    if (a.legalTreatment !== "igic" || a.category !== "sales") continue;
    out[String(rateKey)] = { id: a.id, key: a.key, rate, legalTreatment: "igic", category: "sales" };
  }
  return out;
}

export function rateKey(rate: number): string {
  return String(Math.round(Number(rate) * 100) / 100);
}

export function approvalForRate(approvals: Record<string, HoldedIgicTaxApproval>, rate: number): HoldedIgicTaxApproval | null {
  return approvals[rateKey(rate)] ?? null;
}

/** Turn an approved Holded tax into the stored approval shape; refuses anything that is not IGIC on sales. */
export function approvalFromTax(tax: HoldedTax): HoldedIgicTaxApproval | null {
  if (!tax.id || tax.legalTreatment !== "igic" || (tax.scope ?? "sales") !== "sales") return null;
  return { id: tax.id, key: tax.key, rate: Math.round(Number(tax.amount) * 100) / 100, legalTreatment: "igic", category: "sales" };
}

export type HoldedInvoiceView = {
  label: string;
  tone: "neutral" | "ok" | "warn" | "bad";
  canSend: boolean;
  canRefresh: boolean;
  canReconcile: boolean;
};

/** What the finance screen should say and offer for a pack, from its lifecycle columns. */
export function holdedInvoiceView(inv: {
  holded_status?: string | null;
  holded_doc_number?: string | null;
  holded_document_id?: string | null;
  holded_error?: string | null;
  holded_reconciliation_status?: string | null;
  holded_verification_status?: string | null;
  holded_claimed_at?: string | null;
}, connected: boolean): HoldedInvoiceView {
  const status = String(inv.holded_status ?? "not_sent");
  const recon = String(inv.holded_reconciliation_status ?? "not_required");
  const hasDoc = Boolean(inv.holded_document_id);
  const num = inv.holded_doc_number || null;
  if (!connected && !hasDoc) return { label: "Holded not connected", tone: "neutral", canSend: false, canRefresh: false, canReconcile: false };
  if (recon === "required" || recon === "reconciling" || status === "unknown") {
    return {
      label: hasDoc && inv.holded_verification_status === "mismatch"
        ? `Totals in Holded differ from Solvio — check ${num || "the draft"} in Holded`
        : "Holded did not confirm the last write — reconcile before retrying",
      tone: "bad", canSend: false, canRefresh: hasDoc, canReconcile: true,
    };
  }
  switch (status) {
    case "creating": {
      const stale = inv.holded_claimed_at ? Date.now() - new Date(inv.holded_claimed_at).getTime() > 15 * 60 * 1000 : false;
      return { label: stale ? "A send to Holded stalled — reconcile to recover" : "Sending to Holded…", tone: "warn", canSend: false, canRefresh: false, canReconcile: stale };
    }
    case "draft": return { label: "Draft in Holded — waiting for the office to approve it there", tone: "warn", canSend: false, canRefresh: true, canReconcile: false };
    case "approved": return { label: `Issued by Holded as ${num || "—"} (Verifactu)`, tone: "ok", canSend: false, canRefresh: true, canReconcile: false };
    case "paid": return { label: `Paid in Holded · ${num || "numbered"}`, tone: "ok", canSend: false, canRefresh: true, canReconcile: false };
    case "corrected": return { label: `Corrected in Holded · ${num || ""}`.trim(), tone: "neutral", canSend: false, canRefresh: true, canReconcile: false };
    case "failed":
    case "error": return { label: `Holded error: ${inv.holded_error || "failed"}`, tone: "bad", canSend: !hasDoc, canRefresh: hasDoc, canReconcile: false };
    default: return { label: "Not sent to Holded yet", tone: "neutral", canSend: true, canRefresh: false, canReconcile: false };
  }
}

type PackLine = {
  description?: string | null;
  guest_name?: string | null;
  booking_ref?: string | null;
  adults?: number | null;
  children?: number | null;
  adult_unit_price?: number | null;
  child_unit_price?: number | null;
  quantity?: number | null;
  unit_price?: number | null;
  vat_rate?: number | null;
  notes?: string | null;
};

type Pack = {
  id: string;
  supplier_name: string;
  invoice_number?: string | null;
  period_start: string;
  period_end: string;
  invoice_date?: string | null;
  due_date?: string | null;
  notes?: string | null;
  island?: string | null;
  currency?: string | null;
};

const n = (v: unknown, fallback = 0) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
};

/** Holded strips punctuation from tags; keep them lower-case alphanumerics so they round-trip. */
export function holdedTag(raw: string): string {
  return String(raw || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 40);
}

/**
 * Pick the Holded tax key for a rate. Prefers a Canary IGIC sales key when the
 * company is on the Canary regime; falls back to any sales-scope key with the
 * same rate; null means "send the bare percentage" and let Holded map it.
 */
export function pickHoldedTaxKey(taxes: HoldedTax[], rate: number, opts: { preferIgic?: boolean } = {}): string | null {
  const wanted = Math.round(n(rate) * 100) / 100;
  const sales = taxes.filter((t) => (t.scope ?? "sales") === "sales" && Math.round(n(t.amount) * 100) / 100 === wanted);
  if (!sales.length) return null;
  if (opts.preferIgic !== false) {
    const igic = sales.find((t) => /igic/i.test(`${t.key} ${t.name}`));
    if (igic) return igic.key;
  }
  const generic = sales.find((t) => /^s_/.test(t.key) && !/bu_|exento|rec/i.test(t.key));
  return (generic ?? sales[0]).key;
}

/** Resolve a deliberately configured Canary sales-tax key and verify it against Holded's tax catalogue. */
export function requireHoldedIgicTaxKey(taxes: HoldedTax[], rate: number, approval: HoldedIgicTaxApproval | null | undefined): string {
  if (!approval) throw new Error(`No approved Canary/IGIC sales tax is configured for ${strictMoney(rate, "tax rate")}%`);
  const id = requiredString(approval.id, "approved Holded tax id");
  const key = requiredString(approval.key, "approved Holded tax key");
  const wanted = moneyCents(rate, "tax rate");
  const match = taxes.find((tax) => tax.id === id && tax.key === key);
  if (approval.legalTreatment !== "igic" || approval.category !== "sales" || !match || match.legalTreatment !== "igic" || match.category !== "sales" || match.scope !== "sales" || moneyCents(match.amount, "Holded tax rate") !== wanted || moneyCents(approval.rate, "approved tax rate") !== wanted) {
    throw new Error(`Approved Holded tax ${key} does not match the required IGIC sales treatment at ${strictMoney(rate, "tax rate")}%`);
  }
  return key;
}

export function holdedContactFromSupplier(s: {
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
  island?: string | null;
}): HoldedContactInput {
  const tags = ["solvio"];
  if (s.island) tags.push(holdedTag(`island ${s.island}`));
  const legal = String(s.legal_name || s.name).trim();
  const trade = String(s.name || "").trim();
  const clean = (v: unknown) => String(v ?? "").trim() || null;
  return {
    name: legal,
    tradeName: trade && trade.toLowerCase() !== legal.toLowerCase() ? trade : null,
    code: clean(s.tax_id),
    email: clean(s.email),
    address: clean(s.invoice_address),
    postalCode: clean(s.invoice_postal_code),
    city: clean(s.invoice_city),
    province: clean(s.invoice_province),
    countryCode: clean(s.invoice_country_code)?.toUpperCase() ?? null,
    isPerson: s.is_person ?? null,
    type: "client",
    tags,
  };
}

export function holdedContactBody(c: HoldedContactInput): Record<string, unknown> {
  const body: Record<string, unknown> = { name: c.name, type: c.type ?? "client", tags: c.tags ?? [] };
  if (c.code) body.code = c.code;
  if (c.email) body.email = c.email;
  if (c.tradeName) body.tradeName = c.tradeName;
  if (c.isPerson != null) body.isperson = c.isPerson;
  const bill: Record<string, unknown> = {};
  if (c.address) bill.address = c.address;
  if (c.postalCode) bill.postalCode = c.postalCode;
  if (c.city) bill.city = c.city;
  if (c.province) bill.province = c.province;
  if (c.countryCode) bill.countryCode = c.countryCode;
  if (Object.keys(bill).length) body.billAddress = bill;
  return body;
}

export function unixDay(iso: string | null | undefined, fallback = new Date()): number {
  const d = iso ? new Date(`${iso}T12:00:00Z`) : fallback;
  const t = d.getTime();
  return Math.floor((Number.isFinite(t) ? t : fallback.getTime()) / 1000);
}

/**
 * One Solvio pack → one Holded invoice. Booking lines become up to two items
 * (adults, children) so Holded's maths matches Solvio's to the cent; manual
 * lines pass through as quantity × unit price.
 */
export function holdedItemsFromLines(
  lines: PackLine[],
  taxForRate: (rate: number) => HoldedIgicTaxApproval | null,
  taxes: HoldedTax[] = [],
): HoldedItem[] {
  const out: HoldedItem[] = [];
  for (const l of lines) {
    const rate = strictMoney(l.vat_rate ?? 0, "line tax rate");
    if (rate < 0) throw new Error("Line tax rate cannot be negative.");
    const key = requireHoldedIgicTaxKey(taxes, rate, taxForRate(rate));
    const tax = { taxes: [key] };
    const base = String(l.description || l.guest_name || "Line").trim();
    const ref = String(l.booking_ref || "").trim();
    const desc = [ref, String(l.notes || "").trim()].filter(Boolean).join(" · ") || undefined;
    const adults = Math.max(0, Math.trunc(n(l.adults)));
    const children = Math.max(0, Math.trunc(n(l.children)));
    const adultUnit = strictMoney(l.adult_unit_price ?? 0, "adult unit price");
    const childUnit = strictMoney(l.child_unit_price ?? 0, "child unit price");
    const hasSplit = (adults > 0 && adultUnit > 0) || (children > 0 && childUnit > 0);
    if (hasSplit) {
      if (adults > 0) out.push({ name: `${base} — ${adults} adult${adults === 1 ? "" : "s"}`, desc, units: adults, subtotal: adultUnit, ...tax });
      if (children > 0) out.push({ name: `${base} — ${children} child${children === 1 ? "" : "ren"}`, desc, units: children, subtotal: childUnit, ...tax });
      continue;
    }
    const units = strictMoney(l.quantity ?? 1, "line quantity");
    if (units <= 0) throw new Error("Line quantity must be greater than zero.");
    const unit = strictMoney(l.unit_price, "unit price");
    out.push({ name: base, desc, units, subtotal: unit, ...tax });
  }
  return out;
}

export function holdedInvoiceFromPack(
  pack: Pack,
  lines: PackLine[],
  contactId: string,
  taxForRate: (rate: number) => HoldedIgicTaxApproval | null,
  taxes: HoldedTax[] = [],
): HoldedInvoiceInput {
  const ref = pack.invoice_number ? ` · Solvio ${pack.invoice_number}` : "";
  const tags = ["solvio"];
  if (pack.island) tags.push(holdedTag(`island ${pack.island}`));
  const notes = [pack.notes?.trim(), `Solvio pack ${pack.id}`].filter(Boolean).join("\n");
  const input: HoldedInvoiceInput = {
    contactId,
    desc: `${pack.supplier_name} · ${pack.period_start} → ${pack.period_end}${ref}`,
    date: unixDay(pack.invoice_date),
    items: holdedItemsFromLines(lines, taxForRate, taxes),
    notes,
    tags,
    approveDoc: false,
  };
  if (pack.due_date) input.dueDate = unixDay(pack.due_date);
  const cur = String(pack.currency || "").toLowerCase();
  if (cur && cur !== "eur") input.currency = cur;
  return input;
}

export function summariseHoldedDocument(raw: unknown): HoldedDocumentSummary {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Holded returned a malformed document.");
  const d = raw as Record<string, unknown>;
  const id = requiredString(d.id, "document id");
  if (typeof d.draft !== "boolean") throw new Error("Holded returned a malformed draft flag.");
  const draft = d.draft;
  const docNumber = optionalDocumentNumber(d.docNumber);
  const approvedAt = optionalApprovedAt(d.approvedAt);
  if (draft && approvedAt !== null) throw new Error("Holded returned an approved timestamp for a draft document.");
  if (!draft && docNumber === null) throw new Error("Holded returned an approved document without a document number.");
  if (!draft && approvedAt === null) throw new Error("Holded returned an approved document without an approval timestamp.");
  const net = strictMoney(d.subtotal ?? d.net, "document net");
  const tax = strictMoney(d.tax ?? d.taxTotal ?? d.taxesTotal, "document tax");
  const total = strictMoney(d.total, "document total");
  const pending = d.paymentsPending == null ? total : strictMoney(d.paymentsPending, "document pending total");
  const status: HoldedDocumentSummary["status"] = draft ? "draft" : moneyCents(pending, "document pending total") === 0 ? "paid" : "approved";
  // Real Holded documents carry a numeric payment status (0 unpaid, 1 paid, 2 partially paid)
  // alongside the `draft` flag; some fixtures use the string form. Either must agree with the above.
  if (d.status != null) {
    if (typeof d.status === "number") {
      if (![0, 1, 2].includes(d.status)) throw new Error("Holded returned a malformed document status.");
      if (d.status === 1 && status !== "paid") throw new Error("Holded returned an inconsistent document status.");
      if (d.status !== 1 && status === "paid" && total > 0) throw new Error("Holded returned an inconsistent document status.");
    } else if (d.status !== "draft" && d.status !== "approved" && d.status !== "paid") {
      throw new Error("Holded returned a malformed document status.");
    } else if (d.status !== status) {
      throw new Error("Holded returned an inconsistent document status.");
    }
  }
  return {
    id,
    docNumber,
    draft,
    status,
    net,
    tax,
    total,
    paymentsPending: pending,
    approvedAt,
  };
}

function optionalDocumentNumber(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string" || !value.trim()) throw new Error("Holded returned a malformed document number.");
  return value.trim();
}

function optionalApprovedAt(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error("Holded returned a malformed approval timestamp.");
  }
  const date = new Date(value * 1000);
  if (!Number.isFinite(date.getTime())) throw new Error("Holded returned a malformed approval timestamp.");
  return date.toISOString();
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Holded returned a malformed ${label}.`);
  return value.trim();
}

function strictMoney(value: unknown, label: string): number {
  if (typeof value !== "number" && typeof value !== "string") throw new Error(`Holded returned malformed ${label}.`);
  if (typeof value === "string" && !/^-?\d+(?:\.\d+)?$/.test(value.trim())) throw new Error(`Holded returned malformed ${label}.`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Holded returned non-finite ${label}.`);
  return parsed;
}

function moneyCents(value: unknown, label: string): number {
  const raw = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!/^-?\d+(?:\.\d+)?$/.test(raw)) { strictMoney(value, label); throw new Error(`Holded returned malformed ${label}.`); }
  const negative = raw.startsWith("-");
  const [whole, fraction = ""] = (negative ? raw.slice(1) : raw).split(".");
  let cents = BigInt(whole) * BigInt(100) + BigInt((fraction + "00").slice(0, 2));
  if (fraction.slice(2)[0] >= "5") cents += BigInt(1);
  if (negative) cents = -cents;
  const result = Number(cents);
  if (!Number.isSafeInteger(result)) throw new Error(`Holded returned out-of-range ${label}.`);
  return result;
}

export function compareHoldedDocumentTotals(expected: HoldedDocumentTotals, actual: HoldedDocumentTotals): HoldedTotalsComparison {
  const expectedCents = {
    net: moneyCents(expected.net, "expected net"),
    tax: moneyCents(expected.tax, "expected tax"),
    total: moneyCents(expected.total, "expected total"),
  };
  const actualCents = {
    net: moneyCents(actual.net, "actual net"),
    tax: moneyCents(actual.tax, "actual tax"),
    total: moneyCents(actual.total, "actual total"),
  };
  const difference = {
    net: (actualCents.net - expectedCents.net) / 100,
    tax: (actualCents.tax - expectedCents.tax) / 100,
    total: (actualCents.total - expectedCents.total) / 100,
  };
  return {
    matches: difference.net === 0 && difference.tax === 0 && difference.total === 0,
    expected: { net: expectedCents.net / 100, tax: expectedCents.tax / 100, total: expectedCents.total / 100 },
    actual: { net: actualCents.net / 100, tax: actualCents.tax / 100, total: actualCents.total / 100 },
    difference,
  };
}

/* ------------------------------------------------------------------ *
 * Holded API v2 (pat_ tokens): request and response shapes
 * ------------------------------------------------------------------ */

export function isHoldedV2Token(token: string): boolean {
  return /^(pat_|sk_live_)/.test(String(token || "").trim());
}

/** Unix seconds (noon UTC, as unixDay makes them) → the ISO date v2 wants. */
export function isoDayFromUnix(unix: number): string {
  const t = Number(unix) * 1000;
  if (!Number.isFinite(t)) throw new Error("Invalid document date.");
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * v2 tax rows carry an `id` that line items must reference; v1 used the key
 * (s_igic7). Scope is not always filled in, so a p_ key means purchases.
 */
export function normaliseHoldedV2Tax(raw: unknown): HoldedTax | null {
  const base = normaliseHoldedTax(raw);
  if (!base) return null;
  const t = raw as Record<string, unknown>;
  if (t.status === false) return null;
  const rawScope = typeof t.scope === "string" ? t.scope.toLowerCase() : "";
  const scope = /purchase|compra/.test(rawScope) || (!rawScope && /^p_/i.test(base.key)) ? "purchase" : "sales";
  return { ...base, scope, category: scope };
}

/** One Hub document (v1 field names) → the v2 create body. Tax keys become v2 tax ids. */
export function holdedV2DocumentBody(
  input: { contactId: string; desc: string; date: number; dueDate?: number; items: HoldedItem[]; notes?: string; tags?: string[]; currency?: string },
  taxRef: (key: string) => string,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    contact_id: requiredString(input.contactId, "contact id"),
    description: input.desc,
    date: isoDayFromUnix(input.date),
    items: input.items.map((i) => {
      const line: Record<string, unknown> = {
        name: i.name,
        units: strictMoney(i.units, "line units"),
        price: strictMoney(i.subtotal, "line price"),
      };
      if (i.desc) line.description = i.desc;
      if (i.taxes?.length) line.taxes = i.taxes.map(taxRef);
      else if (i.tax != null && Number(i.tax) !== 0) throw new Error("Holded v2 needs a tax id on every taxed line.");
      return line;
    }),
  };
  if (input.dueDate) body.due_date = isoDayFromUnix(input.dueDate);
  if (input.notes) body.notes = input.notes;
  if (input.tags?.length) body.tags = input.tags;
  if (input.currency) body.currency = input.currency.toUpperCase();
  return body;
}

export function holdedV2ContactBody(c: HoldedContactInput): Record<string, unknown> {
  const body: Record<string, unknown> = { name: c.name, type: c.type ?? "client", tags: c.tags ?? [] };
  if (c.code) {
    body.vat_number = c.code;
    body.code = c.code;
  }
  if (c.email) body.email = c.email;
  if (c.tradeName) body.trade_name = c.tradeName;
  if (c.isPerson != null) body.is_person = c.isPerson;
  const bill = holdedV2BillAddress(c);
  if (bill) body.bill_address = bill;
  return body;
}

function holdedV2BillAddress(c: HoldedContactInput): Record<string, unknown> | null {
  const bill: Record<string, unknown> = {};
  if (c.address) bill.address = c.address;
  if (c.postalCode) bill.postal_code = c.postalCode;
  if (c.city) bill.city = c.city;
  if (c.province) bill.province = c.province;
  if (c.countryCode) bill.country_code = c.countryCode;
  return Object.keys(bill).length ? bill : null;
}

/**
 * v2 PUT replaces the whole contact, so start from what Holded has and only
 * overwrite the fields the Hub owns (name, NIF, email, billing address, type).
 * Whatever the office added in Holded (IBAN, phones, notes, accounts) stays.
 */
export function mergeHoldedV2Contact(current: Record<string, unknown>, c: HoldedContactInput): Record<string, unknown> {
  const editable = [
    "name", "code", "vat_number", "trade_name", "is_person", "email", "phone", "mobile", "website", "type",
    "client_record", "supplier_record", "iban", "swift", "sepa_ref", "sepa_date", "bill_address", "tags", "custom_fields", "defaults",
  ];
  const out: Record<string, unknown> = {};
  for (const k of editable) if (current[k] !== undefined && current[k] !== null) out[k] = current[k];
  // Accounting records come back as objects; the update takes the account number only.
  for (const k of ["client_record", "supplier_record"]) {
    const v = out[k];
    if (v && typeof v === "object") {
      const num = Number((v as Record<string, unknown>).num ?? (v as Record<string, unknown>).number);
      if (Number.isInteger(num)) out[k] = num;
      else delete out[k];
    }
  }
  out.name = c.name;
  if (c.code) {
    out.vat_number = c.code;
    out.code = c.code;
  }
  if (c.email) out.email = c.email;
  if (c.tradeName) out.trade_name = c.tradeName;
  if (c.isPerson != null) out.is_person = c.isPerson;
  if (!out.type) out.type = c.type ?? "client";
  const bill = holdedV2BillAddress(c);
  if (bill) out.bill_address = { ...((out.bill_address as Record<string, unknown>) ?? {}), ...bill };
  const tags = new Set([...(Array.isArray(out.tags) ? (out.tags as string[]) : []), ...(c.tags ?? [])]);
  out.tags = [...tags];
  return out;
}

/**
 * A v2 invoice / credit note read back. Same checks as v1: a draft has no
 * approval; an issued document must carry Holded's legal number.
 */
export function summariseHoldedV2Document(raw: unknown): HoldedDocumentSummary {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Holded returned a malformed document.");
  const d = raw as Record<string, unknown>;
  const id = requiredString(d.id, "document id");
  if (typeof d.draft !== "boolean") throw new Error("Holded returned a malformed draft flag.");
  const draft = d.draft;
  const docNumber = optionalDocumentNumber(d.document_number);
  let approvedAt: string | null = null;
  if (d.approved_at != null) {
    if (typeof d.approved_at !== "string" || !Number.isFinite(Date.parse(d.approved_at))) throw new Error("Holded returned a malformed approval timestamp.");
    approvedAt = new Date(Date.parse(d.approved_at.endsWith("Z") || /[+-]\d\d:?\d\d$/.test(d.approved_at) ? d.approved_at : `${d.approved_at}Z`)).toISOString();
  }
  if (draft && approvedAt !== null) throw new Error("Holded returned an approved timestamp for a draft document.");
  if (!draft && docNumber === null) throw new Error("Holded returned an approved document without a document number.");
  const net = strictMoney(d.subtotal, "document net");
  const tax = strictMoney(d.tax, "document tax");
  const total = strictMoney(d.total, "document total");
  const pending = d.payments_pending == null ? total : strictMoney(d.payments_pending, "document pending total");
  if (d.status != null && !["failed", "completed", "pending", "partial", "cancelled", "overdue", "outstanding"].includes(String(d.status))) {
    throw new Error("Holded returned a malformed document status.");
  }
  const status: HoldedDocumentSummary["status"] = draft ? "draft" : moneyCents(pending, "document pending total") === 0 ? "paid" : "approved";
  return { id, docNumber, draft, status, net, tax, total, paymentsPending: pending, approvedAt };
}

/** v2 lists are `{ items, cursor, has_more }`. */
export function holdedV2Page(raw: unknown): { items: Record<string, unknown>[]; cursor: string | null } {
  if (!raw || typeof raw !== "object") throw new Error("Holded returned a malformed list.");
  const r = raw as Record<string, unknown>;
  const items = Array.isArray(raw) ? raw : r.items;
  if (!Array.isArray(items)) throw new Error("Holded returned a malformed list.");
  const more = r.has_more === true && typeof r.cursor === "string" && r.cursor ? r.cursor : null;
  return { items: items.filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object" && !Array.isArray(x)), cursor: more };
}

export class HoldedApiError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string, path: string) {
    super(`Holded ${status} on ${path}: ${body.slice(0, 200)}`);
    this.status = status;
    this.body = body;
  }
}

export class HoldedWriteAmbiguousError extends Error {
  constructor(public readonly documentKind: "invoice" | "creditnote", public readonly operationReference: string) {
    super(`Holded ${documentKind} write outcome is ambiguous. Reconcile operation ${operationReference} before retrying.`);
  }
}
export class HoldedReconciliationRequiredError extends Error {
  constructor(public readonly documentKind: "invoice" | "creditnote", public readonly operationReference: string, public readonly documentId: string) {
    super(`Holded created ${documentKind} ${documentId}, but status retrieval failed. Reconcile it before retrying.`);
  }
}

export class HoldedClient {
  private token: string;
  private knownOperations = new Map<string, { kind: "invoice" | "creditnote"; id: string }>();
  private ambiguousOperations = new Set<string>();
  /** v2 API token (pat_…): Bearer auth and /v2 endpoints. Otherwise a v1 API key. */
  readonly v2: boolean;
  private taxCache: HoldedTax[] | null = null;
  constructor(token: string) {
    this.token = token.trim();
    if (!this.token) throw new Error("Holded token is empty.");
    this.v2 = isHoldedV2Token(this.token);
  }

  private headers(): Record<string, string> {
    // v2 tokens authenticate with `Authorization: Bearer` only; sending the legacy
    // `key` header alongside makes Holded answer "Invalid key". v1 API keys still use `key`.
    const base = { accept: "application/json", "content-type": "application/json" };
    return this.v2 ? { ...base, authorization: `Bearer ${this.token}` } : { ...base, key: this.token };
  }

  /** Every page of a v2 list (cursor paging), up to a safety cap. */
  private async listV2(path: string, params: Record<string, string | number | undefined> = {}, maxPages = 20): Promise<Record<string, unknown>[]> {
    const out: Record<string, unknown>[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < maxPages; page++) {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") q.set(k, String(v));
      q.set("limit", "100");
      if (cursor) q.set("cursor", cursor);
      const res = holdedV2Page(await this.request<unknown>("GET", `${path}?${q.toString()}`));
      out.push(...res.items);
      if (!res.cursor) return out;
      cursor = res.cursor;
    }
    throw new Error(`Holded list ${path} has more than ${maxPages * 100} entries; narrow it before retrying.`);
  }

  /** v2 line items reference a tax by its id; the Hub stores keys (s_igic7). */
  private async v2TaxRef(): Promise<(key: string) => string> {
    const taxes = this.taxCache ?? (await this.listTaxes());
    return (key: string) => {
      const hit = taxes.find((t) => t.key === key || t.id === key);
      if (!hit) throw new Error(`Holded has no tax ${key}. Check the taxes in Holded and the approvals in Settings.`);
      return hit.id ?? hit.key;
    };
  }

  private v2DocPath(kind: "invoice" | "creditnote"): string {
    return kind === "invoice" ? "/v2/invoices" : "/v2/credit-notes";
  }

  async request<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${HOLDED_BASE}${path}`, {
      method,
      headers: this.headers(),
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    const text = await res.text();
    if (!res.ok) throw new HoldedApiError(res.status, text, path);
    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as unknown as T;
    }
  }

  /** Cheapest authenticated call — proves the token works. */
  async ping(): Promise<{ ok: true; contacts: number }> {
    if (this.v2) {
      const page = holdedV2Page(await this.request<unknown>("GET", "/v2/contacts?limit=1"));
      return { ok: true, contacts: page.items.length };
    }
    const list = await this.request<unknown>("GET", "/invoicing/v1/contacts");
    return { ok: true, contacts: Array.isArray(list) ? list.length : 0 };
  }

  async listTaxes(): Promise<HoldedTax[]> {
    if (this.v2) {
      const page = holdedV2Page(await this.request<unknown>("GET", "/v2/taxes"));
      this.taxCache = page.items.map(normaliseHoldedV2Tax).filter((x): x is HoldedTax => x !== null);
      return this.taxCache;
    }
    const t = await this.request<unknown>("GET", "/invoicing/v1/taxes");
    return Array.isArray(t) ? t.map(normaliseHoldedTax).filter((x): x is HoldedTax => x !== null) : [];
  }

  async findContactByCode(code: string): Promise<{ id: string } | null> {
    const wanted = String(code || "").trim().toUpperCase();
    if (!wanted) return null;
    if (this.v2) {
      const all = await this.listV2("/v2/contacts");
      const hit = all.find((c) => String(c.code ?? "").trim().toUpperCase() === wanted || String(c.vat_number ?? "").trim().toUpperCase() === wanted);
      return hit?.id ? { id: String(hit.id) } : null;
    }
    const list = await this.request<Array<Record<string, unknown>>>("GET", "/invoicing/v1/contacts");
    if (!Array.isArray(list)) return null;
    const hit = list.find((c) => String(c.code ?? "").trim().toUpperCase() === wanted || String(c.vatnumber ?? "").trim().toUpperCase() === wanted);
    return hit?.id ? { id: String(hit.id) } : null;
  }

  /** Exact, case-insensitive name match — used for suppliers we pay, who rarely have a tax id on the receipt. */
  async findContactByName(name: string): Promise<{ id: string } | null> {
    const wanted = String(name || "").trim().toLowerCase();
    if (!wanted) return null;
    if (this.v2) {
      // Prefix search on name; keep only the exact (case-insensitive) match.
      const hits = await this.listV2("/v2/contacts/search", { name: String(name).trim().slice(0, 100) }, 5);
      const hit = hits.find((c) => String(c.name ?? "").trim().toLowerCase() === wanted);
      return hit?.id ? { id: String(hit.id) } : null;
    }
    const list = await this.request<Array<Record<string, unknown>>>("GET", "/invoicing/v1/contacts");
    if (!Array.isArray(list)) return null;
    const hit = list.find((c) => String(c.name ?? "").trim().toLowerCase() === wanted);
    return hit?.id ? { id: String(hit.id) } : null;
  }

  /** Draft purchase (a cost we owe/paid). Drafts only — approval stays with the accountant in Holded. */
  async createPurchaseDraft(input: { contactId: string; desc: string; date: number; items: HoldedItem[]; notes?: string; tags?: string[]; approveDoc: false; currency?: string }): Promise<{ id: string }> {
    if (input.approveDoc !== false) throw new Error("Solvio may only create Holded purchase drafts.");
    // v2: creating never approves (approval is its own endpoint, which Solvio never calls).
    const res = this.v2
      ? await this.request<unknown>("POST", "/v2/purchases", holdedV2DocumentBody(input, await this.v2TaxRef()))
      : await this.request<unknown>("POST", "/invoicing/v1/documents/purchase", input);
    if (!res || typeof res !== "object" || Array.isArray(res)) throw new Error("Holded returned a malformed purchase response.");
    return { id: requiredString((res as Record<string, unknown>).id, "purchase id") };
  }

  /**
   * Purchase documents dated within [startUnixDay, endUnixDay] via Holded's list-documents endpoint.
   * Reconcile uses it to find a draft whose notes carry the Solvio expense marker; only id, notes and date are kept.
   */
  async listPurchases(startUnixDay: number, endUnixDay: number): Promise<Array<{ id: string; notes: string | null; date: number | null }>> {
    const start = Math.floor(Number(startUnixDay));
    const end = Math.floor(Number(endUnixDay));
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) throw new Error("Invalid purchase list window.");
    if (this.v2) {
      const items = await this.listV2("/v2/purchases", { start_date: `${isoDayFromUnix(start)}T00:00:00Z`, end_date: `${isoDayFromUnix(end)}T23:59:59Z` });
      const out: Array<{ id: string; notes: string | null; date: number | null }> = [];
      for (const rec of items) {
        if (typeof rec.id !== "string") continue;
        // The notes carry Solvio's marker; read the document when the list leaves them out.
        const full = "notes" in rec ? rec : await this.request<Record<string, unknown>>("GET", `/v2/purchases/${encodeURIComponent(rec.id)}`);
        const date = typeof rec.date === "string" && Number.isFinite(Date.parse(rec.date)) ? Math.floor(Date.parse(`${rec.date.slice(0, 10)}T12:00:00Z`) / 1000) : null;
        out.push({ id: rec.id, notes: typeof full?.notes === "string" ? full.notes : null, date });
      }
      return out;
    }
    const raw = await this.request<unknown>("GET", `/invoicing/v1/documents/purchase?starttmp=${start}&endtmp=${end}`);
    if (!Array.isArray(raw)) return [];
    const out: Array<{ id: string; notes: string | null; date: number | null }> = [];
    for (const d of raw) {
      if (!d || typeof d !== "object" || Array.isArray(d)) continue;
      const rec = d as Record<string, unknown>;
      if (typeof rec.id !== "string" && typeof rec.id !== "number") continue;
      const date = Number(rec.date);
      out.push({ id: String(rec.id), notes: typeof rec.notes === "string" ? rec.notes : null, date: rec.date != null && Number.isFinite(date) ? date : null });
    }
    return out;
  }

  /**
   * Bring an existing Holded contact in line with the Hub's partner details.
   * Returns false when the contact no longer exists (deleted, or another Holded company).
   */
  async syncContact(id: string, input: HoldedContactInput): Promise<boolean> {
    if (!/^[A-Za-z0-9]{6,64}$/.test(id)) return false;
    try {
      if (this.v2) {
        const current = await this.request<Record<string, unknown>>("GET", `/v2/contacts/${encodeURIComponent(id)}`);
        await this.request("PUT", `/v2/contacts/${encodeURIComponent(id)}`, mergeHoldedV2Contact(current ?? {}, input));
      } else {
        await this.request("PUT", `/invoicing/v1/contacts/${encodeURIComponent(id)}`, holdedContactBody(input));
      }
      return true;
    } catch (e) {
      if (e instanceof HoldedApiError && (e.status === 404 || e.status === 400)) return false;
      throw e;
    }
  }

  async createContact(input: HoldedContactInput): Promise<{ id: string }> {
    const res = this.v2
      ? await this.request<unknown>("POST", "/v2/contacts", holdedV2ContactBody(input))
      : await this.request<unknown>("POST", "/invoicing/v1/contacts", holdedContactBody(input));
    if (!res || typeof res !== "object" || Array.isArray(res)) throw new Error("Holded returned a malformed contact response.");
    return { id: requiredString((res as Record<string, unknown>).id, "contact id") };
  }

  async createInvoice(input: HoldedInvoiceInput): Promise<{ id: string }> {
    if (input.approveDoc !== false) throw new Error("Solvio may only create Holded invoice drafts.");
    const res = this.v2
      ? await this.request<unknown>("POST", "/v2/invoices", holdedV2DocumentBody(input, await this.v2TaxRef()))
      : await this.request<unknown>("POST", "/invoicing/v1/documents/invoice", input);
    if (!res || typeof res !== "object" || Array.isArray(res)) throw new Error("Holded returned a malformed invoice response.");
    return { id: requiredString((res as Record<string, unknown>).id, "invoice id") };
  }

  async createInvoiceDraft(input: HoldedInvoiceInput, operation: HoldedDraftOperation): Promise<HoldedDocumentSummary> {
    return this.createDraft("invoice", input, operation);
  }

  async getInvoice(id: string): Promise<HoldedDocumentSummary> {
    if (this.v2) return summariseHoldedV2Document(await this.request<unknown>("GET", `/v2/invoices/${encodeURIComponent(id)}`));
    const raw = await this.request<unknown>("GET", `/invoicing/v1/documents/invoice/${encodeURIComponent(id)}`);
    return summariseHoldedDocument(raw);
  }

  async createCreditNoteDraft(input: HoldedCreditNoteInput, operation: HoldedDraftOperation): Promise<HoldedDocumentSummary> {
    if (input.approveDoc !== false) throw new Error("Solvio may only create Holded credit-note drafts.");
    return this.createDraft("creditnote", input, operation);
  }

  async getCreditNote(id: string): Promise<HoldedDocumentSummary> {
    if (this.v2) return summariseHoldedV2Document(await this.request<unknown>("GET", `/v2/credit-notes/${encodeURIComponent(id)}`));
    const raw = await this.request<unknown>("GET", `/invoicing/v1/documents/creditnote/${encodeURIComponent(id)}`);
    return summariseHoldedDocument(raw);
  }

  reconcileInvoiceDraft(operation: HoldedDraftOperation) { return this.reconcileDraft("invoice", operation); }
  reconcileCreditNoteDraft(operation: HoldedDraftOperation) { return this.reconcileDraft("creditnote", operation); }

  private async createDraft(kind: "invoice" | "creditnote", input: HoldedInvoiceInput, operation: HoldedDraftOperation): Promise<HoldedDocumentSummary> {
    if (input.approveDoc !== false) throw new Error(`Solvio may only create Holded ${kind === "invoice" ? "invoice" : "credit-note"} drafts.`);
    const reference = validOperationReference(operation.reference);
    const known = operation.knownDocumentId ?? this.knownOperations.get(reference)?.id;
    if (known) return this.readDraft(kind, known);
    const reconciled = await this.reconcileDraft(kind, operation);
    if (reconciled) return reconciled;
    if (operation.ambiguous || this.ambiguousOperations.has(reference)) throw new HoldedWriteAmbiguousError(kind, reference);
    let raw: unknown;
    try {
      const body = withOperationReference(input, reference);
      raw = this.v2
        ? await this.request("POST", this.v2DocPath(kind), holdedV2DocumentBody(body, await this.v2TaxRef()))
        : await this.request("POST", `/invoicing/v1/documents/${kind}`, body);
    } catch {
      this.ambiguousOperations.add(reference);
      throw new HoldedWriteAmbiguousError(kind, reference);
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      this.ambiguousOperations.add(reference);
      throw new HoldedWriteAmbiguousError(kind, reference);
    }
    let id: string;
    try { id = requiredString((raw as Record<string, unknown>).id, `${kind} id`); }
    catch { this.ambiguousOperations.add(reference); throw new HoldedWriteAmbiguousError(kind, reference); }
    this.knownOperations.set(reference, { kind, id });
    try { return await this.readDraft(kind, id); }
    catch { throw new HoldedReconciliationRequiredError(kind, reference, id); }
  }

  private async reconcileDraft(kind: "invoice" | "creditnote", operation: HoldedDraftOperation): Promise<HoldedDocumentSummary | null> {
    const reference = validOperationReference(operation.reference);
    const known = operation.knownDocumentId ?? this.knownOperations.get(reference)?.id;
    if (known) return this.readDraft(kind, known);
    const marker = operationMarker(reference);
    if (this.v2) return this.reconcileDraftV2(kind, reference, marker);
    const raw = await this.request("GET", `/invoicing/v1/documents/${kind}`);
    if (!Array.isArray(raw)) throw new Error(`Holded returned a malformed ${kind} list.`);
    const hits = raw.filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry) && String((entry as Record<string, unknown>).notes ?? "").includes(marker));
    if (hits.length > 1) throw new Error(`Holded returned duplicate documents for operation ${reference}.`);
    if (!hits.length) return null;
    const id = requiredString((hits[0] as Record<string, unknown>).id, `${kind} id`);
    this.knownOperations.set(reference, { kind, id });
    return this.readDraft(kind, id);
  }

  /**
   * v2: look for Solvio's operation marker in the notes of recent documents
   * (drafts first, then everything from the last 200 days). A list entry
   * without notes is read in full so a missing marker is never assumed.
   */
  private async reconcileDraftV2(kind: "invoice" | "creditnote", reference: string, marker: string): Promise<HoldedDocumentSummary | null> {
    const path = this.v2DocPath(kind);
    const since = new Date(Date.now() - 200 * 86400_000).toISOString().slice(0, 10);
    const notesOf = async (rec: Record<string, unknown>) =>
      "notes" in rec ? String(rec.notes ?? "") : String((await this.request<Record<string, unknown>>("GET", `${path}/${encodeURIComponent(String(rec.id))}`))?.notes ?? "");
    const scan = async (params: Record<string, string>, readMissing: boolean) => {
      const hits: string[] = [];
      for (const rec of await this.listV2(path, params)) {
        if (typeof rec.id !== "string") continue;
        if (!("notes" in rec) && !readMissing) continue;
        if ((await notesOf(rec)).includes(marker)) hits.push(rec.id);
      }
      return hits;
    };
    let hits = await scan({ approval_status: "draft" }, true);
    if (!hits.length) hits = await scan({ start_date: `${since}T00:00:00Z` }, false);
    if (hits.length > 1) throw new Error(`Holded returned duplicate documents for operation ${reference}.`);
    if (!hits.length) return null;
    this.knownOperations.set(reference, { kind, id: hits[0] });
    return this.readDraft(kind, hits[0]);
  }

  private readDraft(kind: "invoice" | "creditnote", id: string) {
    return kind === "invoice" ? this.getInvoice(id) : this.getCreditNote(id);
  }

  async getInvoicePdf(id: string): Promise<Buffer | null> {
    if (this.v2) {
      const path = `/v2/invoices/${encodeURIComponent(id)}/pdf`;
      const res = await fetch(`${HOLDED_BASE}${path}`, { headers: { ...this.headers(), accept: "application/pdf" }, cache: "no-store" });
      if (!res.ok) throw new HoldedApiError(res.status, await res.text().catch(() => ""), path);
      const buf = Buffer.from(await res.arrayBuffer());
      return buf.length ? buf : null;
    }
    const res = await this.request<{ status?: number; data?: string }>("GET", `/invoicing/v1/documents/invoice/${encodeURIComponent(id)}/pdf`);
    return res?.data ? Buffer.from(res.data, "base64") : null;
  }
}

function validOperationReference(value: unknown): string {
  const reference = requiredString(value, "operation reference");
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(reference)) throw new Error("Holded operation reference is malformed.");
  return reference;
}
function operationMarker(reference: string) { return `[solvio-operation:${reference}]`; }
function withOperationReference(input: HoldedInvoiceInput, reference: string): HoldedInvoiceInput {
  const marker = operationMarker(reference);
  const existing = input.notes?.match(/\[solvio-operation:[^\]]+\]/)?.[0];
  if (existing && existing !== marker) throw new Error("Holded draft already contains a different operation reference.");
  return { ...input, approveDoc: false, notes: [input.notes?.trim(), existing ? null : marker].filter(Boolean).join("\n") };
}

export function holdedErrorMessage(err: unknown): string {
  if (err instanceof HoldedApiError) {
    if (err.status === 401 || err.status === 403) return "Holded rejected the token. Check it in Holded → Configuración → Desarrolladores.";
    return err.message;
  }
  return err instanceof Error ? err.message : "Holded request failed.";
}
