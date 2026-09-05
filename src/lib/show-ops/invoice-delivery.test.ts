import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadInvoiceDelivery } from "./invoice-delivery";

type Result = { data: unknown; error: unknown; count?: number };
function client(options: { missingBooking?: boolean; truncatedLines?: boolean; invoiceMissing?: boolean; status?: string; badPhoto?: boolean; wrongSeller?: boolean } = {}) {
  const calls: Array<{ table: string; filters: Array<[string, unknown]> }> = [];
  const invoice = { status: options.status || "issued", invoice_number: "TEST-42", currency: "gbp", supplier_id: "seller-1", supplier_name: "Test partner", total_amount: 12 };
  const line = { id: "line-1", booking_id: "booking-1", description: "Ticket", quantity: 1, line_total: 12 };
  return {
    calls,
    supabase: { from(table: string) {
      const call = { table, filters: [] as Array<[string, unknown]> }; calls.push(call);
      const result: Result = table === "show_invoices" ? { data: options.invoiceMissing ? null : invoice, error: null }
        : table === "show_invoice_lines" ? { data: [line], count: options.truncatedLines ? 2 : 1, error: null }
        : { data: options.missingBooking ? [] : [{ id: "booking-1", business_id: "business-1", supplier_id: options.wrongSeller ? "other-seller" : "seller-1", booking_ref: "BK-1", guest_name: "Guest", no_show_proof_path: options.badPhoto ? "https://example.com/photo.png" : null, show_date: "2026-09-05" }], error: null };
      const query = {
        select() { return query; },
        eq(key: string, value: unknown) { call.filters.push([key, value]); return query; },
        in(key: string, value: unknown) { call.filters.push([key, value]); return query; },
        order() { return query; }, range() { return query; },
        maybeSingle() { return Promise.resolve(result); },
        then(resolve: (value: Result) => unknown) { return Promise.resolve(result).then(resolve); },
      };
      return query;
    } } as unknown as SupabaseClient,
  };
}

test("every invoice attachment query is scoped to the authenticated business", async () => {
  const stub = client();
  const result = await loadInvoiceDelivery(stub.supabase, "business-1", "invoice-1");
  assert.equal(Buffer.from(result.bytes).subarray(0, 5).toString(), "%PDF-");
  assert.equal(result.filename, "invoice-TEST-42.pdf");
  assert.equal(result.lines[0].show_date, "2026-09-05");
  for (const call of stub.calls) assert.ok(call.filters.some(([key, value]) => key === "business_id" && value === "business-1"), `${call.table} requires tenant scope`);
  assert.ok(stub.calls[0].filters.some(([key, value]) => key === "id" && value === "invoice-1"));
  assert.ok(stub.calls[1].filters.some(([key, value]) => key === "invoice_id" && value === "invoice-1"));
});

test("missing invoice, draft, missing booking and truncated lines cannot produce an attachment", async () => {
  for (const [options, message] of [
    [{ invoiceMissing: true }, /not found/], [{ status: "draft" }, /issued/],
    [{ missingBooking: true }, /every invoice booking/], [{ truncatedLines: true }, /too many lines/],
  ] as const) {
    await assert.rejects(loadInvoiceDelivery(client(options).supabase, "business-1", "invoice-1"), message);
  }
});


test("basic PDF download remains available when a photo path is bad", async () => {
  const stub = client({ badPhoto: true });
  const result = await loadInvoiceDelivery(stub.supabase, "business-1", "invoice-1", { includeEvidence: false });
  assert.equal(Buffer.from(result.bytes).subarray(0, 5).toString(), "%PDF-");
  await assert.rejects(loadInvoiceDelivery(client({ badPhoto: true }).supabase, "business-1", "invoice-1"), /path/);
  await assert.rejects(loadInvoiceDelivery(client({ wrongSeller: true }).supabase, "business-1", "invoice-1"), /seller/);
});
