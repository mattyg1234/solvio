import assert from "node:assert/strict";
import { test } from "node:test";

import { buildShowOpsDashboard } from "./dashboard";

test("home lists every active show even with zero bookings tonight", () => {
  const dash = buildShowOpsDashboard({
    today: "2026-08-14",
    weekStart: "2026-08-08",
    weekEnd: "2026-08-28",
    currency: "eur",
    bookings: [
      {
        show_date: "2026-08-14",
        island: "Lanzarote",
        adults: 4,
        children: 0,
        infants: 0,
        transport_required: true,
        billing_mode: "invoice",
        payment_status: "n_a",
        balance_remaining: 0,
        total_cost: 260,
        supplier_name: "Island Agency",
        product_id: "ace",
        show_name: "MHT ACE",
        pickup_stop_id: "pdc1",
      },
    ],
    unpaidDeposits: [],
    busOrders: [{ show_date: "2026-08-14", island: "Lanzarote", seats_ordered: 50 }],
    invoices: [],
    products: [
      { id: "ace", name: "MHT ACE", island: "Lanzarote", capacity: 200, active: true },
      { id: "offer", name: "Show only", island: "Lanzarote", capacity: 80, active: true },
      { id: "tfs", name: "MHT TFS", island: "Tenerife", capacity: 180, active: true },
    ],
    stops: [{ id: "pdc1", island: "Lanzarote", resort: "PDC" }],
    stripeReady: true,
    guestStripeEnabled: false,
  });

  assert.equal(dash.shows.length, 3);
  assert.equal(dash.shows.filter((s) => s.island === "Lanzarote").length, 2);
  assert.equal(dash.shows.filter((s) => s.island === "Tenerife").length, 1);
  const ace = dash.shows.find((s) => s.name === "MHT ACE");
  assert.equal(ace?.pax, 4);
  assert.equal(ace?.busPax, 4);
  const offer = dash.shows.find((s) => s.name === "Show only");
  assert.equal(offer?.bookings, 0);
  assert.equal(dash.areas[0]?.resort, "PDC");
  assert.equal(dash.areas[0]?.busPax, 4);
  assert.equal(dash.islands.find((i) => i.island === "Lanzarote")?.seatsLeft, 46);
  assert.equal(dash.shows.find((s) => s.name === "MHT ACE")?.fill, "open");
  assert.equal(dash.month.tickets, 0);
});
