import assert from "node:assert/strict";
import { test } from "node:test";

import { diffBookingFields, formatBookingChanges, formatBookingHistoryWhen } from "./booking-history";

test("only whitelisted fields that actually moved are recorded", () => {
  const before = { hotel_name: "Sol Puerto", adults: 2, children: 0, updated_at: "a", office_comments: null };
  const after = { hotel_name: "Riu Paraiso", adults: 3, children: 0, updated_at: "b", office_comments: "" };
  assert.deepEqual(diffBookingFields(before, after, ["hotel_name", "adults", "children", "office_comments"]), {
    hotel_name: { from: "Sol Puerto", to: "Riu Paraiso" },
    adults: { from: 2, to: 3 },
  });
});

test("numeric strings from Postgres compare as numbers; times compare to the minute", () => {
  const before = { total_cost: "120.00", pickup_time: "18:30:00", deposit_amount: "24" };
  const after = { total_cost: 120, pickup_time: "18:30", deposit_amount: 24.004 };
  assert.deepEqual(diffBookingFields(before, after, ["total_cost", "pickup_time", "deposit_amount"]), {});
  assert.deepEqual(diffBookingFields(before, { ...after, total_cost: 150 }, ["total_cost"]), {
    total_cost: { from: "120.00", to: 150 },
  });
});

test("a column the old row never had diffs from null", () => {
  assert.deepEqual(diffBookingFields({}, { payment_method: "cash" }, ["payment_method"]), {
    payment_method: { from: null, to: "cash" },
  });
  assert.deepEqual(diffBookingFields(undefined, { payment_method: null }, ["payment_method"]), {});
});

test("prints the office line, hiding id churn behind the name that moved", () => {
  const line = formatBookingChanges({
    hotel_name: { from: "Sol Puerto", to: "Riu Paraiso" },
    adults: { from: 2, to: 3 },
    supplier_id: { from: "u1", to: "u2" },
    supplier_name: { from: "TUI", to: "Jet2" },
    transport_required: { from: true, to: false },
    office_comments: { from: null, to: "window seat" },
  });
  assert.equal(
    line,
    "Hotel: Sol Puerto → Riu Paraiso; Adults: 2 → 3; Partner: TUI → Jet2; Bus: yes → no; Comments: — → window seat",
  );
  assert.equal(formatBookingChanges({ cancelled: { from: null, to: "Guest cancelled" } }), "Cancelled: Guest cancelled");
  assert.equal(formatBookingChanges(null), "");
});

test("history timestamps read as day month and Canary clock", () => {
  assert.equal(formatBookingHistoryWhen("2026-09-04T20:14:00Z"), "4 Sep 21:14");
  assert.equal(formatBookingHistoryWhen("2026-01-15T00:05:00Z"), "15 Jan 00:05");
  assert.equal(formatBookingHistoryWhen("not a date"), "not a date");
});
