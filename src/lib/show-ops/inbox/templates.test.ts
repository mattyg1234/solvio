import assert from "node:assert/strict";
import { test } from "node:test";

import { guestTicketTemplate, type GuestTicketInput } from "../../notifications/show-ops-guest-ticket";
import { approvedMetaTemplate, TEMPLATE_SPECS, templateSpec, templateValue, templateVariables } from "./templates";

const base: GuestTicketInput = {
  merchantName: "Magic Hub Tenerife",
  bookingRef: "MHT-1",
  guestName: "Sarah  Jones",
  showName: "Dinner Show",
  showDate: "2026-10-30",
  adults: 2,
  children: 1,
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
  island: "Tenerife",
};

test("every template's wording uses exactly its numbered blanks, in order", () => {
  for (const spec of TEMPLATE_SPECS) {
    const used = [...spec.wording.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
    assert.deepEqual(used, spec.blanks.map((_, i) => i + 1), spec.kind);
    // WhatsApp refuses a template that starts or ends with a blank.
    assert.ok(!/^\s*\{\{/.test(spec.wording) && !/\}\}\s*$/.test(spec.wording), spec.kind);
  }
});

test("blank values are single-line and never empty", () => {
  assert.equal(templateValue("a\nb\t  c"), "a b c");
  assert.equal(templateValue(""), "-");
  assert.deepEqual(templateVariables(["x", null]), { "1": "x", "2": "-" });
});

test("a bus booking uses the with-transport template", () => {
  const t = guestTicketTemplate(base)!;
  assert.equal(t.kind, "booking_transport");
  assert.equal(Object.keys(t.variables).length, templateSpec("booking_transport").blanks.length);
  assert.deepEqual(t.variables, {
    "1": "Sarah",
    "2": "Tenerife",
    "3": "Friday 30 October",
    "4": "3",
    "5": "18:30",
    "6": "Hotel Bahia",
  });
});

test("a pick-up still being arranged says so", () => {
  const t = guestTicketTemplate({ ...base, pickupStopName: null, pickupTime: null })!;
  assert.equal(t.variables["5"], "To be confirmed");
  assert.equal(t.variables["6"], "To be confirmed");
});

test("own way uses the no-transport template with the island's venue", () => {
  const own = { ...base, transportRequired: false, pickupKind: "own_way", pickupStopName: null, pickupTime: null };
  assert.equal(guestTicketTemplate(own), null, "no venue set → no template");
  const t = guestTicketTemplate(own, { Tenerife: { address: "Calle 1, Adeje", maps_url: "https://maps.app.goo.gl/x" } })!;
  assert.equal(t.kind, "booking");
  assert.equal(t.variables["5"], "Calle 1, Adeje");
  assert.equal(t.variables["6"], "https://maps.app.goo.gl/x");
});

test("pick-up change uses the transport confirmation template", () => {
  const t = guestTicketTemplate({ ...base, updated: true })!;
  assert.equal(t.kind, "pickup");
  assert.deepEqual(t.variables, { "1": "Sarah", "2": "Tenerife", "3": "18:30", "4": "Hotel Bahia" });
  assert.equal(guestTicketTemplate({ ...base, updated: true, transportRequired: false, pickupKind: "own_way" }), null);
});

test("Meta templates match under Vince's names too", () => {
  const approved = { template_1__booking_without_transport: "en", mht_transport_confirmation: "en_GB" };
  assert.deepEqual(approvedMetaTemplate(templateSpec("booking"), approved), { name: "template_1__booking_without_transport", language: "en" });
  assert.deepEqual(approvedMetaTemplate(templateSpec("pickup"), approved), { name: "mht_transport_confirmation", language: "en_GB" });
  assert.equal(approvedMetaTemplate(templateSpec("booking_transport"), approved), null);
});
