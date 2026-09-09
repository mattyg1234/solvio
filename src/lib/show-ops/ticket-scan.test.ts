import assert from "node:assert/strict";
import { test } from "node:test";

import { scanArrivalPlan, ticketIsForTonight } from "./ticket-scan";

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
