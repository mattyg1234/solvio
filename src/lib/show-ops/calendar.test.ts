import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildCalendarDays,
  nightsAheadKeys,
  productRunsOnDate,
  saleBlockedForPartner,
} from "./calendar";

test("Wednesday-only show lights that weekday on the month grid", () => {
  const days = buildCalendarDays({
    year: 2026,
    month: 8,
    products: [{ id: "ace", name: "MHT ACE", island: "Lanzarote", capacity: 200, run_weekdays: [3], active: true }],
    bookings: [
      {
        show_date: "2026-08-19",
        island: "Lanzarote",
        product_id: "ace",
        show_name: "MHT ACE",
        adults: 10,
        children: 0,
        infants: 0,
        transport_required: true,
      },
    ],
    busOrders: [{ show_date: "2026-08-19", island: "Lanzarote", seats_ordered: 55, cost_total: 440 }],
  });
  const wed = days.find((d) => d.iso === "2026-08-19");
  const thu = days.find((d) => d.iso === "2026-08-20");
  assert.equal(wed?.hasShow, true);
  assert.equal(wed?.islands[0]?.shows[0]?.pax, 10);
  assert.equal(wed?.islands[0]?.busLeft, 45);
  assert.equal(thu?.hasShow, false);
});

test("full close on a show blocks partners; part close does not", () => {
  const closes = [
    { show_date: "2026-08-19", island: "Lanzarote", product_id: "ace", close_kind: "full" as const },
    { show_date: "2026-08-21", island: "Lanzarote", product_id: "ace", close_kind: "part" as const },
  ];
  assert.equal(
    saleBlockedForPartner(closes, { showDate: "2026-08-19", island: "Lanzarote", productId: "ace" }),
    true,
  );
  assert.equal(
    saleBlockedForPartner(closes, { showDate: "2026-08-21", island: "Lanzarote", productId: "ace" }),
    false,
  );
  assert.equal(
    saleBlockedForPartner(closes, { showDate: "2026-08-19", island: "Tenerife", productId: "ace" }),
    false,
  );
});

test("island-wide full close blocks every show that night", () => {
  assert.equal(
    saleBlockedForPartner(
      [{ show_date: "2026-08-19", island: "Lanzarote", product_id: null, close_kind: "full" }],
      { showDate: "2026-08-19", island: "Lanzarote", productId: "other" },
    ),
    true,
  );
});

test("nights ahead include scheduled shows with zero bookings", () => {
  const keys = nightsAheadKeys({
    from: "2026-08-17",
    to: "2026-08-21",
    products: [{ id: "ace", name: "MHT ACE", island: "Lanzarote", capacity: 200, run_weekdays: [3], active: true }],
    bookings: [],
    busOrders: [{ show_date: "2026-08-18", island: "Lanzarote" }],
  });
  assert.ok(keys.includes("2026-08-19|Lanzarote"));
  assert.ok(keys.includes("2026-08-18|Lanzarote"));
  assert.ok(!keys.includes("2026-08-17|Lanzarote"));
});

test("productRunsOnDate is false when weekdays are empty", () => {
  assert.equal(productRunsOnDate([], "2026-08-19"), false);
  assert.equal(productRunsOnDate(null, "2026-08-19"), false);
  assert.equal(productRunsOnDate([3], "2026-08-19"), true);
});
