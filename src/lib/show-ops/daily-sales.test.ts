import assert from "node:assert/strict";
import { test } from "node:test";

import { dailySalesCsv, localDayUtcRange, localHourBucket, summariseDailySales, type DailySalesRow } from "./daily-sales";

function row(over: Partial<DailySalesRow>): DailySalesRow {
  return {
    booking_ref: "SO-1",
    guest_name: "Ada",
    show_name: "MHT ACE",
    island: "Lanzarote",
    show_date: "2026-09-10",
    hotel_name: "Hotel A",
    supplier_name: null,
    sales_channel: "direct",
    adults: 2,
    children: 1,
    infants: 0,
    total_cost: 150,
    billing_mode: "deposit",
    created_at: "2026-09-04T09:15:00Z",
    ...over,
  };
}

test("local day window follows Canaries clock (BST-style summer offset)", () => {
  // 4 Sept: Atlantic/Canary is UTC+1, so local midnight is 23:00Z the night before.
  const w = localDayUtcRange("2026-09-04", "Atlantic/Canary");
  assert.equal(w.start, "2026-09-03T23:00:00.000Z");
  assert.equal(w.end, "2026-09-04T23:00:00.000Z");
  // January: UTC+0.
  const jan = localDayUtcRange("2026-01-10", "Atlantic/Canary");
  assert.equal(jan.start, "2026-01-10T00:00:00.000Z");
});

test("hour buckets are office-local", () => {
  assert.equal(localHourBucket("2026-09-04T09:15:00Z", "Atlantic/Canary"), "10:00");
  assert.equal(localHourBucket(null), "unknown");
});

test("summary counts bookings by island, channel and hour", () => {
  const { summary } = summariseDailySales(
    "2026-09-04",
    [
      row({}),
      row({ booking_ref: "SO-2", island: "Tenerife", sales_channel: "tour_op", created_at: "2026-09-04T09:40:00Z", total_cost: 50.5 }),
      row({ booking_ref: "SO-3", created_at: "2026-09-04T18:05:00Z", adults: 1, children: 0 }),
    ],
    "Atlantic/Canary",
  );
  assert.equal(summary.totalBookings, 3);
  assert.equal(summary.totalPax, 7);
  assert.equal(summary.totalValue, 350.5);
  assert.deepEqual(summary.byIsland, [["Lanzarote", 2], ["Tenerife", 1]]);
  assert.deepEqual(summary.byChannel, [["direct", 2], ["tour_op", 1]]);
  assert.deepEqual(summary.byHour, [["10:00", 2], ["19:00", 1]]);
});

test("csv has a summary section then one line per booking, quoting commas", () => {
  const csv = dailySalesCsv(summariseDailySales("2026-09-04", [row({ guest_name: "Smith, John" })]));
  const lines = csv.split("\n");
  assert.equal(lines[0], "section,key,value");
  assert.ok(lines.includes("summary,total_bookings,1"));
  assert.ok(lines.includes("by_island,Lanzarote,1"));
  assert.ok(lines.some((l) => l.startsWith("booking_ref,guest_name,")));
  assert.ok(lines[lines.length - 1].includes('"Smith, John"'));
});
