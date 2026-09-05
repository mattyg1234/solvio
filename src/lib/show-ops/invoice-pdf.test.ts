import assert from "node:assert/strict";
import { test } from "node:test";
import { PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { buildInvoicePdf, type InvoicePdfInput } from "./invoice-pdf";

export const sampleInvoice: InvoicePdfInput = {
  invoice: {
    invoice_number: "MHT-2026-0042", invoice_date: "2026-09-05", period_start: "2026-09-01",
    period_end: "2026-09-04", due_date: "2026-10-05", currency: "gbp", paid: true, paid_at: "2026-09-05",
    issuer_name: "Show Company Ltd", issuer_tax_id: "GB123456789", issuer_address: "12 Theatre Road\nLondon W1",
    recipient_name: "Partner Agency", recipient_tax_id: "B12345678", recipient_address: "Calle Mayor 10\nTenerife",
    supplier_name: "Partner Agency", net_total: 100, vat_total: 20, total_amount: 120, notes: "Thank you for your business.",
  },
  lines: [{ description: "Manual transport adjustment", line_kind: "manual", quantity: 2, net_total: 100, vat_amount: 20,
    vat_rate: 20, line_total: 120, notes: "Agreed adjustment", booking_ref: null, supplier_ticket_number: null, show_date: "2026-09-05" }],
};

async function content(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  const text = doc.context.enumerateIndirectObjects().flatMap(([, object]) =>
    object instanceof PDFRawStream
      ? [Buffer.from(decodePDFRawStream(object).decode()).toString("latin1")] : []).join("\n");
  return { doc, text };
}
const hex = (s: string) => Buffer.from(s, "latin1").toString("hex").toUpperCase();

test("issued PDF includes stored GBP, tax, manual lines and legal identity", async () => {
  const bytes = await buildInvoicePdf(sampleInvoice);
  assert.equal(Buffer.from(bytes).subarray(0, 5).toString(), "%PDF-");
  const { doc, text } = await content(bytes);
  assert.equal(doc.getPageCount(), 1);
  for (const value of ["MHT-2026-0042", "GB123456789", "B12345678", "Manual transport adjustment", "£120.00", "£20.00", "PAID", "2026-10-05"]) {
    assert.ok(text.includes(hex(value)), `PDF missing ${value}`);
  }
});

test("long invoices paginate without dropping final rows or totals", async () => {
  const lines = Array.from({ length: 80 }, (_, i) => ({ ...sampleInvoice.lines[0], description: `Transport adjustment ${i + 1}` }));
  const { doc, text } = await content(await buildInvoicePdf({ ...sampleInvoice, lines }));
  assert.ok(doc.getPageCount() > 2);
  assert.ok(text.includes(hex("Transport adjustment 80")));
  assert.ok(text.includes(hex("£120.00")));
});

test("oversized or unrenderable invoice content fails explicitly", async () => {
  await assert.rejects(buildInvoicePdf({ ...sampleInvoice, lines: [{ ...sampleInvoice.lines[0], description: "x".repeat(10000) }] }), /too long/i);
  await assert.rejects(buildInvoicePdf({ ...sampleInvoice, invoice: { ...sampleInvoice.invoice, currency: "zzz" } }), /currency/i);
});

test("amounts too wide for the table fail instead of overlapping adjacent columns", async () => {
  await assert.rejects(buildInvoicePdf({ ...sampleInvoice, lines: [{ ...sampleInvoice.lines[0], line_total: 1e30 }] }), /too wide/i);
});

test("table rules do not strike through the next row's text", async () => {
  const { doc } = await content(await buildInvoicePdf({ ...sampleInvoice, lines: [sampleInvoice.lines[0], sampleInvoice.lines[0]] }));
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream)) continue;
    const stream = Buffer.from(decodePDFRawStream(object).decode()).toString("latin1");
    const baselines = [...stream.matchAll(/1 0 0 1 [\d.]+ ([\d.]+) Tm/g)].map((m) => Number(m[1]));
    const rules = [...stream.matchAll(/553 ([\d.]+) l/g)].map((m) => Number(m[1]));
    for (const rule of rules) {
      assert.ok(baselines.every((baseline) => rule < baseline - 3 || rule > baseline + 10), "table rule intersects text");
    }
  }
});
