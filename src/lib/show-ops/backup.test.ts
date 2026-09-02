import assert from "node:assert/strict";
import { test } from "node:test";

import { backupObjectPath, buildShowOpsBackup, fetchAllRows, snapshotTimestamp, snapshotsToPrune } from "./backup";

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
  assert.equal(a, "biz/2026-08-28T10-00-00-000Z.json.gz");
  assert.ok(a < b);
});

test("a snapshot name round-trips to its timestamp, old .json names included", () => {
  assert.equal(snapshotTimestamp("biz/2026-09-02T12-20-47-704Z.json.gz"), "2026-09-02T12:20:47.704Z");
  assert.equal(snapshotTimestamp("2026-09-02T12-20-47-704Z.json"), "2026-09-02T12:20:47.704Z");
  assert.equal(snapshotTimestamp("notes.txt"), null);
});

function everyFiveMinutes(from: Date, to: Date): string[] {
  const out: string[] = [];
  for (let t = from.getTime(); t <= to.getTime(); t += 5 * 60_000) {
    out.push(backupObjectPath("biz", new Date(t).toISOString()));
  }
  return out;
}

test("retention keeps the last hour whole, one per hour for a day, one per day for a month", () => {
  const now = new Date("2026-09-02T12:20:00.000Z");
  const names = everyFiveMinutes(new Date("2026-08-28T00:00:00.000Z"), now);
  assert.equal(names.length, 1589);
  const prune = new Set(snapshotsToPrune(names, now));
  const kept = names.filter((n) => !prune.has(n));

  // Last hour: 13 files (12:20 back to 11:20 inclusive).
  const lastHour = names.filter((n) => Date.parse(snapshotTimestamp(n)!) >= now.getTime() - 3_600_000);
  assert.equal(lastHour.length, 13);
  for (const n of lastHour) assert.ok(kept.includes(n), `${n} should be kept`);

  // Newest of the run is always kept.
  assert.ok(kept.includes(names[names.length - 1]));

  // Older than a day but inside a month: exactly one per calendar day.
  const perDay = new Map<string, number>();
  for (const n of kept) {
    const iso = snapshotTimestamp(n)!;
    if (now.getTime() - Date.parse(iso) > 24 * 3_600_000) perDay.set(iso.slice(0, 10), (perDay.get(iso.slice(0, 10)) ?? 0) + 1);
  }
  for (const [day, count] of perDay) assert.equal(count, 1, `${day} kept ${count}`);

  // Six days of five-minute copies collapse to under seventy files.
  assert.ok(kept.length < 70, `kept ${kept.length}`);
  assert.equal(kept.length + prune.size, names.length);
});

test("nothing is pruned when everything is within the last hour", () => {
  const now = new Date("2026-09-02T12:20:00.000Z");
  const names = everyFiveMinutes(new Date("2026-09-02T11:30:00.000Z"), now);
  assert.deepEqual(snapshotsToPrune(names, now), []);
});
