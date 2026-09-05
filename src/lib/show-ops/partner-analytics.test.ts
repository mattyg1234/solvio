import assert from "node:assert/strict";
import { test } from "node:test";
import {
  partnerAnalyticsRange,
  summarisePartnerBookings,
  type PartnerAnalyticsBooking,
} from "./partner-analytics";
import { DEFAULT_SHOW_OPS_CONFIG } from "./types";

const range = () => partnerAnalyticsRange("2026-09-01", "2026-09-05");
const row = (
  over: Partial<PartnerAnalyticsBooking> = {},
): PartnerAnalyticsBooking => ({
  id: "one",
  created_at: "2026-09-05T10:00:00Z",
  created_by: "seller-a",
  cancelled_at: null,
  adults: 2,
  children: 1,
  infants: 1,
  total_cost: 120,
  island: "Tenerife",
  ...over,
});
const sellers = new Map([
  ["seller-a", "Alice"],
  ["seller-b", "Bob"],
]);

test("creation range includes local calendar end day and handles invalid dates", () => {
  assert.deepEqual(range(), {
    from: "2026-09-01",
    to: "2026-09-05",
    start: "2026-08-31T23:00:00.000Z",
    end: "2026-09-05T23:00:00.000Z",
  });
  assert.throws(
    () => partnerAnalyticsRange("2026-02-30", "2026-03-05"),
    /valid/,
  );
  assert.throws(
    () => partnerAnalyticsRange("2026-09-06", "2026-09-05"),
    /before/,
  );
  const winter = partnerAnalyticsRange("2026-01-01", "2026-01-01");
  assert.equal(winter.start, "2026-01-01T00:00:00.000Z");
});

test("counts noncancelled bookings and every passenger, separates currencies and unknown creators", () => {
  const result = summarisePartnerBookings(
    [
      row(),
      row({
        id: "two",
        created_by: "seller-b",
        total_cost: 99.99,
        island: "UK London",
      }),
      row({ id: "three", created_by: null, total_cost: 10 }),
      row({ id: "four", created_by: "unknown-office", total_cost: 20 }),
      row({ id: "cancelled", cancelled_at: "2026-09-05T11:00:00Z" }),
      row({ id: "before", created_at: "2026-08-31T22:59:59Z" }),
      row({ id: "end", created_at: "2026-09-05T23:00:00Z" }),
      row({ id: "start", created_at: range().start, total_cost: 0 }),
    ],
    range(),
    DEFAULT_SHOW_OPS_CONFIG,
    sellers,
  );
  assert.equal(result.bookings, 5);
  assert.equal(result.passengers, 20);
  assert.deepEqual(result.sales, { eur: 150, gbp: 99.99 });
  assert.equal(
    result.sellers.find((s) => s.userId === "seller-a")?.bookings,
    2,
  );
  assert.equal(result.unattributed.bookings, 2);
});

test("island overrides, missing money, invalid creation records and more than 1000 bookings stay accurate", () => {
  const rows = Array.from({ length: 1001 }, (_, i) =>
    row({ id: String(i), total_cost: 0.1 }),
  );
  rows.push(
    row({
      id: "missing",
      total_cost: null,
      adults: null,
      children: null,
      infants: null,
    }),
  );
  rows.push(row({ id: "invalid", created_at: "bad" }));
  const result = summarisePartnerBookings(
    rows,
    range(),
    { ...DEFAULT_SHOW_OPS_CONFIG, island_currencies: { Tenerife: "usd" } },
    sellers,
  );
  assert.equal(result.bookings, 1002);
  assert.equal(result.passengers, 4004);
  assert.deepEqual(result.sales, { usd: 100.1 });
  assert.equal(result.missingValueBookings, 1);
});

test("fetches every results page and propagates failures instead of reporting partial totals", async () => {
  const { collectPartnerPages } = await import("./partner-analytics");
  const source = Array.from({ length: 1001 }, (_, id) => ({ id }));
  const offsets: number[] = [];
  const all = await collectPartnerPages(async (offset, limit) => {
    offsets.push(offset);
    return source.slice(offset, offset + limit);
  });
  assert.equal(all.length, 1001);
  assert.deepEqual(offsets, [0, 500, 1000]);
  await assert.rejects(
    collectPartnerPages(async (offset, limit) => {
      if (offset) throw new Error("Connection failed");
      return source.slice(offset, offset + limit);
    }),
    /Connection failed/,
  );
});
