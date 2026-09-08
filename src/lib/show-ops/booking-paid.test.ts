import assert from "node:assert/strict";
import { test } from "node:test";

import { effectivePaid, paidOnBooking, recordedPaid, sumBookingLedger } from "./booking-paid";

import type { SupabaseClient } from "@supabase/supabase-js";

const fakeClient = (rows: Array<{ amount: number }> | null, error: { message: string } | null = null) =>
  ({ from: () => ({ select: () => ({ eq: async () => ({ data: rows, error }) }) }) }) as unknown as SupabaseClient;

test("imported booking with no ledger keeps its recorded paid amount", () => {
  const b = { total_cost: 100, balance_remaining: 30 };
  assert.equal(recordedPaid(b), 70);
  assert.equal(effectivePaid(b, 0), 70, "empty ledger must not zero a recorded payment");
});

test("ledger wins once it has rows", () => {
  const b = { total_cost: 100, balance_remaining: 30 };
  assert.equal(effectivePaid(b, 70), 70);
  assert.equal(effectivePaid(b, 100), 100, "a later full payment in the ledger is the truth");
});

test("unpaid bookings and odd values stay at zero", () => {
  assert.equal(effectivePaid({ total_cost: 100, balance_remaining: 100 }, 0), 0);
  assert.equal(effectivePaid({ total_cost: null, balance_remaining: null }, 0), 0);
  assert.equal(effectivePaid({ total_cost: 100, balance_remaining: 120 }, 0), 0, "balance above total is not a payment");
  assert.equal(recordedPaid({ total_cost: 100, balance_remaining: -5 }, ), 105, "overpaid import keeps its credit");
});

test("ledger read failure throws instead of returning zero", async () => {
  await assert.rejects(() => sumBookingLedger(fakeClient(null, { message: "timeout" }), "b1"), /Could not read payments/);
  assert.equal(await sumBookingLedger(fakeClient([{ amount: 20 }, { amount: 30.5 }]), "b1"), 50.5);
  assert.equal(await sumBookingLedger(fakeClient([]), "b1"), 0);
});

test("paidOnBooking combines ledger and opening basis", async () => {
  const imported = { id: "b1", total_cost: 100, balance_remaining: 30 };
  assert.equal(await paidOnBooking(fakeClient([]), imported), 70);
  assert.equal(await paidOnBooking(fakeClient([{ amount: 70 }, { amount: 30 }]), imported), 100);
});
