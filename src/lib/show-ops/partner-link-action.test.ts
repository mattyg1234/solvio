import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as calc from "./calc";
import * as config from "./config";
import * as extras from "./extras";
import * as ticketTypes from "./ticket-types";
import * as pickup from "./private-pickup";
import * as types from "./types";
import * as partnerLink from "./partner-link";
import * as partnerBooking from "./partner-booking";
import * as calendar from "./calendar";
import * as rateCards from "./rate-cards";

const compiled = ts.transpileModule(readFileSync(resolve("src/app/dashboard/show-ops/actions.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText;

function scenario(errors: Array<{ code?: string; message: string } | null> = []) {
  const calls: Array<{ name: string; args: { p_token: string; p_booking: Record<string, unknown> } }> = [];
  const supplier = { id: "supplier", business_id: "business", name: "Partner", active: true,
    billing_mode: "deposit", deposit_percent: 30, invoice_nett_percent: 100, partner_type: "agency" };
  const product = { id: "product", name: "Show", island: "Tenerife", active: true, transport_available: true,
    adult_price: 50, child_price: 25, infant_price: 0, adult_nett: 40, child_nett: 20 };
  const admin = {
    from(table: string) {
      const row = table === "show_suppliers" ? supplier : table === "businesses"
        ? { id: "business", name: "MHT", show_ops_enabled: true, show_ops_config: {} }
        : table === "show_products" ? product : null;
      const query = {
        select() { return this; }, eq() { return this; }, order() { return this; },
        maybeSingle: async () => ({ data: row, error: null }),
        limit: async () => ({ data: [], error: null }),
        then(ok: (v: unknown) => unknown) { return Promise.resolve({ data: [], error: null }).then(ok); },
        insert() { throw new Error("Partner creation bypassed the capacity RPC"); },
      };
      return query;
    },
    async rpc(name: string, args: typeof calls[number]["args"]) {
      calls.push({ name, args });
      return { data: args.p_booking.id, error: errors.shift() ?? null };
    },
  };
  const dependencies: Record<string, unknown> = {
    "@/lib/show-ops/calc": calc, "@/lib/show-ops/config": config,
    "@/lib/show-ops/extras": extras, "@/lib/show-ops/ticket-types": ticketTypes,
    "@/lib/show-ops/private-pickup": pickup, "@/lib/show-ops/types": types,
    "@/lib/show-ops/partner-link": partnerLink, "@/lib/show-ops/partner-booking": partnerBooking,
    "@/lib/show-ops/calendar": calendar,
    "@/lib/show-ops/rate-cards": rateCards,
    "@/lib/show-ops/gyg-data": { pushChannelAvailability: async () => {} },
    "@/lib/supabase/server": { createSupabaseServiceRoleClient: () => admin },
    "next/cache": { revalidatePath() {} },
  };
  const actions: Record<string, (form: FormData) => Promise<{ ok: boolean; message?: string }>> = {};
  vm.runInNewContext(compiled, { exports: actions, crypto: globalThis.crypto,
    console: { error() {} }, require: (id: string) => dependencies[id] ?? {} });
  const form = new FormData();
  for (const [key, value] of Object.entries({ partner_token: "synthetic_partner_token_0001", product_id: "product",
    show_date: "2026-10-01", guest_name: "Fixture", adults: "1", pickup_kind: "own_way", supplier_id: "forged" })) form.set(key, value);
  return { save: () => actions.createPartnerLinkBookingAction(form), calls, form };
}

test("real partner action sends server-priced fields through the capacity transaction", async () => {
  const s = scenario();
  assert.equal((await s.save()).ok, true);
  assert.equal(s.calls.length, 1);
  assert.equal(s.calls[0].name, "show_ops_create_partner_link_booking");
  const row = s.calls[0].args.p_booking;
  assert.equal(row.supplier_id, "supplier");
  assert.equal(row.total_cost, 50);
  assert.equal(row.created_by, null);
  assert.equal(row.updated_by, null);
});

test("capacity rejection is shown without a fallback service insert", async () => {
  const s = scenario([{ code: "P0001", message: "SHOW_OPS_SHOW_FULL" }]);
  const result = await s.save();
  assert.equal(result.ok, false);
  assert.match(result.message ?? "", /not enough tickets/);
  assert.equal(s.calls.length, 1);
});

test("missing capacity migration fails closed", async () => {
  const s = scenario([{ code: "PGRST202", message: "RPC unavailable" }]);
  assert.equal((await s.save()).ok, false);
  assert.equal(s.calls.length, 1);
});

test("reference contention retries through the transaction", async () => {
  const s = scenario([{ code: "23505", message: "unique constraint" }, null]);
  assert.equal((await s.save()).ok, true);
  assert.equal(s.calls.length, 2);
});
