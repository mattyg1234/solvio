import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { compareHoldedDocumentTotals, HoldedClient, HoldedReconciliationRequiredError, HoldedWriteAmbiguousError, type HoldedInvoiceInput } from "./holded";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

const invoice: HoldedInvoiceInput = { contactId: "contact-1", desc: "September", date: 1788220800, items: [{ name: "Excursions", units: 1, subtotal: 100, taxes: ["s_igic_7"] }], approveDoc: false };
const operation = { reference: "invoice:pack-0001" };
const draft = (id = "invoice-1", marker = "invoice:pack-0001") => ({ id, docNumber: null, draft: true, approvedAt: null, subtotal: "100.00", tax: "7.00", total: "107.00", paymentsPending: "107.00", notes: `[solvio-operation:${marker}]` });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

test("invoice reconciles first, writes a marked draft once, then retrieves totals", async () => {
  const calls: Array<{ method: string; url: string; body?: Record<string, unknown> }> = [];
  globalThis.fetch = async (input, init) => {
    const call = { method: String(init?.method), url: String(input), body: init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined };
    calls.push(call);
    if (call.method === "GET" && call.url.endsWith("/invoice")) return json([]);
    if (call.method === "POST") return json({ id: "invoice-1" });
    return json(draft());
  };
  const result = await new HoldedClient("test-token").createInvoiceDraft(invoice, operation);
  assert.deepEqual({ id: result.id, status: result.status, net: result.net, tax: result.tax, total: result.total }, { id: "invoice-1", status: "draft", net: 100, tax: 7, total: 107 });
  assert.equal(calls.filter((call) => call.method === "POST").length, 1);
  assert.match(String(calls.find((call) => call.method === "POST")?.body?.notes), /\[solvio-operation:invoice:pack-0001\]/);
});

test("POST success then GET failure exposes id and retry reconciles without POST", async () => {
  let posts = 0;
  let detailReads = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (init?.method === "POST") { posts += 1; return json({ id: "invoice-1" }); }
    if (url.endsWith("/invoice")) return json([]);
    detailReads += 1;
    return detailReads === 1 ? json({ error: "busy" }, 503) : json(draft());
  };
  const client = new HoldedClient("test-token");
  await assert.rejects(() => client.createInvoiceDraft(invoice, operation), (error: unknown) => error instanceof HoldedReconciliationRequiredError && error.documentId === "invoice-1");
  assert.equal((await client.createInvoiceDraft(invoice, operation)).id, "invoice-1");
  assert.equal(posts, 1);
});

test("ambiguous POST timeout blocks automatic retry", async () => {
  let posts = 0;
  globalThis.fetch = async (input, init) => {
    if (init?.method === "POST") { posts += 1; throw new TypeError("timeout"); }
    if (String(input).endsWith("/invoice")) return json([]);
    return json(draft());
  };
  const client = new HoldedClient("test-token");
  await assert.rejects(() => client.createInvoiceDraft(invoice, operation), HoldedWriteAmbiguousError);
  await assert.rejects(() => client.createInvoiceDraft(invoice, operation), HoldedWriteAmbiguousError);
  assert.equal(posts, 1);
});

test("persisted ambiguous state reconciles a marker and never POSTs", async () => {
  let posts = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (init?.method === "POST") { posts += 1; return json({ id: "duplicate" }); }
    if (url.endsWith("/invoice")) return json([{ id: "invoice-1", notes: "[solvio-operation:invoice:pack-0001]" }]);
    return json(draft());
  };
  const result = await new HoldedClient("test-token").createInvoiceDraft(invoice, { ...operation, ambiguous: true });
  assert.equal(result.id, "invoice-1");
  assert.equal(posts, 0);
});

test("credit note is a marked draft without undocumented linkage", async () => {
  let posted: Record<string, unknown> | undefined;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/creditnote") && init?.method === "GET") return json([]);
    if (init?.method === "POST") { posted = JSON.parse(String(init.body)); return json({ id: "credit-1" }); }
    return json({ ...draft("credit-1", "credit:pack-0001"), subtotal: -100, tax: -7, total: -107, paymentsPending: -107 });
  };
  const result = await new HoldedClient("test-token").createCreditNoteDraft(invoice, { reference: "credit:pack-0001" });
  assert.equal(result.status, "draft");
  assert.equal("relatedDocuments" in (posted ?? {}), false);
  assert.match(String(posted?.notes), /\[solvio-operation:credit:pack-0001\]/);
});

test("decimal cents round positive and negative half-cent boundaries deterministically", () => {
  assert.equal(compareHoldedDocumentTotals({ net: "1.004" as unknown as number, tax: 0, total: "1.004" as unknown as number }, { net: 1, tax: 0, total: 1 }).matches, true);
  assert.deepEqual(compareHoldedDocumentTotals({ net: 0, tax: 0, total: 0 }, { net: "1.005" as unknown as number, tax: "-1.005" as unknown as number, total: 0 }).actual, { net: 1.01, tax: -1.01, total: 0 });
});

test("rate limiting fails during reconciliation before any write", async () => {
  let posts = 0;
  globalThis.fetch = async (_input, init) => {
    if (init?.method === "POST") posts += 1;
    return json({ error: "rate limited" }, 429);
  };
  await assert.rejects(() => new HoldedClient("test-token").createInvoiceDraft(invoice, operation), /Holded 429/);
  assert.equal(posts, 0);
});
