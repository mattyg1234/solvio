import assert from "node:assert/strict";
import { test } from "node:test";

import { bookedDatesByProduct, groupNightsByMonth, showOpsMonthCells, showOpsRunNights } from "./nights";

test("weekday schedule lists matching nights only, not every calendar day", () => {
  const nights = showOpsRunNights({
    weekdays: [3],
    from: "2026-08-14",
    months: 1,
  });
  assert.ok(nights.length >= 4);
  assert.equal(nights[0], "2026-08-19");
  assert.ok(nights.every((d) => new Date(`${d}T12:00:00Z`).getUTCDay() === 3));
  assert.ok(!nights.includes("2026-08-14"));
});

test("booked dates appear even when the show has no weekday schedule", () => {
  const nights = showOpsRunNights({
    weekdays: null,
    bookedDates: ["2026-08-14", "2026-08-21", "2026-07-01"],
    from: "2026-08-14",
  });
  assert.deepEqual(nights, ["2026-08-14", "2026-08-21"]);
});

test("selected date is kept when editing an off-schedule night", () => {
  const nights = showOpsRunNights({
    weekdays: [1],
    selected: "2026-08-14",
    from: "2026-08-14",
    months: 1,
  });
  assert.ok(nights.includes("2026-08-14"));
});

test("groupNightsByMonth splits a list into month buckets", () => {
  const groups = groupNightsByMonth(["2026-08-14", "2026-08-21", "2026-09-04"]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].dates.length, 2);
  assert.equal(groups[1].dates[0], "2026-09-04");
});

test("August 2026 calendar starts on Saturday with 31 days", () => {
  const cells = showOpsMonthCells(2026, 8);
  assert.equal(cells.filter((c) => c === null).length, 6 + 5);
  assert.equal(cells[6], "2026-08-01");
  assert.equal(cells.findLast((c) => c), "2026-08-31");
});

test("bookedDatesByProduct de-dupes per show", () => {
  const map = bookedDatesByProduct([
    { product_id: "a", show_date: "2026-08-21" },
    { product_id: "a", show_date: "2026-08-14" },
    { product_id: "a", show_date: "2026-08-14" },
    { product_id: "b", show_date: "2026-09-01" },
    { product_id: null, show_date: "2026-08-14" },
  ]);
  assert.deepEqual(map.a, ["2026-08-14", "2026-08-21"]);
  assert.deepEqual(map.b, ["2026-09-01"]);
});
