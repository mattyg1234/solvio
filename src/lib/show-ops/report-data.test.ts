import assert from "node:assert/strict";
import { test } from "node:test";
import { loadReportRows, previousYearDate } from "./report-data";

test("previous-year comparison clamps leap day without shifting normal dates", () => {
  assert.equal(previousYearDate("2024-02-29"), "2023-02-28");
  assert.equal(previousYearDate("2025-02-28"), "2024-02-28");
  assert.equal(previousYearDate("2026-09-05"), "2025-09-05");
  assert.equal(previousYearDate(null), null);
});

test("report reads beyond 10,000 rows even when API cap is below requested page size", async () => {
  const all = Array.from({ length: 10_123 }, (_, id) => ({ id }));
  const offsets: number[] = [];
  const result = await loadReportRows("bookings", async (offset, limit) => {
    offsets.push(offset);
    return { data: all.slice(offset, offset + Math.min(limit, 137)), error: null };
  });
  assert.deepEqual(result.data, all);
  assert.equal(offsets.at(-1), all.length);
});
test("later page failure does not return partial report totals", async () => {
  await assert.rejects(loadReportRows("payments", async (offset) => offset
    ? { data: null, error: new Error("database failure") }
    : { data: [{ id: 1 }], error: null }), /Could not load payments/);
});
test("oversized report fails explicitly; exact limit can finish", async () => {
  const fetch = async (offset: number) => ({ data: offset < 3 ? [offset] : [], error: null });
  await assert.rejects(loadReportRows("bookings", fetch, 2), /shorter report period/);
  assert.deepEqual((await loadReportRows("bookings", fetch, 3)).data, [0, 1, 2]);
});
