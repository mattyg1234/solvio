/**
 * Holded connector — the operator's accounts package and legal invoice issuer
 * (Verifactu). Solvio pushes partner packs as draft sales invoices; Holded
 * assigns the legal number and reports to AEAT when the office approves.
 *
 * Pure mappers live here (unit-tested); network calls go through HoldedClient.
 */

export const HOLDED_BASE = "https://api.holded.com/api";

export type HoldedTax = { id?: string; key: string; name: string; amount: number; scope?: string };

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
  total: number;
  paymentsPending: number;
  approvedAt: string | null;
};

export type HoldedStatus = "not_sent" | "draft" | "approved" | "paid" | "error";

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
export function holdedItemsFromLines(lines: PackLine[], taxKeyFor: (rate: number) => string | null): HoldedItem[] {
  const out: HoldedItem[] = [];
  for (const l of lines) {
    const rate = Math.max(0, n(l.vat_rate));
    const key = taxKeyFor(rate);
    const tax = key ? { taxes: [key] } : { tax: rate };
    const base = String(l.description || l.guest_name || "Line").trim();
    const ref = String(l.booking_ref || "").trim();
    const desc = [ref, String(l.notes || "").trim()].filter(Boolean).join(" · ") || undefined;
    const adults = Math.max(0, Math.trunc(n(l.adults)));
    const children = Math.max(0, Math.trunc(n(l.children)));
    const adultUnit = n(l.adult_unit_price);
    const childUnit = n(l.child_unit_price);
    const hasSplit = (adults > 0 && adultUnit > 0) || (children > 0 && childUnit > 0);
    if (hasSplit) {
      if (adults > 0) out.push({ name: `${base} — ${adults} adult${adults === 1 ? "" : "s"}`, desc, units: adults, subtotal: adultUnit, ...tax });
      if (children > 0) out.push({ name: `${base} — ${children} child${children === 1 ? "" : "ren"}`, desc, units: children, subtotal: childUnit, ...tax });
      continue;
    }
    const units = n(l.quantity) > 0 ? n(l.quantity) : 1;
    const unit = n(l.unit_price);
    out.push({ name: base, desc, units, subtotal: unit, ...tax });
  }
  return out;
}

export function holdedInvoiceFromPack(
  pack: Pack,
  lines: PackLine[],
  contactId: string,
  taxKeyFor: (rate: number) => string | null,
): HoldedInvoiceInput {
  const ref = pack.invoice_number ? ` · Solvio ${pack.invoice_number}` : "";
  const tags = ["solvio"];
  if (pack.island) tags.push(holdedTag(`island ${pack.island}`));
  const notes = [pack.notes?.trim(), `Solvio pack ${pack.id}`].filter(Boolean).join("\n");
  const input: HoldedInvoiceInput = {
    contactId,
    desc: `${pack.supplier_name} · ${pack.period_start} → ${pack.period_end}${ref}`,
    date: unixDay(pack.invoice_date),
    items: holdedItemsFromLines(lines, taxKeyFor),
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
  const d = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const draft = d.draft === true || (d.docNumber == null && !d.approvedAt);
  const total = n(d.total);
  const pending = n(d.paymentsPending, total);
  const status: HoldedDocumentSummary["status"] = draft ? "draft" : total > 0 && pending <= 0 ? "paid" : "approved";
  return {
    id: String(d.id ?? ""),
    docNumber: d.docNumber ? String(d.docNumber) : null,
    draft,
    status,
    total,
    paymentsPending: pending,
    approvedAt: d.approvedAt ? new Date(n(d.approvedAt) * 1000).toISOString() : null,
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

export class HoldedClient {
  private token: string;
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
    return this.request<HoldedTax[]>("GET", "/invoicing/v1/taxes").then((t) => (Array.isArray(t) ? t : []));
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
    const res = await this.request<{ id?: string; status?: number; info?: string }>("POST", "/invoicing/v1/contacts", holdedContactBody(input));
    if (!res?.id) throw new Error(`Holded did not return a contact id (${res?.info ?? "no info"}).`);
    return { id: String(res.id) };
  }

  async createInvoice(input: HoldedInvoiceInput): Promise<{ id: string }> {
    const res = await this.request<{ id?: string; status?: number; info?: string }>("POST", "/invoicing/v1/documents/invoice", input);
    if (!res?.id) throw new Error(`Holded did not return an invoice id (${res?.info ?? "no info"}).`);
    return { id: String(res.id) };
  }

  async getInvoice(id: string): Promise<HoldedDocumentSummary> {
    const raw = await this.request<unknown>("GET", `/invoicing/v1/documents/invoice/${encodeURIComponent(id)}`);
    return summariseHoldedDocument(raw);
  }

  async getInvoicePdf(id: string): Promise<Buffer | null> {
    const res = await this.request<{ status?: number; data?: string }>("GET", `/invoicing/v1/documents/invoice/${encodeURIComponent(id)}/pdf`);
    return res?.data ? Buffer.from(res.data, "base64") : null;
  }
}

export function holdedErrorMessage(err: unknown): string {
  if (err instanceof HoldedApiError) {
    if (err.status === 401 || err.status === 403) return "Holded rejected the token. Check it in Holded → Configuración → Desarrolladores.";
    return err.message;
  }
  return err instanceof Error ? err.message : "Holded request failed.";
}
