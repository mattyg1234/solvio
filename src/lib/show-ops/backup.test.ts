import assert from "node:assert/strict";
import { test } from "node:test";

import {
  SHOW_OPS_BACKUP_BUCKET,
  SHOW_OPS_BACKUP_TABLES,
  backupObjectPath,
  backupOrderColumns,
  buildShowOpsBackup,
  fetchAllRows,
  isMissingTableError,
  listBucketObjects,
  logoObjectPaths,
  mirrorObjectPath,
  mirrorShowOpsFiles,
  needsMirror,
  snapshotTimestamp,
  snapshotsToPrune,
  type ShowOpsBackupFile,
} from "./backup";

type FakeObject = { name: string; id?: string | null; updated_at?: string | null; metadata?: { size?: number } | null };

type FakeOptions = {
  /** PostgREST error to return for a table instead of rows. */
  errors?: Record<string, { code?: string; message: string }>;
  /** Storage listing: bucket -> folder -> entries (folders have id null and no metadata). */
  storage?: Record<string, Record<string, FakeObject[]>>;
  /** Record of every order() call per table. */
  orders?: Record<string, string[]>;
  /** Copy/upload/download log and injected copy failure. */
  copies?: string[];
  uploads?: string[];
  copyFails?: boolean;
};

/** Stand-in PostgREST + Storage that hands back at most 1000 rows per range, like the real one. */
function fakeSupabase(rowsByTable: Record<string, Record<string, unknown>[]>, opts: FakeOptions = {}) {
  return {
    from(table: string) {
      const rows = rowsByTable[table] ?? [];
      const q = {
        select: () => q,
        eq: () => q,
        order: (column: string) => {
          if (opts.orders) (opts.orders[table] ??= []).push(column);
          return q;
        },
        range: (from: number, to: number) =>
          Promise.resolve(
            opts.errors?.[table] ? { data: null, error: opts.errors[table] } : { data: rows.slice(from, to + 1), error: null },
          ),
      };
      return q;
    },
    storage: {
      from(bucket: string) {
        return {
          list: (folder: string, o: { limit: number; offset?: number; search?: string }) => {
            let entries = opts.storage?.[bucket]?.[folder] ?? [];
            if (o.search) entries = entries.filter((e) => e.name.includes(o.search!));
            const offset = o.offset ?? 0;
            return Promise.resolve({ data: entries.slice(offset, offset + o.limit), error: null });
          },
          copy: (from: string, to: string, o: { destinationBucket: string }) => {
            if (opts.copyFails) return Promise.resolve({ error: { message: "cross-bucket copy not supported" } });
            opts.copies?.push(`${bucket}/${from} -> ${o.destinationBucket}/${to}`);
            return Promise.resolve({ error: null });
          },
          download: (path: string) => Promise.resolve({ data: new Blob([`bytes of ${path}`]), error: null }),
          upload: (path: string) => {
            opts.uploads?.push(`${bucket}/${path}`);
            return Promise.resolve({ error: null });
          },
        };
      },
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
  assert.equal(backup.format, 3);
  assert.deepEqual(backup.errors, {});
  assert.deepEqual(backup.files, []);
});

const EVERY_PROD_TABLE = [
  "show_booking_history",
  "show_booking_payments",
  "show_bookings",
  "show_bus_night_orders",
  "show_bus_orders",
  "show_bus_stops",
  "show_channel_availability_pushes",
  "show_channel_products",
  "show_expenses",
  "show_extras",
  "show_hotels",
  "show_hotels_directory",
  "show_invoice_external_events",
  "show_invoice_lines",
  "show_invoices",
  "show_night_closes",
  "show_ops_integrations",
  "show_ops_members",
  "show_pickup_timetables",
  "show_products",
  "show_rate_prices",
  "show_seat_holds",
  "show_supplier_rates",
  "show_suppliers",
  "show_ticket_types",
];

test("the table list covers every business-scoped Show Ops table in production", () => {
  assert.deepEqual([...SHOW_OPS_BACKUP_TABLES].sort(), EVERY_PROD_TABLE);
  assert.equal(new Set(SHOW_OPS_BACKUP_TABLES).size, SHOW_OPS_BACKUP_TABLES.length);
});

test("tables page by id, except the availability-push table which has no id column", () => {
  assert.deepEqual(backupOrderColumns("show_bookings"), ["id"]);
  assert.deepEqual(backupOrderColumns("show_channel_availability_pushes"), ["channel", "external_product_id", "show_date"]);
});

test("fetchAllRows orders the no-id table by its composite key so paging is stable", async () => {
  const orders: Record<string, string[]> = {};
  await fetchAllRows(fakeSupabase({ show_channel_availability_pushes: many(3) }, { orders }), "show_channel_availability_pushes", "biz");
  await fetchAllRows(fakeSupabase({ show_bookings: many(3) }, { orders }), "show_bookings", "biz");
  assert.deepEqual(orders.show_channel_availability_pushes, ["channel", "external_product_id", "show_date"]);
  assert.deepEqual(orders.show_bookings, ["id"]);
});

test("a table this database has not got is recorded under errors, not fatal", async () => {
  const backup = await buildShowOpsBackup(
    fakeSupabase(
      { show_bookings: many(4) },
      {
        errors: {
          show_seat_holds: { code: "42P01", message: 'relation "public.show_seat_holds" does not exist' },
          show_extras: { code: "PGRST205", message: "Could not find the table 'public.show_extras' in the schema cache" },
        },
      },
    ),
    { id: "biz", name: "MHT" },
    "2026-09-11T10:00:00.000Z",
  );
  assert.equal(backup.counts.show_bookings, 4);
  assert.equal("show_seat_holds" in backup.tables, false);
  assert.equal("show_seat_holds" in backup.counts, false);
  assert.match(backup.errors.show_seat_holds, /does not exist/);
  assert.match(backup.errors.show_extras, /Could not find the table/);
  assert.equal(Object.keys(backup.errors).length, 2);
});

test("any other table error still aborts the backup", async () => {
  await assert.rejects(
    buildShowOpsBackup(
      fakeSupabase({}, { errors: { show_bookings: { code: "42501", message: "permission denied for table show_bookings" } } }),
      { id: "biz" },
    ),
    /show_bookings: permission denied/,
  );
});

test("isMissingTableError recognises Postgres and PostgREST codes and messages", () => {
  assert.equal(isMissingTableError({ code: "42P01", message: "x" }), true);
  assert.equal(isMissingTableError({ code: "PGRST205", message: "x" }), true);
  assert.equal(isMissingTableError({ code: null, message: 'relation "show_x" does not exist' }), true);
  assert.equal(isMissingTableError({ code: "42501", message: "permission denied" }), false);
  assert.equal(isMissingTableError(null), false);
});

const file = (name: string, size: number, updated_at = "2026-09-10T08:00:00.000Z"): FakeObject => ({ name, id: `id-${name}`, updated_at, metadata: { size } });
const folder = (name: string): FakeObject => ({ name, id: null, metadata: null });

test("the storage manifest walks every sub-folder of the proofs bucket and finds the logo from the business row", async () => {
  const supabase = fakeSupabase(
    {},
    {
      storage: {
        "show-ops-proofs": {
          biz: [folder("expenses"), folder("tickets"), file("proof-1.jpg", 100)],
          "biz/expenses": [file("e1.pdf", 200), file("e2.pdf", 300)],
          "biz/tickets": [folder("deep"), file("t1.jpg", 400)],
          "biz/tickets/deep": [file("t2.jpg", 500)],
        },
        "business-logos": {
          biz: [file("logo-abc.png", 999), file("logo-old.png", 1)],
        },
      },
    },
  );
  const backup = await buildShowOpsBackup(
    supabase,
    { id: "biz", logo_url: "https://x.supabase.co/storage/v1/object/public/business-logos/biz/logo-abc.png" },
    "2026-09-11T10:00:00.000Z",
  );
  assert.deepEqual(
    backup.files.map((f) => `${f.bucket}/${f.path}`).sort(),
    [
      "business-logos/biz/logo-abc.png",
      "show-ops-proofs/biz/expenses/e1.pdf",
      "show-ops-proofs/biz/expenses/e2.pdf",
      "show-ops-proofs/biz/proof-1.jpg",
      "show-ops-proofs/biz/tickets/deep/t2.jpg",
      "show-ops-proofs/biz/tickets/t1.jpg",
    ],
  );
  const logo = backup.files.find((f) => f.bucket === "business-logos")!;
  assert.equal(logo.size, 999);
  assert.equal(logo.updated_at, "2026-09-10T08:00:00.000Z");
  assert.deepEqual(backup.errors, {});
});

test("storage listing pages with limit/offset", async () => {
  const entries = Array.from({ length: 2500 }, (_, i) => file(`f${String(i).padStart(4, "0")}.jpg`, i));
  const supabase = fakeSupabase({}, { storage: { "show-ops-proofs": { biz: entries } } });
  const files = await listBucketObjects(supabase, "show-ops-proofs", "biz");
  assert.equal(files.length, 2500);
  assert.equal(files[0].path, "biz/f0000.jpg");
});

test("logo paths come from logo_url and show_ops_logo_url; external URLs are ignored", () => {
  assert.deepEqual(
    logoObjectPaths({
      logo_url: "https://x.supabase.co/storage/v1/object/public/business-logos/biz/logo-a.png",
      show_ops_logo_url: "https://x.supabase.co/storage/v1/object/public/business-logos/biz/logo-b.jpg?v=2",
    }),
    ["biz/logo-a.png", "biz/logo-b.jpg"],
  );
  assert.deepEqual(logoObjectPaths({ logo_url: "https://cdn.example.com/logo.png", show_ops_logo_url: null }), []);
  assert.deepEqual(
    logoObjectPaths({ logo_url: "https://x.supabase.co/storage/v1/object/public/business-logos/biz/same.png", show_ops_logo_url: "https://x.supabase.co/storage/v1/object/public/business-logos/biz/same.png" }),
    ["biz/same.png"],
  );
});

test("mirroring copies new or changed objects into <biz>/files/<bucket>/<path> and skips current ones", async () => {
  const copies: string[] = [];
  const supabase = fakeSupabase({}, { copies });
  const files: ShowOpsBackupFile[] = [
    { bucket: "show-ops-proofs", path: "biz/expenses/e1.pdf", size: 200, updated_at: "2026-09-10T08:00:00.000Z" },
    { bucket: "show-ops-proofs", path: "biz/expenses/e2.pdf", size: 300, updated_at: "2026-09-10T08:00:00.000Z" },
    { bucket: "business-logos", path: "biz/logo-abc.png", size: 999, updated_at: "2026-09-10T08:00:00.000Z" },
  ];
  const existing: ShowOpsBackupFile[] = [
    // e1 already mirrored at same size, copied after its last change -> skip.
    { bucket: SHOW_OPS_BACKUP_BUCKET, path: "biz/files/show-ops-proofs/biz/expenses/e1.pdf", size: 200, updated_at: "2026-09-10T09:00:00.000Z" },
    // e2 mirrored but a different size -> copy again.
    { bucket: SHOW_OPS_BACKUP_BUCKET, path: "biz/files/show-ops-proofs/biz/expenses/e2.pdf", size: 5, updated_at: "2026-09-10T09:00:00.000Z" },
  ];
  const result = await mirrorShowOpsFiles(supabase, "biz", files, existing);
  assert.equal(result.mirrored, 2);
  assert.equal(result.skipped, 1);
  assert.deepEqual(result.errors, {});
  assert.deepEqual(copies, [
    "show-ops-proofs/biz/expenses/e2.pdf -> show-ops-backups/biz/files/show-ops-proofs/biz/expenses/e2.pdf",
    "business-logos/biz/logo-abc.png -> show-ops-backups/biz/files/business-logos/biz/logo-abc.png",
  ]);
  assert.equal(mirrorObjectPath("biz", files[0]), "biz/files/show-ops-proofs/biz/expenses/e1.pdf");
});

test("a source object updated after its mirror copy is mirrored again", () => {
  const src: ShowOpsBackupFile = { bucket: "b", path: "p", size: 1, updated_at: "2026-09-10T10:00:00.000Z" };
  assert.equal(needsMirror(src, undefined), true);
  assert.equal(needsMirror(src, { ...src, updated_at: "2026-09-10T09:00:00.000Z" }), true);
  assert.equal(needsMirror(src, { ...src, updated_at: "2026-09-10T11:00:00.000Z" }), false);
  assert.equal(needsMirror(src, { ...src, size: 2, updated_at: "2026-09-10T11:00:00.000Z" }), true);
});

test("when cross-bucket copy is refused the object is downloaded and re-uploaded", async () => {
  const copies: string[] = [];
  const uploads: string[] = [];
  const supabase = fakeSupabase({}, { copies, uploads, copyFails: true });
  const result = await mirrorShowOpsFiles(
    supabase,
    "biz",
    [{ bucket: "show-ops-proofs", path: "biz/a.jpg", size: 1, updated_at: null }],
    [],
  );
  assert.equal(result.mirrored, 1);
  assert.deepEqual(copies, []);
  assert.deepEqual(uploads, ["show-ops-backups/biz/files/show-ops-proofs/biz/a.jpg"]);
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

test("pruning never selects anything under files/, whatever it is called", () => {
  const now = new Date("2026-09-02T12:20:00.000Z");
  const names = everyFiveMinutes(new Date("2026-08-28T00:00:00.000Z"), now);
  const mirrored = [
    "files",
    "files/show-ops-proofs/biz/expenses/receipt.pdf",
    "biz/files/business-logos/biz/logo-abc.png",
    // A mirrored object that happens to be named like an old snapshot.
    "files/show-ops-proofs/biz/2026-08-28T00-00-00-000Z.json.gz",
    "biz/files/show-ops-proofs/biz/tickets/2026-08-29T01-05-00-000Z.json",
  ];
  const prune = snapshotsToPrune([...mirrored, ...names], now);
  assert.ok(prune.length > 0);
  for (const m of mirrored) assert.ok(!prune.includes(m), `${m} must never be pruned`);
  for (const p of prune) assert.ok(!p.includes("files/"), p);
  assert.deepEqual(snapshotsToPrune(mirrored, now), []);
  assert.equal(snapshotTimestamp("files/show-ops-proofs/biz/2026-08-28T00-00-00-000Z.json.gz"), null);
});

test("nothing is pruned when everything is within the last hour", () => {
  const now = new Date("2026-09-02T12:20:00.000Z");
  const names = everyFiveMinutes(new Date("2026-09-02T11:30:00.000Z"), now);
  assert.deepEqual(snapshotsToPrune(names, now), []);
});
