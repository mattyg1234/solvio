import assert from "node:assert/strict";
import test from "node:test";

import { canaryToday, guestFacingChanges } from "@/lib/show-ops/booking-changes";

const base = {
  guest_name: "Matty Test",
  guest_email: "a@b.com",
  guest_mobile: "+34 604 189 230",
  show_date: "2026-11-23",
  adults: 2,
  children: 0,
  pickup_time: "18:15:00",
  total_cost: 98,
  transport_required: false,
  office_comments: "old",
  dietary_notes: null,
};

test("a note-only save changes nothing the guest sees", () => {
  assert.deepEqual(guestFacingChanges(base, { ...base, office_comments: "new note", dietary_notes: "" }), []);
});

test("same values in other shapes are not changes", () => {
  assert.deepEqual(
    guestFacingChanges(base, { ...base, guest_mobile: "+34604189230", pickup_time: "18:15", total_cost: "98.00", adults: "2", guest_email: "A@B.com" }),
    [],
  );
});

test("guest-facing edits are picked up", () => {
  assert.deepEqual(
    guestFacingChanges(base, { ...base, adults: 3, pickup_time: "18:30", show_date: "2026-11-24", transport_required: true }),
    ["date", "adults", "transport", "pick-up time"],
  );
});

test("canaryToday uses island time", () => {
  assert.equal(canaryToday(new Date("2026-11-09T23:30:00Z")), "2026-11-09");
  assert.equal(canaryToday(new Date("2026-07-09T23:30:00Z")), "2026-07-10");
});
