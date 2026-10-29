import assert from "node:assert/strict";
import { test } from "node:test";

import {
  holdedContactBody,
  holdedContactFromSupplier,
  holdedInvoiceFromPack,
  holdedInvoiceListRow,
  holdedItemsFromLines,
  holdedTag,
  pickHoldedTaxKey,
  requireHoldedIgicTaxKey,
  approvalMatches,
  summariseHoldedDocument,
  unixDay,
} from "./holded";

const TAXES = [
  { id: "iva21", key: "s_iva_21", name: "IVA 21%", amount: 21, scope: "sales", legalTreatment: "iva", category: "sales" },
  { id: "iva7", key: "s_iva_7", name: "IVA 7%", amount: 7, scope: "sales", legalTreatment: "iva", category: "sales" },
  { id: "generic7", key: "tax_7_sales", name: "Impuesto 7", amount: 7, scope: "sales", legalTreatment: "other", category: "sales" },
  { id: "igic7", key: "s_igic_7", name: "Canary sales 7", amount: 7, scope: "sales", legalTreatment: "igic", category: "sales" },
  { id: "pigic7", key: "p_igic_7", name: "Canary purchase 7", amount: 7, scope: "purchases", legalTreatment: "igic", category: "purchases" },
  { id: "iva0", key: "s_iva_0", name: "IVA 0%", amount: 0, scope: "sales", legalTreatment: "iva", category: "sales" },
];
const IGIC_7 = { id: "igic7", key: "s_igic_7", rate: 7, legalTreatment: "igic" as const, category: "sales" as const };

test("tax key prefers IGIC sales key, then a standard s_ key, never purchases", () => {
  assert.equal(pickHoldedTaxKey(TAXES, 7), "s_igic_7");
  assert.equal(pickHoldedTaxKey(TAXES, 7, { preferIgic: false }), "s_iva_7");
  assert.equal(pickHoldedTaxKey(TAXES, 21), "s_iva_21");
  assert.equal(pickHoldedTaxKey(TAXES, 0), "s_iva_0");
  assert.equal(pickHoldedTaxKey(TAXES, 10), null);
  assert.equal(pickHoldedTaxKey(TAXES.filter((t) => !/^s_/.test(t.key) && t.scope === "sales"), 7), "tax_7_sales");
});

test("explicit IGIC mapping fails closed when absent, wrong-scope, wrong-rate, or IVA", () => {
  assert.equal(requireHoldedIgicTaxKey(TAXES, 7, IGIC_7), "s_igic_7");
  assert.throws(() => requireHoldedIgicTaxKey(TAXES, 7, null), /No approved Canary\/IGIC/);
  assert.throws(() => requireHoldedIgicTaxKey(TAXES, 7, { ...IGIC_7, id: "pigic7", key: "p_igic_7" }), /does not match/);
  assert.throws(() => requireHoldedIgicTaxKey(TAXES, 7, { ...IGIC_7, id: "iva7", key: "s_iva_7" }), /does not match/);
  assert.throws(() => requireHoldedIgicTaxKey(TAXES, 21, IGIC_7), /does not match/);
});

test("an approval survives Holded re-issuing the tax id (same key), but not a different key", () => {
  // MHT's approval was saved as id "s_igic_7"; Holded later listed the same tax under an ObjectId.
  const stale = { ...IGIC_7, id: "s_igic_7" };
  assert.equal(requireHoldedIgicTaxKey(TAXES, 7, stale), "s_igic_7");
  assert.throws(() => requireHoldedIgicTaxKey(TAXES, 7, { ...stale, key: "s_igic_bu_7" }), /does not match/);
  assert.equal(approvalMatches(stale, { id: "igic7", key: "s_igic_7" }), true);
  assert.equal(approvalMatches(stale, { id: "other", key: "s_igic_art_7" }), false);
  assert.equal(approvalMatches(null, { id: "igic7", key: "s_igic_7" }), false);
});

test("tags survive Holded's punctuation stripping", () => {
  assert.equal(holdedTag("island: Gran Canaria"), "islandgrancanaria");
  assert.equal(holdedTag("Tenerife Sur — 2026"), "tenerifesur2026");
});

test("supplier → contact uses legal name, tax id as code, island tag", () => {
  const c = holdedContactFromSupplier({ name: "Sunny Reps", legal_name: "SUNNY REPS SL", tax_id: "b12345678", email: "a@b.com", invoice_address: "C/ Uno 1", island: "Tenerife" });
  assert.equal(c.name, "SUNNY REPS SL");
  assert.equal(c.code, "b12345678");
  assert.deepEqual(c.tags, ["solvio", "islandtenerife"]);
  const body = holdedContactBody(c);
  assert.equal(body.type, "client");
  assert.deepEqual(body.billAddress, { address: "C/ Uno 1" });
  const bare = holdedContactBody(holdedContactFromSupplier({ name: "Cash desk" }));
  assert.equal("code" in bare, false);
  assert.equal("email" in bare, false);
});

test("booking line is one Holded item named like MHT's own invoices", () => {
  const items = holdedItemsFromLines(
    [{ description: "Smith A · MHT-319378", booking_ref: "MHT-319378", guest_name: "Smith A", supplier_ticket_number: "GYGWZAL8Y858", adults: 2, children: 1, adult_unit_price: 27.95, child_unit_price: 15, vat_rate: 7 }],
    (r) => (r === 7 ? IGIC_7 : null),
    TAXES,
    "MHT Tenerife",
  );
  assert.deepEqual(items, [
    { name: "MHT Tenerife", desc: "Smith A MHT-319378 GYGWZAL8Y858 · 2 adults, 1 child", units: 1, subtotal: 70.9, taxes: ["s_igic_7"] },
  ]);
  // Without an item name the line's own description is used.
  const plain = holdedItemsFromLines([{ description: "Smith", guest_name: "Smith", adults: 1, adult_unit_price: 0.1, vat_rate: 7 }], () => IGIC_7, TAXES);
  assert.equal(plain[0].name, "Smith");
  assert.equal(plain[0].subtotal, 0.1);
});

test("prices include IGIC: Holded gets the net, so it adds the IGIC back to the price", () => {
  const booking = { description: "Smith A · MHT-319378", booking_ref: "MHT-319378", guest_name: "Smith A", adults: 2, adult_unit_price: 34.3, vat_rate: 7, net_total: 64.11 };
  const manual = { description: "Bus supplement", quantity: 2, unit_price: 15, vat_rate: 7, notes: "Sept", net_total: "28.04" };
  const items = holdedItemsFromLines([booking, manual], () => IGIC_7, TAXES, "MHT Tenerife", true);
  assert.deepEqual(items, [
    { name: "MHT Tenerife", desc: "Smith A MHT-319378 · 2 adults", units: 1, subtotal: 64.11, taxes: ["s_igic_7"] },
    { name: "Bus supplement", desc: "2 × 15.00 · Sept", units: 1, subtotal: 28.04, taxes: ["s_igic_7"] },
  ]);
  // 64.11 + 4.49 and 28.04 + 1.96: the IGIC Holded adds brings each line back to its price.
  assert.equal(Math.round((64.11 + Math.round(64.11 * 7) / 100) * 100) / 100, 68.6);
  // Off by default: the price is sent as it is.
  assert.equal(holdedItemsFromLines([booking], () => IGIC_7, TAXES)[0].subtotal, 68.6);
});

test("prices include IGIC: a line still saved with IGIC on top is refused, not sent", () => {
  const stale = { description: "Smith", guest_name: "Smith", adults: 1, adult_unit_price: 34.3, vat_rate: 7, net_total: 34.3 };
  assert.throws(() => holdedItemsFromLines([stale], () => IGIC_7, TAXES, undefined, true), /Recalculate it/);
  const pack = { id: "p1", supplier_name: "Sunny", period_start: "2026-10-01", period_end: "2026-10-31", island: "Tenerife" };
  assert.throws(() => holdedInvoiceFromPack(pack, [stale], "c1", () => IGIC_7, TAXES, { pricesIncludeTax: true }), /Recalculate it/);
  assert.equal(holdedInvoiceFromPack(pack, [{ ...stale, net_total: 32.06 }], "c1", () => IGIC_7, TAXES, { pricesIncludeTax: true }).items[0].subtotal, 32.06);
});

test("a booking with nobody left to bill (0 pax, €0) is left off the Holded invoice", () => {
  const zero = { description: "cummings · MHT-317002", guest_name: "cummings", adults: 0, children: 0, quantity: 0, unit_price: 0, vat_rate: 7, net_total: 0 };
  const paid = { description: "Baker · MHT-317583", guest_name: "Baker", adults: 2, adult_unit_price: 34.3, vat_rate: 7, net_total: 64.11 };
  const items = holdedItemsFromLines([zero, paid, zero], () => IGIC_7, TAXES, "MHT Lanzarote", true);
  assert.equal(items.length, 1);
  assert.equal(items[0].subtotal, 64.11);
  // Lines without a quantity still default to one unit, and free tickets still go over at €0.
  assert.equal(holdedItemsFromLines([{ description: "Extra", unit_price: 5, vat_rate: 7 }], () => IGIC_7, TAXES)[0].units, 1);
  assert.equal(holdedItemsFromLines([{ description: "Comp", adults: 2, quantity: 2, unit_price: 0, vat_rate: 7 }], () => IGIC_7, TAXES)[0].units, 2);
  assert.throws(() => holdedItemsFromLines([zero], () => IGIC_7, TAXES), /charges nothing/);
});

test("holdedItemsFromLines puts the partner ticket number on the Holded line", () => {
  const items = holdedItemsFromLines(
    [{ description: "Smith · MHT-319001", booking_ref: "MHT-319001", supplier_ticket_number: " 4471 ", quantity: 1, unit_price: 40, vat_rate: 7, notes: "No show" }],
    () => IGIC_7,
    TAXES,
  );
  assert.equal(items[0].desc, "MHT-319001 · Ticket 4471 · No show");
});

test("manual line requires a configured and validated IGIC sales tax key", () => {
  const line = [{ description: "Bus supplement", quantity: 3, unit_price: 4.5, vat_rate: 7, notes: "Sept" }];
  const items = holdedItemsFromLines(line, () => IGIC_7, TAXES);
  assert.deepEqual(items, [{ name: "Bus supplement", desc: "Sept", units: 3, subtotal: 4.5, taxes: ["s_igic_7"] }]);
  assert.throws(() => holdedItemsFromLines(line, () => null, TAXES), /No approved Canary\/IGIC/);
  // A stale id with the same key is the same tax (Holded re-issues ids); the key decides.
  assert.deepEqual(holdedItemsFromLines(line, () => ({ ...IGIC_7, id: "missing" }), TAXES), items);
  assert.throws(() => holdedItemsFromLines(line, () => ({ ...IGIC_7, id: "iva7", key: "s_iva_7" }), TAXES), /does not match/);
  assert.throws(() => holdedItemsFromLines(line, () => ({ ...IGIC_7, id: "pigic7", key: "p_igic_7" }), TAXES), /does not match/);
  assert.throws(() => holdedItemsFromLines(line, () => IGIC_7), /does not match/);
  assert.throws(() => holdedItemsFromLines([{ description: "Bad", quantity: 1, unit_price: Number.NaN, vat_rate: 7 }], () => IGIC_7, TAXES), /non-finite unit price/);
});

test("pack → Holded invoice is a draft with Solvio reference, dates as unix days, non-EUR currency passed", () => {
  const inv = holdedInvoiceFromPack(
    { id: "pack-1", supplier_name: "Sunny Reps", invoice_number: "MHT-2026-0007", period_start: "2026-09-01", period_end: "2026-09-30", invoice_date: "2026-10-01", due_date: "2026-10-31", island: "Tenerife", currency: "eur", notes: "Thanks" },
    [{ description: "Line", quantity: 1, unit_price: 10, vat_rate: 0 }],
    "contact-1",
    () => ({ id: "igic0", key: "s_igic_0", rate: 0, legalTreatment: "igic", category: "sales" }),
    [...TAXES, { id: "igic0", key: "s_igic_0", name: "Canary sales 0", amount: 0, scope: "sales", legalTreatment: "igic", category: "sales" }],
  );
  assert.equal(inv.approveDoc, false);
  assert.equal(inv.contactId, "contact-1");
  assert.equal(inv.desc, "MHT Tenerife · Sunny Reps · 2026-09-01 → 2026-09-30 · Solvio MHT-2026-0007");
  assert.deepEqual(inv.tags, ["solvio", "islandtenerife", "tfs"]);
  assert.equal(inv.date, unixDay("2026-10-01"));
  assert.equal(inv.dueDate, unixDay("2026-10-31"));
  assert.equal(inv.currency, undefined);
  assert.match(inv.notes ?? "", /Thanks\nSolvio pack pack-1/);
  const gbp = holdedInvoiceFromPack({ id: "p", supplier_name: "UK Coach", period_start: "2026-09-01", period_end: "2026-09-30", currency: "gbp" }, [], "c", () => null, TAXES);
  assert.equal(gbp.currency, "gbp");
});

test("Holded document summary distinguishes draft, approved and paid", () => {
  assert.equal(summariseHoldedDocument({ id: "a", draft: true, docNumber: null, approvedAt: null, subtotal: 93.46, tax: 6.54, total: 100, paymentsPending: 100 }).status, "draft");
  const approved = summariseHoldedDocument({ id: "b", draft: false, docNumber: "F260001", subtotal: 93.46, tax: 6.54, total: 100, paymentsPending: 100, approvedAt: 1788900000 });
  assert.equal(approved.status, "approved");
  assert.equal(approved.docNumber, "F260001");
  assert.equal(approved.approvedAt, new Date(1788900000 * 1000).toISOString());
  assert.equal(summariseHoldedDocument({ id: "c", draft: false, docNumber: "F260002", approvedAt: 1788900000, subtotal: 93.46, tax: 6.54, total: 100, paymentsPending: 0 }).status, "paid");
  assert.equal(summariseHoldedDocument({ id: "p", draft: false, docNumber: "F3", approvedAt: 1788900000, subtotal: 100, tax: 7, total: 107, paymentsPending: 50 }).status, "approved");
  assert.equal(summariseHoldedDocument({ id: "n", draft: false, docNumber: "R1", approvedAt: 1788900000, subtotal: -100, tax: -7, total: -107, paymentsPending: -107 }).status, "approved");
  assert.equal(summariseHoldedDocument({ id: "z", draft: false, docNumber: "R2", approvedAt: 1788900000, subtotal: 0, tax: 0, total: 0, paymentsPending: 0 }).status, "paid");
  assert.throws(() => summariseHoldedDocument({ id: "bad", draft: true, subtotal: 1, tax: 1, total: "NaN" }), /malformed document total/);
  assert.throws(() => summariseHoldedDocument({ id: "bad", draft: false, docNumber: 123, approvedAt: 1, subtotal: 1, tax: 1, total: 2 }), /malformed document number/);
  assert.throws(() => summariseHoldedDocument({ id: "bad", draft: false, docNumber: "", approvedAt: 1, subtotal: 1, tax: 1, total: 2 }), /malformed document number/);
  assert.throws(() => summariseHoldedDocument({ id: "bad", draft: false, docNumber: "F1", approvedAt: "1788900000", subtotal: 1, tax: 1, total: 2 }), /malformed approval timestamp/);
  assert.throws(() => summariseHoldedDocument({ id: "bad", draft: "false", docNumber: "F1", approvedAt: 1, subtotal: 1, tax: 1, total: 2 }), /malformed draft flag/);
  assert.throws(() => summariseHoldedDocument({ id: "bad", draft: false, docNumber: "F1", approvedAt: null, subtotal: 1, tax: 1, total: 2 }), /without an approval timestamp/);
  assert.throws(() => summariseHoldedDocument({ id: "bad", draft: true, docNumber: null, approvedAt: 1, subtotal: 1, tax: 1, total: 2 }), /approved timestamp for a draft/);
  assert.throws(() => summariseHoldedDocument({ id: "bad", draft: true, status: "paid", subtotal: 1, tax: 1, total: 2 }), /inconsistent document status/);
});

test("Holded taxes are normalised so IGIC treatment can be recognised", async () => {
  const { normaliseHoldedTax, parseIgicApprovals, approvalFromTax, approvalForRate, holdedInvoiceView } = await import("./holded");
  const igic = normaliseHoldedTax({ id: "t1", key: "s_igic_7", name: "IGIC 7%", amount: 7, scope: "sales" });
  assert.equal(igic?.legalTreatment, "igic");
  assert.equal(igic?.category, "sales");
  assert.equal(normaliseHoldedTax({ id: "t2", key: "s_iva_21", name: "IVA 21%", amount: 21, scope: "sales" })?.legalTreatment, "iva");
  assert.equal(normaliseHoldedTax({ key: "", name: "x", amount: 1 }), null);
  assert.equal(normaliseHoldedTax({ id: "t3", key: "tax_7_sales", name: "Impuesto 7", amount: 7, scope: "sales" })?.legalTreatment, "other");

  const approval = approvalFromTax(igic!);
  assert.deepEqual(approval, { id: "t1", key: "s_igic_7", rate: 7, legalTreatment: "igic", category: "sales" });
  assert.equal(approvalFromTax(normaliseHoldedTax({ id: "t4", key: "p_igic_7", name: "IGIC 7%", amount: 7, scope: "purchases" })!), null, "purchase taxes are never approved for sales lines");
  assert.equal(approvalFromTax(normaliseHoldedTax({ id: "t2", key: "s_iva_21", name: "IVA 21%", amount: 21, scope: "sales" })!), null);

  const parsed = parseIgicApprovals({ igic_taxes: { "7": approval, "3": { id: "x", key: "s_iva_3", rate: 3, legalTreatment: "iva", category: "sales" }, bad: "nope" } });
  assert.deepEqual(Object.keys(parsed), ["7"], "non-IGIC or malformed approvals are dropped");
  assert.deepEqual(approvalForRate(parsed, 7), approval);
  assert.equal(approvalForRate(parsed, 3), null);
  assert.equal(approvalForRate(parseIgicApprovals(null), 7), null);

  assert.equal(holdedInvoiceView({ holded_status: "not_sent" }, true).canSend, true);
  assert.equal(holdedInvoiceView({ holded_status: "not_sent" }, false).canSend, false);
  assert.equal(holdedInvoiceView({ holded_status: "unknown", holded_reconciliation_status: "required" }, true).canReconcile, true);
  assert.equal(holdedInvoiceView({ holded_status: "unknown", holded_reconciliation_status: "required" }, true).canSend, false);
  assert.equal(holdedInvoiceView({ holded_status: "draft", holded_document_id: "d1" }, true).canRefresh, true);
  assert.equal(holdedInvoiceView({ holded_status: "failed", holded_error: "boom" }, true).canSend, true);
  assert.equal(holdedInvoiceView({ holded_status: "approved", holded_document_id: "d1", holded_doc_number: "F260001" }, true).label, "Issued by Holded as F260001 (Verifactu)");
  const stale = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  assert.equal(holdedInvoiceView({ holded_status: "creating", holded_claimed_at: stale }, true).canReconcile, true);
  assert.equal(holdedInvoiceView({ holded_status: "creating", holded_claimed_at: new Date().toISOString() }, true).canReconcile, false);
});

test("a real Holded draft (numeric status 0, draft true) parses; paid needs status 1", async () => {
  const { summariseHoldedDocument } = await import("./holded");
  // Shape captured from the Solvio test company on 9 Sept 2026.
  const real = { id: "6aa072e687f71d7bde0b7ddb", draft: true, status: 0, docNumber: null, approvedAt: null, subtotal: 335.4, tax: 23.48, total: 358.88, paymentsPending: 358.88, paymentsTotal: 0, currency: "eur" };
  const s = summariseHoldedDocument(real);
  assert.equal(s.status, "draft");
  assert.equal(s.net, 335.4);
  assert.equal(s.total, 358.88);
  const approved = summariseHoldedDocument({ ...real, draft: false, status: 0, docNumber: "F260001", approvedAt: 1788900000 });
  assert.equal(approved.status, "approved");
  const paid = summariseHoldedDocument({ ...real, draft: false, status: 1, docNumber: "F260001", approvedAt: 1788900000, paymentsPending: 0 });
  assert.equal(paid.status, "paid");
  assert.throws(() => summariseHoldedDocument({ ...real, draft: false, status: 1, docNumber: "F260001", approvedAt: 1788900000, paymentsPending: 100 }), /inconsistent/);
  assert.throws(() => summariseHoldedDocument({ ...real, status: 7 }), /malformed document status/);
});

test("holdedInvoiceListRow reads v2 and v1 list entries for the Holded-style invoice list", () => {
  assert.deepEqual(
    holdedInvoiceListRow({ id: "a1", draft: true, date: "2026-10-27T00:00:00Z", due_date: "2026-11-26", contact_name: "Admiral Excursion Point SC", description: "MHT Tenerife", tags: ["tfs"], total: 107, payments_pending: 107 }),
    { id: "a1", docNumber: null, date: "2026-10-27", dueDate: "2026-11-26", contactName: "Admiral Excursion Point SC", description: "MHT Tenerife", tags: ["tfs"], total: 107, status: "draft" },
  );
  const v1 = holdedInvoiceListRow({ id: "b2", docNumber: "F260001", date: unixDay("2026-10-01"), dueDate: unixDay("2026-10-31"), contactName: "Sunny Reps", desc: "Sept", total: 50, paymentsPending: 0, status: 1 });
  assert.equal(v1?.status, "paid");
  assert.equal(v1?.date, "2026-10-01");
  assert.equal(v1?.docNumber, "F260001");
  assert.equal(holdedInvoiceListRow({ id: "c3", document_number: "F260002", draft: false, total: 20, payments_pending: 20 })?.status, "approved");
  assert.equal(holdedInvoiceListRow({ name: "no id" }), null);
});
