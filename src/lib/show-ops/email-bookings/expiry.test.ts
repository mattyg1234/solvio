import assert from "node:assert/strict";
import { test } from "node:test";

import { daysUntilExpiry, emailExpiryCutoff, EMAIL_KEEP_DAYS } from "./expiry";

const now = new Date("2026-11-18T12:00:00Z");

test("keeps seven days", () => {
  assert.equal(EMAIL_KEEP_DAYS, 7);
  assert.equal(emailExpiryCutoff(now).toISOString(), "2026-11-11T12:00:00.000Z");
});

test("counts the days left", () => {
  assert.equal(daysUntilExpiry("2026-11-18T11:00:00Z", now), 7);
  assert.equal(daysUntilExpiry("2026-11-12T11:00:00Z", now), 1);
  assert.equal(daysUntilExpiry("2026-11-10T12:00:00Z", now), 0);
});
