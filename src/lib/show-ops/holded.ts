/**
 * Holded connector — the operator's accounts package and legal invoice issuer
 * (Verifactu). Solvio pushes partner packs as draft sales invoices; Holded
 * assigns the legal number and reports to AEAT when the office approves.
 *
 * Pure mappers live here (unit-tested); network calls go through HoldedClient.
 */

export const HOLDED_BASE = "https://api.holded.com/api";

export type HoldedTax = { id?: string; key: string; name: string; amount: number; scope?: string; legalTreatment?: string; category?: string };
export type HoldedIgicTaxApproval = { id: string; key: string; rate: number; legalTreatment: "igic"; category: "sales" };

export type HoldedContactInput = {
  name: string;
  code?: string | null;
  email?: string | null;
  address?: string | null;
  tags?: string[];
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
  island?: string | null;
}): HoldedContactInput {
  const tags = ["solvio"];
  if (s.island) tags.push(holdedTag(`island ${s.island}`));
  return {
    name: String(s.legal_name || s.name).trim(),
    code: String(s.tax_id || "").trim() || null,
    email: String(s.email || "").trim() || null,
    address: String(s.invoice_address || "").trim() || null,
    tags,
  };
}

export function holdedContactBody(c: HoldedContactInput): Record<string, unknown> {
  const body: Record<string, unknown> = { name: c.name, type: "client", tags: c.tags ?? [] };
  if (c.code) body.code = c.code;
  if (c.email) body.email = c.email;
  if (c.address) body.billAddress = { address: c.address };
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
  if (d.status != null) {
    if (d.status !== "draft" && d.status !== "approved" && d.status !== "paid") throw new Error("Holded returned a malformed document status.");
    if (d.status !== status) throw new Error("Holded returned an inconsistent document status.");
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
  constructor(token: string) {
    this.token = token.trim();
    if (!this.token) throw new Error("Holded token is empty.");
  }

  private headers(): Record<string, string> {
    // v1 API keys use the `key` header; v2 personal tokens are accepted the same way.
    return { key: this.token, authorization: `Bearer ${this.token}`, accept: "application/json", "content-type": "application/json" };
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
    const list = await this.request<unknown>("GET", "/invoicing/v1/contacts");
    return { ok: true, contacts: Array.isArray(list) ? list.length : 0 };
  }

  listTaxes(): Promise<HoldedTax[]> {
    return this.request<unknown>("GET", "/invoicing/v1/taxes").then((t) =>
      Array.isArray(t) ? t.map(normaliseHoldedTax).filter((x): x is HoldedTax => x !== null) : [],
    );
  }

  async findContactByCode(code: string): Promise<{ id: string } | null> {
    const wanted = String(code || "").trim().toUpperCase();
    if (!wanted) return null;
    const list = await this.request<Array<Record<string, unknown>>>("GET", "/invoicing/v1/contacts");
    if (!Array.isArray(list)) return null;
    const hit = list.find((c) => String(c.code ?? "").trim().toUpperCase() === wanted || String(c.vatnumber ?? "").trim().toUpperCase() === wanted);
    return hit?.id ? { id: String(hit.id) } : null;
  }

  async createContact(input: HoldedContactInput): Promise<{ id: string }> {
    const res = await this.request<unknown>("POST", "/invoicing/v1/contacts", holdedContactBody(input));
    if (!res || typeof res !== "object" || Array.isArray(res)) throw new Error("Holded returned a malformed contact response.");
    return { id: requiredString((res as Record<string, unknown>).id, "contact id") };
  }

  async createInvoice(input: HoldedInvoiceInput): Promise<{ id: string }> {
    if (input.approveDoc !== false) throw new Error("Solvio may only create Holded invoice drafts.");
    const res = await this.request<unknown>("POST", "/invoicing/v1/documents/invoice", input);
    if (!res || typeof res !== "object" || Array.isArray(res)) throw new Error("Holded returned a malformed invoice response.");
    return { id: requiredString((res as Record<string, unknown>).id, "invoice id") };
  }

  async createInvoiceDraft(input: HoldedInvoiceInput, operation: HoldedDraftOperation): Promise<HoldedDocumentSummary> {
    return this.createDraft("invoice", input, operation);
  }

  async getInvoice(id: string): Promise<HoldedDocumentSummary> {
    const raw = await this.request<unknown>("GET", `/invoicing/v1/documents/invoice/${encodeURIComponent(id)}`);
    return summariseHoldedDocument(raw);
  }

  async createCreditNoteDraft(input: HoldedCreditNoteInput, operation: HoldedDraftOperation): Promise<HoldedDocumentSummary> {
    if (input.approveDoc !== false) throw new Error("Solvio may only create Holded credit-note drafts.");
    return this.createDraft("creditnote", input, operation);
  }

  async getCreditNote(id: string): Promise<HoldedDocumentSummary> {
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
      raw = await this.request("POST", `/invoicing/v1/documents/${kind}`, withOperationReference(input, reference));
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
    const raw = await this.request("GET", `/invoicing/v1/documents/${kind}`);
    if (!Array.isArray(raw)) throw new Error(`Holded returned a malformed ${kind} list.`);
    const marker = operationMarker(reference);
    const hits = raw.filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry) && String((entry as Record<string, unknown>).notes ?? "").includes(marker));
    if (hits.length > 1) throw new Error(`Holded returned duplicate documents for operation ${reference}.`);
    if (!hits.length) return null;
    const id = requiredString((hits[0] as Record<string, unknown>).id, `${kind} id`);
    this.knownOperations.set(reference, { kind, id });
    return this.readDraft(kind, id);
  }

  private readDraft(kind: "invoice" | "creditnote", id: string) {
    return kind === "invoice" ? this.getInvoice(id) : this.getCreditNote(id);
  }

  async getInvoicePdf(id: string): Promise<Buffer | null> {
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
