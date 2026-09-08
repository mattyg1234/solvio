import assert from "node:assert/strict";
import { test } from "node:test";
import { PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { buildInvoicePdf, formatInvoiceDate, hexToRgb, type InvoicePdfInput } from "./invoice-pdf";

export const sampleInvoice: InvoicePdfInput = {
  invoice: {
    invoice_number: "MHT-2026-0042", invoice_date: "2026-09-05", period_start: "2026-09-01",
    period_end: "2026-09-04", due_date: "2026-10-05", payment_terms_days: 30, currency: "gbp", paid: true, paid_at: "2026-09-05",
    issuer_name: "Show Company Ltd", issuer_tax_id: "GB123456789", issuer_address: "12 Theatre Road\nLondon W1",
    recipient_name: "Partner Agency", recipient_tax_id: "B12345678", recipient_address: "Calle Mayor 10\nTenerife",
    supplier_name: "Partner Agency", net_total: 100, vat_total: 20, total_amount: 120, notes: "Thank you for your business.",
  },
  lines: [{ description: "Manual transport adjustment", line_kind: "manual", quantity: 2, net_total: 100, vat_amount: 20,
    vat_rate: 20, line_total: 120, notes: "Agreed adjustment", booking_ref: null, supplier_ticket_number: null, show_date: "2026-09-05" }],
  branding: { taxLabel: "VAT", accentColor: "#7c3aed", footerNote: "Bank: Example Bank · IBAN GB00 EXAM 0000 0000 0000 00", thankYouName: "MHT" },
};

// Smallest valid PNG (1x1, transparent) so logo embedding is exercised without fixtures.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

async function content(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  const text = doc.context.enumerateIndirectObjects().flatMap(([, object]) =>
    object instanceof PDFRawStream
      ? [Buffer.from(decodePDFRawStream(object).decode()).toString("latin1")] : []).join("\n");
  return { doc, text };
}
const hex = (s: string) => Buffer.from(s, "latin1").toString("hex").toUpperCase();

test("issued PDF includes stored GBP, tax label, manual lines, legal identity, footer and PAID stamp", async () => {
  const bytes = await buildInvoicePdf(sampleInvoice);
  assert.equal(Buffer.from(bytes).subarray(0, 5).toString(), "%PDF-");
  const { doc, text } = await content(bytes);
  assert.equal(doc.getPageCount(), 1);
  for (const value of ["MHT-2026-0042", "GB123456789", "B12345678", "Manual transport adjustment", "£120.00", "£20.00", "PAID",
    "5 Oct 2026", "VAT", "IBAN GB00", "Page 1 of 1", "Thank you for working with MHT."]) {
    assert.ok(text.includes(hex(value)), `PDF missing ${value}`);
  }
});

test("unpaid invoices carry no stamp, even past the due date, and show payment terms", async () => {
  const unpaid = { ...sampleInvoice, invoice: { ...sampleInvoice.invoice, paid: false, paid_at: null, due_date: "2020-01-01" } };
  const { text } = await content(await buildInvoicePdf(unpaid));
  assert.ok(!text.includes(hex("OVERDUE")));
  assert.ok(!text.includes(hex("PAID")));
  assert.ok(text.includes(hex("Awaiting payment")));
  assert.ok(text.includes(hex("Payment due within 30 days")));
});

test("EUR invoices print euro amounts and the IGIC label", async () => {
  const eur = { ...sampleInvoice, invoice: { ...sampleInvoice.invoice, currency: "eur" }, branding: { taxLabel: "IGIC" } };
  const { text } = await content(await buildInvoicePdf(eur));
  // WinAnsi encodes the euro sign as 0x80, which latin1 cannot express.
  assert.ok(text.includes(`80${hex("120.00")}`), "PDF missing €120.00");
  assert.ok(text.includes(hex("IGIC")));
  assert.ok(!text.includes(hex("VAT")));
});

test("business logo is embedded as an image when supplied, and a bad logo fails loudly", async () => {
  const withLogo = await buildInvoicePdf({ ...sampleInvoice, branding: { ...sampleInvoice.branding, logo: { bytes: new Uint8Array(TINY_PNG), kind: "png" } } });
  const { doc } = await content(withLogo);
  const images = doc.context.enumerateIndirectObjects().filter(([, o]) => o instanceof PDFRawStream && String(o.dict.get(o.dict.context.obj("Subtype")) ?? "").includes("Image"));
  assert.ok(images.length >= 1, "expected an embedded image XObject");
  await assert.rejects(buildInvoicePdf({ ...sampleInvoice, branding: { logo: { bytes: new Uint8Array([1, 2, 3]), kind: "png" } } }), /logo could not be embedded/i);
});

test("long invoices paginate without dropping final rows or totals, with continuation headers", async () => {
  const lines = Array.from({ length: 80 }, (_, i) => ({ ...sampleInvoice.lines[0], description: `Transport adjustment ${i + 1}` }));
  const { doc, text } = await content(await buildInvoicePdf({ ...sampleInvoice, lines }));
  assert.ok(doc.getPageCount() > 2);
  assert.ok(text.includes(hex("Transport adjustment 80")));
  assert.ok(text.includes(hex("£120.00")));
  assert.ok(text.includes(hex("continued")));
  assert.ok(text.includes(hex(`Page ${doc.getPageCount()} of ${doc.getPageCount()}`)));
});

test("oversized or unrenderable invoice content fails explicitly", async () => {
  await assert.rejects(buildInvoicePdf({ ...sampleInvoice, lines: [{ ...sampleInvoice.lines[0], description: "x".repeat(10000) }] }), /too long/i);
  await assert.rejects(buildInvoicePdf({ ...sampleInvoice, invoice: { ...sampleInvoice.invoice, currency: "zzz" } }), /currency/i);
});

test("amounts too wide for the table fail instead of overlapping adjacent columns", async () => {
  await assert.rejects(buildInvoicePdf({ ...sampleInvoice, lines: [{ ...sampleInvoice.lines[0], line_total: 1e30 }] }), /too wide/i);
});

test("table rules do not strike through the next row's text", async () => {
  const { doc } = await content(await buildInvoicePdf({ ...sampleInvoice, lines: [sampleInvoice.lines[0], sampleInvoice.lines[0], sampleInvoice.lines[0]] }));
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream)) continue;
    const stream = Buffer.from(decodePDFRawStream(object).decode()).toString("latin1");
    const baselines = [...stream.matchAll(/1 0 0 1 [\d.]+ ([\d.]+) Tm/g)].map((m) => Number(m[1]));
    const rules = [...stream.matchAll(/547\.28 ([\d.]+) l/g)].map((m) => Number(m[1]));
    assert.ok(rules.length >= 3, "expected hairline rules under rows");
    for (const rule of rules) {
      assert.ok(baselines.every((baseline) => rule < baseline - 3 || rule > baseline + 10), `table rule at ${rule} intersects text`);
    }
  }
});

test("thank-you line falls back to the issuer name when no brand name is configured", async () => {
  const { text } = await content(await buildInvoicePdf({ ...sampleInvoice, branding: {} }));
  assert.ok(text.includes(hex("Thank you for working with Show Company Ltd.")));
});

test("helpers: dates read naturally and bad accent colours fall back to Solvio purple", () => {
  assert.equal(formatInvoiceDate("2026-09-05"), "5 Sep 2026");
  assert.equal(formatInvoiceDate(null), "–");
  assert.equal(formatInvoiceDate("Q3"), "Q3");
  assert.deepEqual(hexToRgb("nonsense"), hexToRgb("#7c3aed"));
  assert.notDeepEqual(hexToRgb("#14b8a6"), hexToRgb("#7c3aed"));
});
