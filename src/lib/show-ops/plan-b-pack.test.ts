import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PLAN_B_CSV_COLUMNS,
  buildPlanBPack,
  csvCell,
  islandSlug,
  newestSnapshot,
  offsiteBackupEmails,
  planBBookingsCsv,
} from "./plan-b-pack";

type Row = Record<string, unknown>;

/** Minimal PostgREST stand-in that really applies eq / is / gte / in, and pages like the real one. */
function fakeDb(tables: Record<string, Row[]>, storage: Record<string, { name: string }[]> = {}) {
  return {
    from(table: string) {
      let rows = [...(tables[table] ?? [])];
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => ((rows = rows.filter((r) => r[c] === v)), q),
        is: (c: string, v: unknown) => ((rows = rows.filter((r) => (r[c] ?? null) === v)), q),
        gte: (c: string, v: string) => ((rows = rows.filter((r) => String(r[c]) >= v)), q),
        in: (c: string, v: unknown[]) => ((rows = rows.filter((r) => v.includes(r[c]))), q),
        order: () => q,
        range: (from: number, to: number) => Promise.resolve({ data: rows.slice(from, to + 1), error: null }),
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
          Promise.resolve({ data: rows, error: null }).then(res, rej),
      };
      return q;
    },
    storage: {
      from: () => ({
        list: (folder: string) => Promise.resolve({ data: storage[folder] ?? [], error: null }),
        download: (path: string) => Promise.resolve({ data: new Blob([`gz of ${path}`]), error: null }),
      }),
    },
  } as never;
}

function booking(over: Row): Row {
  return {
    id: crypto.randomUUID(),
    business_id: "biz",
    booking_ref: "MHT-1000",
    guest_name: "Guest",
    guest_mobile: "+447700900000",
    guest_email: null,
    show_name: "Tavern Show",
    island: "Tenerife",
    show_date: "2026-11-02",
    hotel_name: "Hotel",
    supplier_name: "TUI",
    supplier_ticket_number: null,
    adults: 2,
    children: 0,
    infants: 0,
    transport_required: false,
    pickup_kind: null,
    pickup_stop_id: null,
    pickup_stop_name: null,
    pickup_time: null,
    private_zone: null,
    dietary_required: false,
    dietary_notes: null,
    office_comments: null,
    billing_mode: "deposit",
    payment_status: "paid",
    total_cost: 100,
    balance_remaining: 0,
    nett_total: null,
    cancelled_at: null,
    arrived_at: null,
    no_show: null,
    ...over,
  };
}

const business = { id: "biz", name: "MHT Show Ops", show_ops_enabled: true, show_ops_display_name: "MHT", show_ops_config: { office_report_emails: ["joel@example.com"] } };
// 10:00 UTC on 2 Nov 2026 is 10:00 in the Canaries (winter time).
const NOW = new Date("2026-11-02T10:00:00Z");

test("the pack has a night list per island per night, bus lists, and the upcoming spreadsheet", async () => {
  const db = fakeDb({
    show_bookings: [
      booking({ booking_ref: "MHT-1001", island: "Tenerife", show_date: "2026-11-02", transport_required: true }),
      booking({ booking_ref: "MHT-1002", island: "Gran Canaria", show_date: "2026-11-02" }),
      booking({ booking_ref: "MHT-1003", island: "Lanzarote", show_date: "2026-11-03" }),
      booking({ booking_ref: "MHT-1004", island: "Tenerife", show_date: "2026-11-20" }),
      booking({ booking_ref: "MHT-0999", island: "Tenerife", show_date: "2026-11-01" }),
      booking({ booking_ref: "MHT-1005", island: "Tenerife", show_date: "2026-11-02", cancelled_at: "2026-11-01T09:00:00Z" }),
      booking({ booking_ref: "OTHER", business_id: "someone-else", show_date: "2026-11-02" }),
    ],
    show_bus_stops: [],
    show_bus_orders: [],
    show_bus_night_orders: [],
  });
  const pack = await buildPlanBPack(db, business, NOW);

  assert.equal(pack.today, "2026-11-02");
  assert.deepEqual(pack.emails, ["joel@example.com"]);
  assert.deepEqual(pack.errors, []);
  assert.deepEqual(
    pack.attachments.map((a) => a.filename),
    [
      "night-list-2026-11-02-gran-canaria.pdf",
      "night-list-2026-11-02-tenerife.pdf",
      "night-list-2026-11-03-lanzarote.pdf",
      "bus-list-2026-11-02.pdf",
      "upcoming-bookings-from-2026-11-02.csv",
    ],
  );
  for (const a of pack.attachments.filter((x) => x.filename.endsWith(".pdf"))) {
    assert.equal(Buffer.from(a.content, "base64").subarray(0, 5).toString(), "%PDF-");
  }
  // Past, cancelled and other-tenant bookings stay out; far-future ones are in the spreadsheet.
  assert.equal(pack.upcomingBookings, 4);
  const csv = Buffer.from(pack.attachments.at(-1)!.content, "base64").toString("utf8");
  assert.match(csv, /MHT-1004/);
  assert.doesNotMatch(csv, /MHT-0999|MHT-1005|OTHER/);
  assert.match(pack.text, /2026-11-04: no bookings/);
  assert.match(pack.text, /2026-11-03: no bus bookings/);
});

test("the spreadsheet is Excel-safe: BOM, quoting and no formulas", () => {
  assert.equal(csvCell('Hotel "Sol", Playa'), '"Hotel ""Sol"", Playa"');
  assert.equal(csvCell("=HYPERLINK(1)"), "'=HYPERLINK(1)");
  assert.equal(csvCell(null), "");
  const csv = planBBookingsCsv([{ booking_ref: "MHT-1", guest_name: "Ana\nMaría" }]);
  assert.ok(csv.startsWith("﻿" + PLAN_B_CSV_COLUMNS.join(",")));
  assert.match(csv, /"Ana\nMaría"/);
});

test("island names become safe file names", () => {
  assert.equal(islandSlug("Gran Canaria"), "gran-canaria");
  assert.equal(islandSlug("  "), "island");
});

test("off-site addresses are read from a comma list and junk is dropped", () => {
  assert.deepEqual(offsiteBackupEmails("a@b.com, c@d.co ;nope"), ["a@b.com", "c@d.co"]);
  assert.deepEqual(offsiteBackupEmails(undefined), []);
});

test("the newest timestamped snapshot is picked, never the files folder", async () => {
  const db = fakeDb({}, {
    biz: [{ name: "files" }, { name: "2026-11-02T19-25-39-450Z.json.gz" }, { name: "2026-11-02T19-20-39-473Z.json.gz" }],
  });
  const snap = await newestSnapshot(db, "biz");
  assert.equal(snap?.name, "2026-11-02T19-25-39-450Z.json.gz");
  assert.equal(snap?.bytes.toString(), "gz of biz/2026-11-02T19-25-39-450Z.json.gz");
  assert.equal(await newestSnapshot(fakeDb({}, { biz: [{ name: "files" }] }), "biz"), null);
});

test("Plan B recipients are the daily list plus the Plan B-only list, without duplicates", async () => {
  const { planBRecipients } = await import("./plan-b-pack");
  assert.deepEqual(
    planBRecipients({ office_report_emails: ["joel@x.com", "Rich@x.com"], plan_b_emails: ["rich@x.com", "vince@x.com"] }),
    ["joel@x.com", "rich@x.com", "vince@x.com"],
  );
  assert.deepEqual(planBRecipients({ office_report_emails: [] }), []);
});
