import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildVerifactuPayload,
  formatInvoiceNumber,
  invoiceIsLocked,
  nextInvoiceSequence,
  recalcInvoiceLine,
  sumInvoiceLines,
  taxBaseFromGross,
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

test("prices include IGIC: €34.30 is €32.06 net + €2.24 IGIC, not €36.70", () => {
  const line = recalcInvoiceLine({ adults: 1, children: 0, adultUnit: 34.3, childUnit: 0, vatRate: 7, pricesIncludeTax: true });
  assert.equal(line.adultNettTotal, 34.3);
  assert.equal(line.netTotal, 32.06);
  assert.equal(line.vatAmount, 2.24);
  assert.equal(line.lineTotal, 34.3);
  const onTop = recalcInvoiceLine({ adults: 1, children: 0, adultUnit: 34.3, childUnit: 0, vatRate: 7 });
  assert.equal(onTop.lineTotal, 36.7);
});

test("prices include IGIC: MHT's usual booking totals land to the cent", () => {
  for (const [adults, unit] of [[2, 34.3], [3, 41.3], [5, 48.3], [4, 31.85], [7, 44.85], [1, 33.08]] as const) {
    const line = recalcInvoiceLine({ adults, children: 0, adultUnit: unit, childUnit: 0, vatRate: 7, pricesIncludeTax: true });
    assert.equal(line.lineTotal, Math.round(adults * unit * 100) / 100, `${adults} × ${unit}`);
    assert.equal(line.vatAmount, Math.round(line.netTotal * 7) / 100);
  }
  const extra = recalcInvoiceLine({ quantity: 2, unitPrice: 15, vatRate: 7, pricesIncludeTax: true });
  assert.deepEqual([extra.netTotal, extra.vatAmount, extra.lineTotal], [28.04, 1.96, 30]);
});

test("taxBaseFromGross never invoices more than the price; misses are a cent under", () => {
  assert.equal(taxBaseFromGross(34.3, 7), 32.06);
  assert.equal(taxBaseFromGross(41.3, 7), 38.6);
  assert.equal(taxBaseFromGross(48.3, 7), 45.14);
  assert.equal(taxBaseFromGross(50, 0), 50);
  assert.equal(taxBaseFromGross(0, 7), 0);
  // €330.40 has no net that rounds back to it: €308.78 + €21.61 = €330.39.
  assert.equal(taxBaseFromGross(330.4, 7), 308.78);
  for (let cents = 1; cents <= 20000; cents++) {
    const gross = cents / 100;
    const line = recalcInvoiceLine({ quantity: 1, unitPrice: gross, vatRate: 7, pricesIncludeTax: true });
    const short = Math.round((gross - line.lineTotal) * 100);
    assert.ok(short === 0 || short === 1, `${gross} → ${line.lineTotal}`);
  }
});

test("prices include IGIC: invoice totals add up from the lines", () => {
  const lines = [
    recalcInvoiceLine({ adults: 2, children: 1, adultUnit: 34.3, childUnit: 17.15, vatRate: 7, pricesIncludeTax: true }),
    recalcInvoiceLine({ adults: 4, children: 0, adultUnit: 41.3, childUnit: 0, vatRate: 7, pricesIncludeTax: true }),
  ];
  const totals = sumInvoiceLines(lines);
  assert.equal(totals.grandTotal, 85.75 + 165.2);
  assert.equal(totals.grandTotal, Math.round((totals.netTotal + totals.vatTotal) * 100) / 100);
});
