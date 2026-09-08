import assert from "node:assert/strict";
import { test } from "node:test";

import {
  holdedContactBody,
  holdedContactFromSupplier,
  holdedInvoiceFromPack,
  holdedItemsFromLines,
  holdedTag,
  pickHoldedTaxKey,
  requireHoldedIgicTaxKey,
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

test("booking line splits into adult and child items with exact unit prices", () => {
  const items = holdedItemsFromLines(
    [{ description: "MHT ACE 12 Sept", booking_ref: "MHT-319001", guest_name: "Smith", adults: 2, children: 1, adult_unit_price: 27.95, child_unit_price: 15, vat_rate: 7 }],
    (r) => (r === 7 ? IGIC_7 : null),
    TAXES,
  );
  assert.equal(items.length, 2);
  assert.deepEqual(items[0], { name: "MHT ACE 12 Sept — 2 adults", desc: "MHT-319001", units: 2, subtotal: 27.95, taxes: ["s_igic_7"] });
  assert.deepEqual(items[1], { name: "MHT ACE 12 Sept — 1 child", desc: "MHT-319001", units: 1, subtotal: 15, taxes: ["s_igic_7"] });
});

test("manual line requires a configured and validated IGIC sales tax key", () => {
  const line = [{ description: "Bus supplement", quantity: 3, unit_price: 4.5, vat_rate: 7, notes: "Sept" }];
  const items = holdedItemsFromLines(line, () => IGIC_7, TAXES);
  assert.deepEqual(items, [{ name: "Bus supplement", desc: "Sept", units: 3, subtotal: 4.5, taxes: ["s_igic_7"] }]);
  assert.throws(() => holdedItemsFromLines(line, () => null, TAXES), /No approved Canary\/IGIC/);
  assert.throws(() => holdedItemsFromLines(line, () => ({ ...IGIC_7, id: "missing" }), TAXES), /does not match/);
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
  assert.match(inv.desc, /Sunny Reps · 2026-09-01 → 2026-09-30 · Solvio MHT-2026-0007/);
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
