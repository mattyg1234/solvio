import assert from "node:assert/strict";
import { test } from "node:test";

import { SHOW_OPS_BACKUP_TABLES } from "./backup";
import {
  PRODUCTION_PROJECT_REF,
  RESTORE_ORDER,
  assertRestoreTarget,
  chunk,
  conflictColumns,
  isProductionTarget,
  parseRestoreArgs,
  parseSnapshot,
  restoreOrder,
  tablesMissingFromSnapshot,
} from "./restore";

test("the restore refuses the production project, however the URL is written", () => {
  assert.equal(isProductionTarget("https://aasfahcrdcoqxwnlkdnv.supabase.co"), true);
  assert.equal(isProductionTarget("https://AASFAHCRDCOQXWNLKDNV.supabase.co/"), true);
  assert.equal(isProductionTarget("https://muzonmhumkzxwivzmzgx.supabase.co"), false);
  assert.throws(() => assertRestoreTarget(`https://${PRODUCTION_PROJECT_REF}.supabase.co`), /Refusing to restore into production/);
  assert.throws(() => assertRestoreTarget("not a url"), /http\(s\) URL/);
  assert.doesNotThrow(() => assertRestoreTarget("https://muzonmhumkzxwivzmzgx.supabase.co"));
  assert.throws(
    () => parseRestoreArgs(["--file", "x.json.gz", "--dry-run", "--target-url", `https://${PRODUCTION_PROJECT_REF}.supabase.co`]),
    /Refusing to restore into production/,
  );
});

test("argument parsing: dry-run needs only a file; a real run needs url and key", () => {
  assert.deepEqual(parseRestoreArgs(["--file", "s.json.gz", "--dry-run"]), {
    file: "s.json.gz",
    targetUrl: null,
    targetServiceKey: null,
    dryRun: true,
  });
  assert.deepEqual(parseRestoreArgs(["--file", "s.json.gz", "--target-url", "https://abc.supabase.co/", "--target-service-key", "k"]), {
    file: "s.json.gz",
    targetUrl: "https://abc.supabase.co",
    targetServiceKey: "k",
    dryRun: false,
  });
  assert.throws(() => parseRestoreArgs(["--dry-run"]), /--file/);
  assert.throws(() => parseRestoreArgs(["--file", "s.json.gz"]), /--target-url is required/);
  assert.throws(() => parseRestoreArgs(["--file", "s.json.gz", "--target-url", "https://abc.supabase.co"]), /--target-service-key is required/);
  assert.throws(() => parseRestoreArgs(["--file", "s.json.gz", "--bogus"]), /Unknown argument/);
});

test("restore order puts parents before children and covers every backed-up table", () => {
  assert.deepEqual([...RESTORE_ORDER].sort(), [...SHOW_OPS_BACKUP_TABLES].sort());
  const idx = (t: string) => RESTORE_ORDER.indexOf(t);
  const before = (a: string, b: string) => assert.ok(idx(a) < idx(b), `${a} must restore before ${b}`);
  before("show_suppliers", "show_products");
  before("show_products", "show_rate_prices");
  before("show_supplier_rates", "show_rate_prices");
  before("show_bus_stops", "show_hotels");
  before("show_hotels", "show_bookings");
  before("show_ticket_types", "show_bookings");
  before("show_extras", "show_bookings");
  before("show_bookings", "show_booking_payments");
  before("show_bookings", "show_booking_history");
  before("show_bookings", "show_invoices");
  before("show_invoices", "show_invoice_lines");
  before("show_invoice_lines", "show_invoice_external_events");
  before("show_products", "show_channel_products");
  before("show_channel_products", "show_seat_holds");
  before("show_bookings", "show_seat_holds");
  // The named core comes first, the rest after.
  assert.deepEqual(RESTORE_ORDER.slice(0, 15), [
    "show_suppliers",
    "show_products",
    "show_supplier_rates",
    "show_rate_prices",
    "show_bus_stops",
    "show_hotels_directory",
    "show_hotels",
    "show_ticket_types",
    "show_extras",
    "show_bookings",
    "show_booking_payments",
    "show_booking_history",
    "show_invoices",
    "show_invoice_lines",
    "show_invoice_external_events",
  ]);
});

test("restoreOrder keeps only tables present and appends unknown ones last", () => {
  assert.deepEqual(restoreOrder(["show_invoice_lines", "show_bookings", "show_zzz_new", "show_suppliers"]), [
    "show_suppliers",
    "show_bookings",
    "show_invoice_lines",
    "show_zzz_new",
  ]);
});

test("upsert key is id except for the composite-key push table", () => {
  assert.equal(conflictColumns("show_bookings"), "id");
  assert.equal(conflictColumns("show_channel_availability_pushes"), "business_id,channel,external_product_id,show_date");
});

test("parseSnapshot accepts format 2 without errors/files and format 3 with them", () => {
  const v2 = parseSnapshot({
    format: 2,
    exported_at: "2026-09-01T00:00:00.000Z",
    business: { id: "biz" },
    counts: { show_bookings: 1 },
    tables: { show_bookings: [{ id: "b1", business_id: "biz" }] },
  });
  assert.equal(v2.format, 2);
  assert.deepEqual(v2.errors, {});
  assert.deepEqual(v2.files, []);
  assert.ok(tablesMissingFromSnapshot(v2).includes("show_suppliers"));

  const v3 = parseSnapshot({
    format: 3,
    exported_at: "2026-09-11T00:00:00.000Z",
    business: { id: "biz" },
    counts: {},
    tables: {},
    errors: { show_seat_holds: "missing" },
    files: [{ bucket: "show-ops-proofs", path: "biz/a.jpg", size: 1, updated_at: null }],
  });
  assert.equal(v3.files.length, 1);
  assert.equal(tablesMissingFromSnapshot(v3).includes("show_seat_holds"), false);
});

test("parseSnapshot refuses foreign formats, cross-tenant rows and count mismatches", () => {
  assert.throws(() => parseSnapshot({ format: 1, business: { id: "b" }, tables: {} }), /Unsupported snapshot format/);
  assert.throws(() => parseSnapshot({ format: 3, tables: {} }), /business\.id/);
  assert.throws(
    () => parseSnapshot({ format: 3, business: { id: "biz" }, tables: { show_bookings: [{ id: 1, business_id: "other" }] } }),
    /not biz/,
  );
  assert.throws(
    () => parseSnapshot({ format: 3, business: { id: "biz" }, counts: { show_bookings: 2 }, tables: { show_bookings: [{ id: 1, business_id: "biz" }] } }),
    /counts says 2/,
  );
});

test("chunk splits rows for batched upserts", () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunk([], 2), []);
});
