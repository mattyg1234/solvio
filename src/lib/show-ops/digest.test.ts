import assert from "node:assert/strict";
import { test } from "node:test";

import { addDaysIso, buildDailyDigest, isoDateInTimeZone } from "./digest";
import { closeSaleCopy, closeSaleRecipients } from "./close-sale";

test("isoDateInTimeZone returns a calendar date", () => {
  const iso = isoDateInTimeZone(new Date("2026-08-16T23:30:00Z"), "UTC");
  assert.equal(iso, "2026-08-16");
  assert.equal(addDaysIso("2026-08-16", -1), "2026-08-15");
});

test("daily digest leads with bookings taken yesterday", () => {
  const d = buildDailyDigest({
    reportDate: "2026-08-15",
    currency: "eur",
    merchantName: "MHT",
    takenYesterday: [
      {
        booking_ref: "SO-1",
        guest_name: "Ada",
        show_name: "MHT ACE",
        show_date: "2026-08-19",
        island: "Lanzarote",
        supplier_name: "Island Agency",
        adults: 2,
        children: 0,
        infants: 0,
        total_cost: 130,
        billing_mode: "invoice",
        payment_status: "n_a",
        created_at: "2026-08-15T10:00:00Z",
      },
    ],
    lastNightShows: [],
    tonightBus: [{ island: "Lanzarote", seats_ordered: 55, cost_total: 440, bus_pax: 10 }],
  });
  assert.match(d.subject, /1 bookings \/ 2 pax/);
  assert.match(d.text, /Island Agency/);
  assert.match(d.text, /45 left/);
});

test("close-sale emails only partners who sell that island", () => {
  const rec = closeSaleRecipients(
    [
      { name: "ACE desk", email: "ace@x.com", island: "Lanzarote", active: true },
      { name: "TFS desk", email: "tfs@x.com", island: "Tenerife", active: true },
      { name: "All", email: "all@x.com", island: "ALL", active: true },
      { name: "No mail", email: null, island: "Lanzarote", active: true },
    ],
    "Lanzarote",
  );
  assert.deepEqual(
    rec.map((r) => r.email).sort(),
    ["ace@x.com", "all@x.com"],
  );
});

test("full close copy tells them to stop selling", () => {
  const c = closeSaleCopy({
    kind: "full",
    merchantName: "MHT",
    island: "Lanzarote",
    showDate: "2026-08-19",
    showName: "MHT ACE",
    note: "Coach full",
  });
  assert.match(c.subject, /STOP SELLING/);
  assert.match(c.text, /Do not take any more bookings/);
  assert.match(c.text, /Coach full/);
});

test("digest lists overdue invoices with days overdue and a link, and counts them in the subject", () => {
  const base = {
    reportDate: "2026-09-03",
    today: "2026-09-04",
    currency: "eur" as const,
    merchantName: "MHT",
    takenYesterday: [],
    lastNightShows: [],
    tonightBus: [],
  };
  const d = buildDailyDigest({
    ...base,
    overdueInvoices: [
      {
        id: "inv-1",
        supplier_name: "Island Agency",
        invoice_number: "MHT-2026-0007",
        total_amount: 1250,
        due_date: "2026-08-25",
        url: "https://ops.example/dashboard/show-ops/invoices/inv-1",
      },
      {
        id: "inv-2",
        supplier_name: "Beach Desk",
        invoice_number: null,
        total_amount: 300,
        currency: "gbp",
        due_date: "2026-09-03",
        url: "https://ops.example/dashboard/show-ops/invoices/inv-2",
      },
    ],
  });
  assert.match(d.subject, /· 2 overdue invoices$/);
  assert.match(d.text, /Island Agency · MHT-2026-0007 · €1,250\.00 · 10 days overdue/);
  assert.match(d.text, /Beach Desk · unnumbered · £300\.00 · 1 day overdue/);
  assert.match(d.text, /invoices\/inv-1/);
  assert.match(d.html, /href="https:\/\/ops\.example\/dashboard\/show-ops\/invoices\/inv-2"/);

  const none = buildDailyDigest(base);
  assert.doesNotMatch(none.subject, /overdue/);
  assert.doesNotMatch(none.html, /Overdue invoices/);
});
