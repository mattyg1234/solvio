import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { paidOnBooking, sumBookingLedger } from "./booking-paid";

const client = (rows: Array<{ amount: number | string; method: string }>) =>
  ({ from: () => ({ select: () => ({ eq: async () => ({ data: rows, error: null }) }) }) }) as unknown as SupabaseClient;

test("an imported opening receipt remains included after a new partial payment", async () => {
  const booking = { id: "b", legacy_id: "old", total_cost: 100, balance_remaining: 30 };
  assert.equal(await paidOnBooking(client([{ amount: 70, method: "import" }, { amount: 10, method: "cash" }]), booking), 80);
});

test("legacy receipts without a reconciled opening entry fail closed", async () => {
  const booking = { id: "b", legacy_id: "old", total_cost: 100, balance_remaining: 30 };
  await assert.rejects(() => paidOnBooking(client([{ amount: 10, method: "cash" }]), booking), /opening balance.*reconcil/i);
});

test("a reconciled zero opening entry is valid", async () => {
  const booking = { id: "b", legacy_id: "old", total_cost: 100, balance_remaining: 100 };
  assert.equal(await paidOnBooking(client([{ amount: 0, method: "import" }, { amount: 10, method: "cash" }]), booking), 10);
});

test("invalid ledger amounts cannot silently become zero", async () => {
  await assert.rejects(() => sumBookingLedger(client([{ amount: "bad", method: "cash" }]), "b"), /invalid payment amount/i);
});
