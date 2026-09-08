import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

// Execute the actual server-action bodies with their permission boundary denied.
// The guard's role/page decisions have separate tests; these catch missing calls.
function deniedActions() {
  let databaseReads = 0;
  const ctx = {
    user: { id: "restricted-staff" }, business: { id: "workspace", show_ops_enabled: true },
    role: "office", allowedPages: ["door"], config: {},
    supabase: { from() { databaseReads++; throw new Error("Database reached before permission check"); } },
  };
  const access = {
    requireShowOpsContext: async () => ctx,
    requireShowOpsRole: async () => ctx,
    requireShowOpsAction: async () => { throw new Error("Action permission denied"); },
  };
  const output: Record<string, (form: FormData) => Promise<unknown>> = {};
  const source = readFileSync(resolve("src/app/dashboard/show-ops/actions.ts"), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(compiled, {
    exports: output, FormData, URLSearchParams, console,
    require: (id: string) => id === "@/lib/show-ops/access" ? access : {},
  });
  return { actions: output, reads: () => databaseReads };
}

for (const name of [
  "createBookingAction", "updateBookingAction", "cancelBookingAction",
  "recordPaymentAction", "sendShowOpsPaymentLinkAction", "resendGuestTicketAction",
  "markListFlagAction", "markArrivedPaxAction", "checkInShowOpsTicketAction",
  "generateInvoicePackAction", "markInvoicePaidAction", "voidInvoiceAction",
]) {
  test(`${name} checks its page permission before reading or changing data`, async () => {
    const { actions, reads } = deniedActions();
    const form = new FormData();
    form.set("id", "booking"); form.set("booking_id", "booking"); form.set("amount", "10");
    form.set("invoice_id", "invoice"); form.set("cancel_reason", "test");
    await assert.rejects(() => actions[name](form), /Action permission denied/);
    assert.equal(reads(), 0);
  });
}
