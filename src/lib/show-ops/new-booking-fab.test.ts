import assert from "node:assert/strict";
import test from "node:test";

import { showNewBookingFab } from "./nav";

test("new booking + shows on every Show Ops page", () => {
  for (const p of [
    "/dashboard/show-ops",
    "/dashboard/show-ops/calendar",
    "/dashboard/show-ops/outlook",
    "/dashboard/show-ops/master",
    "/dashboard/show-ops/bookings",
    "/dashboard/show-ops/bookings/abc-123",
    "/dashboard/show-ops/email-bookings",
    "/dashboard/show-ops/door",
    "/dashboard/show-ops/lists",
    "/dashboard/show-ops/invoices",
    "/dashboard/show-ops/buses",
    "/dashboard/show-ops/reports",
    "/dashboard/show-ops/settings",
    "/dashboard/show-ops/payments",
  ]) {
    assert.equal(showNewBookingFab(p), true, p);
  }
});

test("new booking + hides on the form, setup and message screens", () => {
  for (const p of [
    "/dashboard/show-ops/bookings/new",
    "/dashboard/show-ops/chat",
    "/dashboard/show-ops/inbox",
    "/dashboard/show-ops/setup",
    "/dashboard",
    "/dashboard/show-opsx",
  ]) {
    assert.equal(showNewBookingFab(p), false, p);
  }
});
