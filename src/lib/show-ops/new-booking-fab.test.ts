import assert from "node:assert/strict";
import test from "node:test";

import { showNewBookingFab } from "./nav";

test("new booking + shows on Overview and Operations pages", () => {
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
  ]) {
    assert.equal(showNewBookingFab(p), true, p);
  }
});

test("new booking + hides on the form itself and other groups", () => {
  for (const p of [
    "/dashboard/show-ops/bookings/new",
    "/dashboard/show-ops/chat",
    "/dashboard/show-ops/inbox",
    "/dashboard/show-ops/reports",
    "/dashboard/show-ops/settings",
    "/dashboard",
  ]) {
    assert.equal(showNewBookingFab(p), false, p);
  }
});
