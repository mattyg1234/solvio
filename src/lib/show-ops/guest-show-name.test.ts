import assert from "node:assert/strict";
import { test } from "node:test";

import { buildGuestTicketText, type GuestTicketInput } from "../notifications/show-ops-guest-ticket";
import { guestShowName } from "./guest-show-name";

test("island codes read as full island names", () => {
  assert.equal(guestShowName("MHT ACE"), "MHT Lanzarote");
  assert.equal(guestShowName("1 MHT ACE"), "MHT Lanzarote");
  assert.equal(guestShowName("2 MHT TFS"), "MHT Tenerife");
  assert.equal(guestShowName("7 MHT LPA"), "MHT Gran Canaria");
});

test("other names are left alone", () => {
  assert.equal(guestShowName("Grace Show"), "Grace Show");
  assert.equal(guestShowName("MHT Tenerife"), "MHT Tenerife");
  assert.equal(guestShowName("2026"), "2026");
  assert.equal(guestShowName(""), "");
});

test("the guest text shows the island in full", () => {
  const input: GuestTicketInput = {
    merchantName: "MHT",
    bookingRef: "MHT-1000",
    guestName: "Sam Test",
    showName: "1 MHT ACE",
    showDate: "2026-11-20",
    adults: 2,
    children: 0,
    infants: 0,
    transportRequired: false,
    billingMode: "full",
    currency: "eur",
  };
  const text = buildGuestTicketText(input);
  assert.match(text, /Show: MHT Lanzarote/);
  assert.doesNotMatch(text, /\bACE\b/);
});
