import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildVerifactuPayload,
  formatInvoiceNumber,
  invoiceIsLocked,
  nextInvoiceSequence,
  recalcInvoiceLine,
  sumInvoiceLines,
} from "./invoice";

test("booking line: 4 adults at €55.25 is €221 plus 0% tax", () => {
  const line = recalcInvoiceLine({
    adults: 4,
    children: 0,
    adultUnit: 55.25,
    childUnit: 0,
    vatRate: 0,
  });
  assert.equal(line.adultNettTotal, 221);
  assert.equal(line.childNettTotal, 0);
  assert.equal(line.netTotal, 221);
  assert.equal(line.vatAmount, 0);
  assert.equal(line.lineTotal, 221);
});

test("edit price: 4 adults at €50 plus 7% IGIC", () => {
  const line = recalcInvoiceLine({
    adults: 4,
    children: 0,
    adultUnit: 50,
    childUnit: 0,
    vatRate: 7,
  });
  assert.equal(line.netTotal, 200);
  assert.equal(line.vatAmount, 14);
  assert.equal(line.lineTotal, 214);
});

test("manual extra line uses qty × unit", () => {
  const line = recalcInvoiceLine({
    quantity: 2,
    unitPrice: 12.5,
    vatRate: 0,
  });
  assert.equal(line.netTotal, 25);
  assert.equal(line.lineTotal, 25);
});

test("invoice totals add lines and keep tax separate", () => {
  const totals = sumInvoiceLines([
    recalcInvoiceLine({ adults: 4, children: 0, adultUnit: 50, childUnit: 0, vatRate: 7 }),
    recalcInvoiceLine({ quantity: 1, unitPrice: 10, vatRate: 0 }),
  ]);
  assert.equal(totals.netTotal, 210);
  assert.equal(totals.vatTotal, 14);
  assert.equal(totals.grandTotal, 224);
});

test("next number is series-year-padded sequence", () => {
  assert.equal(formatInvoiceNumber("MHT", 2026, 1), "MHT-2026-0001");
  assert.equal(nextInvoiceSequence(["MHT-2026-0001", "MHT-2026-0007", "ACE-2026-0099"], "MHT", 2026), 8);
  assert.equal(nextInvoiceSequence([], "MHT", 2026), 1);
});

test("paid, voided, or recorded Verifactu invoices are locked", () => {
  assert.equal(invoiceIsLocked({ status: "draft", paid: false, voided: false, verifactuStatus: "not_sent" }), false);
  assert.equal(invoiceIsLocked({ status: "issued", paid: false, voided: false, verifactuStatus: "manual" }), true);
  assert.equal(invoiceIsLocked({ status: "draft", paid: true, voided: false, verifactuStatus: "not_sent" }), true);
  assert.equal(invoiceIsLocked({ status: "draft", paid: false, voided: true, verifactuStatus: "not_sent" }), true);
  assert.equal(invoiceIsLocked({ status: "issued", paid: false, voided: false, verifactuStatus: "recorded" }), true);
});

test("Verifactu payload has the fields the API will need", () => {
  const payload = buildVerifactuPayload({
    series: "MHT",
    invoiceNumber: "MHT-2026-0001",
    invoiceDate: "2026-08-15",
    issuerName: "MHT Shows SL",
    issuerTaxId: "B12345678",
    recipientName: "Sunshine Travel",
    recipientTaxId: "B87654321",
    currency: "EUR",
    lines: [
      { description: "ACE 4 pax", quantity: 4, unitPrice: 50, vatRate: 7, netTotal: 200, vatAmount: 14, lineTotal: 214 },
    ],
    netTotal: 200,
    vatTotal: 14,
    grandTotal: 214,
  });
  assert.equal(payload.invoiceType, "F1");
  assert.equal(payload.number, "MHT-2026-0001");
  assert.equal(payload.issuer.taxId, "B12345678");
  assert.equal(payload.recipient.taxId, "B87654321");
  assert.equal(payload.totals.grandTotal, 214);
  assert.equal(payload.lines.length, 1);
  assert.equal(payload.lines[0].vatRate, 7);
});
