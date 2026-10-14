import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  HoldedClient,
  HoldedReconciliationRequiredError,
  holdedV2DocumentBody,
  holdedV2Page,
  isHoldedV2Token,
  normaliseHoldedV2Tax,
  summariseHoldedV2Document,
  type HoldedInvoiceInput,
} from "./holded";

/* Shapes below follow Holded's API v2 reference (holded.com/es/desarrolladores, Oct 2026). */

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

const TOKEN = "pat_test_0000000000000000_ffffffffffffffff";
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

const taxes = {
  items: [
    { id: "tax-igic-7", name: "IGIC 7%", amount: "7", scope: "sales", key: "s_igic_7", group: "igic", type: "percentage", items: [], status: true, visible: true },
    { id: "tax-p-igic-7", name: "IGIC 7%", amount: "7", scope: null, key: "p_igic_7", group: "igic", type: "percentage", items: [], status: true, visible: true },
    { id: "tax-off", name: "Old", amount: "3", scope: "sales", key: "s_old", group: "x", type: "percentage", items: [], status: false, visible: false },
  ],
};

const v2Draft = (over: Record<string, unknown> = {}) => ({
  id: "507f1f77bcf86cd799439011",
  document_number: null,
  contact_id: "c1",
  subtotal: "100.00",
  discount: "0",
  total: "107.00",
  tax: "7.00",
  currency: "EUR",
  status: "pending",
  approved_at: null,
  draft: true,
  payments_pending: "107.00",
  notes: "[solvio-operation:invoice:pack-0001]",
  ...over,
});

const invoice: HoldedInvoiceInput = {
  contactId: "c1",
  desc: "September",
  date: 1788220800,
  items: [{ name: "Excursions", desc: "MHT-1", units: 2, subtotal: 50, taxes: ["s_igic_7"] }],
  approveDoc: false,
};

test("pat_ tokens use API v2; 32-hex keys stay on v1", () => {
  assert.equal(isHoldedV2Token(TOKEN), true);
  assert.equal(isHoldedV2Token("0123456789abcdef0123456789abcdef"), false);
  assert.equal(new HoldedClient(TOKEN).v2, true);
  assert.equal(new HoldedClient("0123456789abcdef0123456789abcdef").v2, false);
});

test("v2 taxes: inactive ones dropped, p_ keys are purchases even without a scope", () => {
  const out = taxes.items.map(normaliseHoldedV2Tax).filter(Boolean);
  assert.deepEqual(out.map((t) => [t!.key, t!.id, t!.scope, t!.legalTreatment, t!.amount]), [
    ["s_igic_7", "tax-igic-7", "sales", "igic", 7],
    ["p_igic_7", "tax-p-igic-7", "purchase", "igic", 7],
  ]);
});

test("v2 document body: snake_case, ISO dates, unit price, tax ids", () => {
  const body = holdedV2DocumentBody({ ...invoice, dueDate: 1790812800, notes: "n", tags: ["solvio"], currency: "gbp" }, (k) => (k === "s_igic_7" ? "tax-igic-7" : k));
  assert.deepEqual(body, {
    contact_id: "c1",
    description: "September",
    date: "2026-09-01",
    due_date: "2026-10-01",
    notes: "n",
    tags: ["solvio"],
    currency: "GBP",
    items: [{ name: "Excursions", description: "MHT-1", units: 2, price: 50, taxes: ["tax-igic-7"] }],
  });
  assert.equal("approveDoc" in body, false, "v2 approves with its own endpoint; the flag must not be sent");
  assert.throws(() => holdedV2DocumentBody({ ...invoice, items: [{ name: "x", units: 1, subtotal: 1, tax: 7 }] }, (k) => k), /tax id/);
});

test("v2 read-back: draft vs issued, legal number required once issued", () => {
  assert.deepEqual(
    (({ id, draft, status, net, tax, total, docNumber, approvedAt }) => ({ id, draft, status, net, tax, total, docNumber, approvedAt }))(summariseHoldedV2Document(v2Draft())),
    { id: "507f1f77bcf86cd799439011", draft: true, status: "draft", net: 100, tax: 7, total: 107, docNumber: null, approvedAt: null },
  );
  const issued = summariseHoldedV2Document(v2Draft({ draft: false, document_number: "F260001", approved_at: "2026-10-15T13:00:00" }));
  assert.equal(issued.status, "approved");
  assert.equal(issued.docNumber, "F260001");
  assert.equal(issued.approvedAt, "2026-10-15T13:00:00.000Z");
  assert.equal(summariseHoldedV2Document(v2Draft({ draft: false, document_number: "F1", approved_at: "2026-10-15T13:00:00", payments_pending: "0" })).status, "paid");
  assert.throws(() => summariseHoldedV2Document(v2Draft({ draft: false })), /without a document number/);
  assert.throws(() => summariseHoldedV2Document(v2Draft({ approved_at: "2026-10-15T13:00:00" })), /approved timestamp for a draft/);
  assert.throws(() => summariseHoldedV2Document(v2Draft({ draft: undefined })), /draft flag/);
  assert.throws(() => summariseHoldedV2Document(v2Draft({ total: "abc" })), /malformed/);
});

test("v2 pages: items + cursor only when has_more", () => {
  assert.deepEqual(holdedV2Page({ items: [{ id: "a" }], cursor: "x", has_more: true }), { items: [{ id: "a" }], cursor: "x" });
  assert.deepEqual(holdedV2Page({ items: [{ id: "a" }], cursor: "x", has_more: false }), { items: [{ id: "a" }], cursor: null });
  assert.throws(() => holdedV2Page({ nope: 1 }), /malformed list/);
});

test("v2 invoice draft: Bearer auth, checks for an earlier write, posts once to /v2/invoices with tax ids, never approves", async () => {
  const calls: Array<{ method: string; url: string; headers: Record<string, string>; body?: Record<string, unknown> }> = [];
  globalThis.fetch = async (input, init) => {
    const call = {
      method: String(init?.method ?? "GET"),
      url: String(input),
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined,
    };
    calls.push(call);
    if (call.url.includes("/v2/taxes")) return json(taxes);
    if (call.method === "GET" && /\/v2\/invoices\?/.test(call.url)) return json({ items: [], has_more: false });
    if (call.method === "POST") return json({ id: "507f1f77bcf86cd799439011" }, 201);
    return json(v2Draft());
  };
  const result = await new HoldedClient(TOKEN).createInvoiceDraft(invoice, { reference: "invoice:pack-0001" });
  assert.equal(result.status, "draft");
  assert.equal(result.total, 107);
  const posts = calls.filter((c) => c.method === "POST");
  assert.equal(posts.length, 1);
  assert.equal(posts[0].url, "https://api.holded.com/api/v2/invoices");
  assert.equal(posts[0].headers.authorization, `Bearer ${TOKEN}`);
  assert.equal("key" in posts[0].headers, false);
  assert.deepEqual((posts[0].body?.items as Array<{ taxes: string[] }>)[0].taxes, ["tax-igic-7"]);
  assert.match(String(posts[0].body?.notes), /\[solvio-operation:invoice:pack-0001\]/);
  assert.equal(calls.some((c) => /approve/.test(c.url)), false, "Solvio never approves in Holded");
});

test("v2 retry finds the earlier draft by its marker (list without notes → reads the document) and does not post again", async () => {
  let posts = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (init?.method === "POST") { posts += 1; return json({ id: "x" }, 201); }
    if (url.includes("/v2/invoices?") && url.includes("approval_status=draft")) return json({ items: [{ id: "507f1f77bcf86cd799439011" }], has_more: false });
    if (url.includes("/v2/invoices?")) return json({ items: [], has_more: false });
    return json(v2Draft());
  };
  const result = await new HoldedClient(TOKEN).createInvoiceDraft(invoice, { reference: "invoice:pack-0001" });
  assert.equal(result.id, "507f1f77bcf86cd799439011");
  assert.equal(posts, 0);
});

test("v2 POST ok then read fails: the id is kept and the next call reconciles instead of posting", async () => {
  let posts = 0;
  let reads = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("/v2/taxes")) return json(taxes);
    if (init?.method === "POST") { posts += 1; return json({ id: "507f1f77bcf86cd799439011" }, 201); }
    if (url.includes("/v2/invoices?")) return json({ items: [], has_more: false });
    reads += 1;
    return reads === 1 ? json({ error: "busy" }, 503) : json(v2Draft());
  };
  const client = new HoldedClient(TOKEN);
  await assert.rejects(() => client.createInvoiceDraft(invoice, { reference: "invoice:pack-0001" }), (e: unknown) => e instanceof HoldedReconciliationRequiredError);
  const again = await client.createInvoiceDraft(invoice, { reference: "invoice:pack-0001" });
  assert.equal(again.id, "507f1f77bcf86cd799439011");
  assert.equal(posts, 1);
});

test("v2 credit notes go to /v2/credit-notes; purchases to /v2/purchases with purchase tax ids", async () => {
  const urls: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    urls.push(`${init?.method ?? "GET"} ${url}`);
    if (url.includes("/v2/taxes")) return json(taxes);
    if (url.includes("?")) return json({ items: [], has_more: false });
    if (init?.method === "POST") return json({ id: "507f1f77bcf86cd799439011" }, 201);
    return json(v2Draft({ notes: "[solvio-operation:credit:pack-0001]" }));
  };
  const client = new HoldedClient(TOKEN);
  await client.createCreditNoteDraft(invoice, { reference: "credit:pack-0001" });
  await client.createPurchaseDraft({ contactId: "s1", desc: "Fuel", date: 1788220800, items: [{ name: "Fuel", units: 1, subtotal: 10, taxes: ["p_igic_7"] }], approveDoc: false });
  assert.ok(urls.includes("POST https://api.holded.com/api/v2/credit-notes"));
  assert.ok(urls.includes("POST https://api.holded.com/api/v2/purchases"));
});

test("v2 contacts: exact name match from the prefix search; create sends vat_number and bill_address", async () => {
  const seen: Array<{ url: string; body?: unknown }> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    seen.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url.includes("/v2/contacts/search")) return json({ items: [{ id: "a", name: "TUI España" }, { id: "b", name: "TUI" }], has_more: false });
    if (init?.method === "POST") return json({ id: "new" }, 201);
    return json({ items: [{ id: "z", name: "X", code: null, vat_number: "B12345678" }], has_more: false });
  };
  const client = new HoldedClient(TOKEN);
  assert.deepEqual(await client.findContactByName("tui"), { id: "b" });
  assert.deepEqual(await client.findContactByCode("b12345678"), { id: "z" });
  assert.deepEqual(await client.createContact({ name: "Hotel Sol", code: "B1", address: "Calle 1", type: "supplier" }), { id: "new" });
  assert.deepEqual(seen.at(-1)?.body, { name: "Hotel Sol", type: "supplier", tags: [], vat_number: "B1", code: "B1", bill_address: { address: "Calle 1" } });
});
