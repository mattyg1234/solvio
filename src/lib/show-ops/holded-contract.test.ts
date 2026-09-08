import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { compareHoldedDocumentTotals, HoldedClient, type HoldedInvoiceInput } from "./holded";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

const invoice: HoldedInvoiceInput = {
  contactId: "contact-1",
  desc: "September partner pack",
  date: 1788220800,
  items: [{ name: "Excursions", units: 1, subtotal: 100, taxes: ["s_igic_7"] }],
  approveDoc: false,
};

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

test("invoice draft creation validates the create response then retrieves actual financials", async () => {
  const calls: Array<{ method: string; url: string; body?: unknown }> = [];
  globalThis.fetch = async (input, init) => {
    const call = { method: String(init?.method), url: String(input), body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    if (call.method === "POST") return json({ id: "invoice-1" });
    return json({ id: "invoice-1", docNumber: null, draft: true, subtotal: "100.00", tax: "7.00", total: "107.00", paymentsPending: "107.00" });
  };
  const result = await new HoldedClient("test-token").createInvoiceDraft(invoice);
  assert.deepEqual({ id: result.id, number: result.docNumber, status: result.status, net: result.net, tax: result.tax, total: result.total }, { id: "invoice-1", number: null, status: "draft", net: 100, tax: 7, total: 107 });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].body && (calls[0].body as Record<string, unknown>).approveDoc, false);
  assert.match(calls[1].url, /documents\/invoice\/invoice-1$/);
});

test("malformed create and document responses fail closed", async () => {
  globalThis.fetch = async () => json({ status: 1 });
  await assert.rejects(() => new HoldedClient("test-token").createInvoiceDraft(invoice), /malformed invoice id/);
  let count = 0;
  globalThis.fetch = async () => ++count === 1 ? json({ id: "invoice-1" }) : json({ id: "invoice-1", subtotal: 100, tax: 7, total: Infinity });
  await assert.rejects(() => new HoldedClient("test-token").createInvoiceDraft(invoice), /malformed document total/);
  await assert.rejects(() => new HoldedClient("test-token").createInvoice({ ...invoice, approveDoc: true }), /only create Holded invoice drafts/);
});

test("totals comparison is deterministic to cents and rejects non-finite values", () => {
  assert.equal(compareHoldedDocumentTotals({ net: 100.004, tax: 7.004, total: 107.004 }, { net: 100, tax: 7, total: 107 }).matches, true);
  assert.deepEqual(compareHoldedDocumentTotals({ net: 100, tax: 7, total: 107 }, { net: 100, tax: 7.01, total: 107.01 }).difference, { net: 0, tax: 0.01, total: 0.01 });
  assert.throws(() => compareHoldedDocumentTotals({ net: NaN, tax: 7, total: 107 }, { net: 100, tax: 7, total: 107 }), /non-finite expected net/);
});

test("credit-note creation remains a draft, links its invoice, and retrieves status", async () => {
  const calls: Array<{ method: string; url: string; body?: Record<string, unknown> }> = [];
  globalThis.fetch = async (input, init) => {
    const call = { method: String(init?.method), url: String(input), body: init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined };
    calls.push(call);
    if (call.method === "POST") return json({ id: "credit-1" });
    return json({ id: "credit-1", docNumber: null, draft: true, subtotal: -100, tax: -7, total: -107, paymentsPending: -107 });
  };
  const result = await new HoldedClient("test-token").createCreditNoteDraft({ ...invoice, invoiceId: "invoice-1" });
  assert.equal(result.status, "draft");
  assert.deepEqual(calls[0].body?.relatedDocuments, ["invoice-1"]);
  assert.equal(calls[0].body?.approveDoc, false);
  assert.match(calls[1].url, /documents\/creditnote\/credit-1$/);
  await assert.rejects(() => new HoldedClient("test-token").createCreditNoteDraft({ ...invoice, invoiceId: "invoice-1", approveDoc: true }), /only create Holded credit-note drafts/);
});
