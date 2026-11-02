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
  assert.equal(formatBookingHistoryWhen("2026-09-04T20:14:00Z"), "4 Sep 2026 21:14:00 · Canary time");
  assert.equal(formatBookingHistoryWhen("2026-01-15T00:05:00Z"), "15 Jan 2026 00:05:00 · Canary time");
  assert.equal(formatBookingHistoryWhen("not a date"), "not a date");
});


test("lists print as names, never raw JSON", () => {
  const line = formatBookingChanges({ extras_snapshot: { from: [], to: [{ name: "Meal", quantity: 2, nett_total: 18 }] } });
  assert.equal(line, "");
  assert.equal(
    formatBookingChanges({ extras: { from: [], to: [{ name: "Meal", quantity: 2 }, { name: "Photo" }] } }),
    "Extras: none → Meal ×2, Photo",
  );
  assert.ok(!formatBookingChanges({ custom: { from: null, to: { a: 1 } } }).includes("{"));
});

test("new bookings print a short summary instead of every column", () => {
  const line = formatBookingChanges({
    created: { from: null, to: "MHT-1014" },
    id: { from: null, to: "255053fb-3638-4d7b-8e53-85dd356b2e02" },
    hotel_id: { from: null, to: "17a3a6e6" },
    guest_name: { from: null, to: "JOEL TEST" },
    show_name: { from: null, to: "1 MHT ACE" },
    show_date: { from: null, to: "2026-11-03" },
    adults: { from: null, to: 3 },
    children: { from: null, to: 0 },
    infants: { from: null, to: 0 },
    pickup_stop_name: { from: null, to: "Playa Blanca · Hotel Costa Calero" },
    pickup_time: { from: null, to: "18:40:00" },
    supplier_name: { from: null, to: "ACE Web Booking" },
    total_cost: { from: null, to: 177 },
    pricing_snapshot: { from: null, to: { v: 1, adult_price: 59 } },
    seller: { from: null, to: null },
  });
  assert.equal(
    line,
    "Booking created: MHT-1014 · JOEL TEST · 1 MHT ACE on 3 Nov 2026 · 3 adults · Pick-up Playa Blanca · Hotel Costa Calero 18:40 · ACE Web Booking · Total 177",
  );
});

test("edits hide empty fields, ids, account ids and timestamps", () => {
  const line = formatBookingChanges({
    hotel_id: { from: "a", to: "b" },
    hotel_name: { from: "Sol", to: "Riu" },
    cancelled_by: { from: null, to: "4fe55afc" },
    cancelled_at: { from: null, to: "2026-11-02T15:36:21Z" },
    seller: { from: null, to: "" },
    no_show_proof_path: { from: null, to: "biz/x.jpg" },
    legacy_status: { from: "A", to: "B" },
  });
  assert.equal(line, "Hotel: Sol → Riu; Ticket photo: added");
});

test("history dates include the year across the Canary new-year boundary", () => {
  assert.equal(formatBookingHistoryWhen("2027-01-01T00:00:01Z"), "1 Jan 2027 00:00:01 · Canary time");
});
