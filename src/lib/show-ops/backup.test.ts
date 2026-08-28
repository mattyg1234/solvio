import assert from "node:assert/strict";
import { test } from "node:test";

import { backupObjectPath, buildShowOpsBackup, fetchAllRows } from "./backup";

/** Stand-in PostgREST that hands back at most 1000 rows per range, like the real one. */
function fakeSupabase(rowsByTable: Record<string, Record<string, unknown>[]>) {
  return {
    from(table: string) {
      const rows = rowsByTable[table] ?? [];
      const q = {
        select: () => q,
        eq: () => q,
        order: () => q,
        range: (from: number, to: number) =>
          Promise.resolve({ data: rows.slice(from, to + 1), error: null }),
      };
      return q;
    },
  } as never;
}

const many = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i }));

test("a table larger than one page is read whole, not truncated at 1000", async () => {
  const rows = await fetchAllRows(fakeSupabase({ show_bookings: many(8556) }), "show_bookings", "biz");
  assert.equal(rows.length, 8556);
});

test("an exactly-full page does not stop the read early", async () => {
  const rows = await fetchAllRows(fakeSupabase({ show_bookings: many(2000) }), "show_bookings", "biz");
  assert.equal(rows.length, 2000);
});

test("the backup carries a row count per table so a short file is obvious", async () => {
  const backup = await buildShowOpsBackup(
    fakeSupabase({ show_bookings: many(1500), show_suppliers: many(3) }),
    { id: "biz", name: "MHT" },
    "2026-08-28T10:00:00.000Z",
  );
  assert.equal(backup.counts.show_bookings, 1500);
  assert.equal(backup.counts.show_suppliers, 3);
  assert.equal(backup.counts.show_hotels, 0);
  assert.equal(backup.tables.show_bookings.length, 1500);
});

test("snapshot paths sort chronologically inside the tenant folder", () => {
  const a = backupObjectPath("biz", "2026-08-28T10:00:00.000Z");
  const b = backupObjectPath("biz", "2026-08-28T10:05:00.000Z");
  assert.equal(a, "biz/2026-08-28T10-00-00-000Z.json");
  assert.ok(a < b);
});
