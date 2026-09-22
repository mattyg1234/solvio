import assert from "node:assert/strict";
import { test } from "node:test";

import { scanArrivalPlanWithCount, scanArrivalPlan, ticketIsForTonight } from "./ticket-scan";

test("a ticket is for tonight in the operator's local zone, not UTC", () => {
  // 23:30 UTC on 12 Sept is already 00:30 on the 13th in the Canaries and in London (both UTC+1 in summer).
  const late = new Date("2026-09-12T23:30:00Z");
  assert.equal(ticketIsForTonight("2026-09-13", late), true);
  assert.equal(ticketIsForTonight("2026-09-12", late), false, "UTC date must not be used");
  const midday = new Date("2026-09-12T12:00:00Z");
  assert.equal(ticketIsForTonight("2026-09-12", midday), true);
  assert.equal(ticketIsForTonight("2026-09-13", midday), false);
  assert.equal(ticketIsForTonight("", midday), false);
});

test("scan plan: first scan admits the party, a second scan completes a partial party, a full party is already in", () => {
  assert.deepEqual(scanArrivalPlan({ booked: 8, arrivedAt: null, arrivedPax: null }), { kind: "first", arrivedPax: 8 });
  assert.deepEqual(scanArrivalPlan({ booked: 8, arrivedAt: "2026-09-12T19:00:00Z", arrivedPax: 6 }), { kind: "complete_party", arrivedPax: 8, remaining: 2 });
  assert.deepEqual(scanArrivalPlan({ booked: 8, arrivedAt: "2026-09-12T19:00:00Z", arrivedPax: 8 }), { kind: "already_in" });
  assert.deepEqual(scanArrivalPlan({ booked: 3, arrivedAt: "2026-09-12T19:00:00Z", arrivedPax: null }), { kind: "already_in" }, "no count recorded means the whole party came in");
});

test("scan then choose how many turned up: the chosen number is the total in", () => {
  // 4 booked, nobody in yet, door says 3 turned up.
  assert.deepEqual(scanArrivalPlanWithCount({ booked: 4, arrivedAt: null, arrivedPax: null }, 3), { kind: "first", arrivedPax: 3 });
  // Later the 4th arrives and the door scans again choosing 4.
  assert.deepEqual(scanArrivalPlanWithCount({ booked: 4, arrivedAt: "t", arrivedPax: 3 }, 4), { kind: "complete_party", arrivedPax: 4, remaining: 1 });
  // Choosing the same or fewer than already in changes nothing.
  assert.deepEqual(scanArrivalPlanWithCount({ booked: 4, arrivedAt: "t", arrivedPax: 3 }, 3), { kind: "already_in" });
  // Out of range is refused, never written.
  assert.equal(scanArrivalPlanWithCount({ booked: 4, arrivedAt: null, arrivedPax: null }, 0).kind, "invalid");
  assert.equal(scanArrivalPlanWithCount({ booked: 4, arrivedAt: null, arrivedPax: null }, 5).kind, "invalid");
  // No choice = the old whole-party behaviour.
  assert.deepEqual(scanArrivalPlanWithCount({ booked: 4, arrivedAt: null, arrivedPax: null }, null), { kind: "first", arrivedPax: 4 });
});
