import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveReportRange, startOfUtcWeek } from "./report-range";

test("this week is Monday–Sunday around a Friday", () => {
  const r = resolveReportRange({ period: "this_week", today: "2026-08-14" });
  assert.equal(startOfUtcWeek("2026-08-14"), "2026-08-10");
  assert.equal(r.start, "2026-08-10");
  assert.equal(r.end, "2026-08-16");
  assert.equal(r.prevStart, "2026-08-03");
  assert.equal(r.prevEnd, "2026-08-09");
});

test("today vs yesterday", () => {
  const r = resolveReportRange({ period: "today", today: "2026-08-14" });
  assert.equal(r.start, "2026-08-14");
  assert.equal(r.end, "2026-08-14");
  assert.equal(r.prevStart, "2026-08-13");
});

test("last month from August is July", () => {
  const r = resolveReportRange({ period: "last_month", today: "2026-08-14" });
  assert.equal(r.start, "2026-07-01");
  assert.equal(r.end, "2026-07-31");
  assert.equal(r.prevStart, "2026-06-01");
  assert.equal(r.prevEnd, "2026-06-30");
});

test("custom range swaps inverted dates and previous window matches length", () => {
  const r = resolveReportRange({ period: "custom", from: "2026-08-10", to: "2026-08-01", today: "2026-08-14" });
  assert.equal(r.start, "2026-08-01");
  assert.equal(r.end, "2026-08-10");
  assert.equal(r.prevStart, "2026-07-22");
  assert.equal(r.prevEnd, "2026-07-31");
});

test("all time has no bounds", () => {
  const r = resolveReportRange({ period: "all", today: "2026-08-14" });
  assert.equal(r.start, null);
  assert.equal(r.end, null);
});

test("legacy month param still works", () => {
  const r = resolveReportRange({ month: "2026-03", today: "2026-08-14" });
  assert.equal(r.period, "month");
  assert.equal(r.start, "2026-03-01");
  assert.equal(r.end, "2026-03-31");
});
