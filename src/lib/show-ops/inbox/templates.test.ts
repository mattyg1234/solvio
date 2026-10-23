import assert from "node:assert/strict";
import { test } from "node:test";

import { guestTicketTemplate, type GuestTicketInput } from "../../notifications/show-ops-guest-ticket";
import { TEMPLATE_SPECS, templateSpec, templateValue, templateVariables } from "./templates";

const base: GuestTicketInput = {
  merchantName: "Magic Hub Tenerife",
  bookingRef: "MHT-1",
  guestName: "Sarah  Jones",
  showName: "Dinner Show",
  showDate: "2026-10-30",
  adults: 2,
  children: 0,
  infants: 0,
  transportRequired: true,
  pickupStopName: "Hotel Bahia",
  pickupTime: "18:30:00",
  billingMode: "deposit",
  totalCost: 80,
  balanceRemaining: 40,
  currency: "eur",
  ticketUrl: "https://mht.solviosystems.com/ticket/abc",
  showTime: "PM",
};

test("every template's wording uses exactly its numbered blanks, in order", () => {
  for (const spec of TEMPLATE_SPECS) {
    const used = [...spec.wording("Magic Hub Tenerife").matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
    assert.deepEqual([...new Set(used)].sort((a, b) => a - b), spec.blanks.map((_, i) => i + 1), spec.kind);
    // WhatsApp refuses a template that starts or ends with a blank.
    assert.ok(!/^\s*\{\{/.test(spec.wording("X")) && !/\}\}\s*$/.test(spec.wording("X")), spec.kind);
  }
});

test("blank values are single-line and never empty", () => {
  assert.equal(templateValue("a\nb\t  c"), "a b c");
  assert.equal(templateValue(""), "-");
  assert.deepEqual(templateVariables(["x", null]), { "1": "x", "2": "-" });
});

test("booking confirmed fills one value per blank", () => {
  const t = guestTicketTemplate(base)!;
  assert.equal(t.kind, "ticket");
  assert.equal(Object.keys(t.variables).length, templateSpec("ticket").blanks.length);
  assert.equal(t.variables["1"], "Sarah");
  assert.equal(t.variables["2"], "Dinner Show (Evening show)");
  assert.equal(t.variables["5"], "Bus pick-up: Hotel Bahia at 18:30");
  assert.match(t.variables["6"], /40/);
  assert.equal(t.variables["7"], "MHT-1");
  assert.equal(t.variables["8"], base.ticketUrl);
  for (const v of Object.values(t.variables)) assert.ok(v && !/\n/.test(v));
});

test("partner-billed bookings never show money", () => {
  const t = guestTicketTemplate({ ...base, billingMode: "invoice" })!;
  assert.equal(t.variables["6"], "Nothing");
});

test("pick-up change uses its own template", () => {
  const t = guestTicketTemplate({ ...base, updated: true })!;
  assert.equal(t.kind, "pickup");
  assert.equal(Object.keys(t.variables).length, templateSpec("pickup").blanks.length);
  assert.equal(t.variables["4"], "Bus pick-up: Hotel Bahia at 18:30");
});

test("no ticket link, no template (goes by SMS instead)", () => {
  assert.equal(guestTicketTemplate({ ...base, ticketUrl: null }), null);
});
