import assert from "node:assert/strict";
import { test } from "node:test";

import { coerceExtracted, coerceRead } from "./extract";
import { GYG_SUBJECT, GYG_TEXT, WOO_SUBJECT, WOO_TEXT } from "./test-fixtures";
import { cleanEmailText, findDate, findTime, readEmailByPattern, readGetYourGuide, readKnownTemplate, readWooOrder } from "./templates";

test("dates and times in the layouts partners use", () => {
  assert.equal(findDate("Friday 2 Oct 2026"), "2026-10-02");
  assert.equal(findDate("September 29, 2026, 7:15 PM"), "2026-09-29");
  assert.equal(findDate("2 de octubre de 2026"), "2026-10-02");
  assert.equal(findTime("September 29, 2026, 7:15 PM"), "19:15");
  assert.equal(findTime("19:00"), "19:00");
  assert.equal(findTime("12:30 AM"), "00:30");
});

test("Gmail's plain-text copy is cleaned: bold stars, image and link lines, odd spaces", () => {
  const clean = cleanEmailText("[image: logo]\n<https://x.test/a>\n*2 x* Adults\n7:15 PM");
  assert.equal(clean, "\n\n2 x Adults\n7:15 PM");
});

test("WooCommerce new order: tickets, date, paid online, accommodation, infants, billing", () => {
  const r = readWooOrder(WOO_SUBJECT, cleanEmailText(WOO_TEXT));
  assert.ok(r);
  assert.equal(r.kind, "new");
  assert.equal(r.confidence, 0.95);
  const e = r.extracted;
  assert.equal(e.reference, "TFS/20957");
  assert.equal(e.partner, "MHT website");
  assert.equal(e.name, "Jane Testperson");
  assert.equal(e.date, "2026-10-02");
  assert.equal(e.time, undefined, "Woo emails carry no show time");
  assert.equal(e.adults, 4);
  assert.equal(e.children, 1);
  assert.equal(e.infants, 1);
  assert.equal(e.quantity, 6);
  assert.equal(e.service, "Tenerife Dinner Show");
  assert.equal(e.amount, 221);
  assert.equal(e.paid, 221);
  assert.equal(e.paymentMethod, "Link");
  assert.equal(e.location, "Hotel Test Palace");
  assert.equal(e.phone, "+44 7700 900000");
  assert.equal(e.email, "jane.test@example.com");
  assert.match(e.requests ?? "", /Tickets: 4 × Tenerife Adult Dinner Show, 1 × Tenerife Child Dinner Show/);
});

test("WooCommerce: bank transfer isn't paid; no infants answer stays out; cancelled order", () => {
  const text = cleanEmailText(WOO_TEXT).replace("Payment method: Link", "Payment method: Direct bank transfer").replace("Yes 1", "No");
  const r = readWooOrder(WOO_SUBJECT, text);
  assert.ok(r);
  assert.equal(r.extracted.paid, undefined);
  assert.equal(r.extracted.infants, undefined);
  assert.equal(r.extracted.quantity, 5);

  const cancel = readWooOrder("[MHT- Music Hall Tavern]: Order #TFS/20957 has been cancelled", "The order #TFS/20957 belonging to Jane Testperson has been cancelled:\nBilling address");
  assert.ok(cancel);
  assert.equal(cancel.kind, "cancel");
  assert.equal(cancel.extracted.reference, "TFS/20957");
  assert.equal(cancel.extracted.name, "Jane Testperson");
});

test("WooCommerce: the daily digest and non-shop emails are not orders", () => {
  assert.equal(readWooOrder("Yesterday's WooCommerce Orders", "Order no Customer Total\nTFS/20957 Jane Testperson 221,00 €"), null);
  assert.equal(readWooOrder("Lunch on Friday?", "See you there"), null);
});

test("GetYourGuide booking: reference, date + time, participants, add-ons, option, customer, price", () => {
  const r = readKnownTemplate("do-not-reply@notification.getyourguide.com", GYG_SUBJECT, GYG_TEXT);
  assert.ok(r);
  assert.equal(r.kind, "new");
  const e = r.extracted;
  assert.equal(e.reference, "GYGTEST12345");
  assert.equal(e.partner, "GetYourGuide");
  assert.equal(e.service, "Music Hall Tavern Dinner Show Tenerife");
  assert.equal(e.date, "2026-09-29");
  assert.equal(e.time, "19:15");
  assert.equal(e.adults, 2);
  assert.equal(e.children, 1);
  assert.equal(e.quantity, 3);
  assert.equal(e.name, "Alex Example");
  assert.equal(e.email, "customer-abc@reply.getyourguide.com");
  assert.equal(e.phone, "+44 7700 900111");
  assert.equal(e.language, "English");
  assert.equal(e.amount, 150);
  assert.match(e.requests ?? "", /Option: Dinner and Show - Direct Guests South/);
  assert.match(e.requests ?? "", /2 × MHT VIP Experience/);
});

test("GetYourGuide cancellation and a forwarded copy (found by the subject's GYG reference)", () => {
  const cancel = readGetYourGuide("Booking cancelled - S100001 - GYGTEST12345", cleanEmailText(GYG_TEXT.replace("has been booked", "has been cancelled")));
  assert.ok(cancel);
  assert.equal(cancel.kind, "cancel");
  const forwarded = readKnownTemplate("ruth@musichalltavern.com", GYG_SUBJECT, GYG_TEXT);
  assert.equal(forwarded?.extracted.reference, "GYGTEST12345");
});

test("pattern reader: a simple partner email, low confidence on purpose", () => {
  const r = readEmailByPattern(
    "bookings@tiqets.com",
    "New booking TQ-55821",
    "Booking reference: TQ-55821\nTravel date: 2026-10-06\nLead traveller: Sam Sample\n2 adults, 1 child\nHotel: Example Beach Resort\nTotal: EUR 110.00",
  );
  assert.equal(r.kind, "new");
  assert.equal(r.extracted.reference, "TQ-55821");
  assert.equal(r.extracted.date, "2026-10-06");
  assert.equal(r.extracted.name, "Sam Sample");
  assert.equal(r.extracted.adults, 2);
  assert.equal(r.extracted.children, 1);
  assert.equal(r.extracted.quantity, 3);
  assert.equal(r.extracted.location, "Example Beach Resort");
  assert.equal(r.extracted.amount, 110);
  assert.ok(r.confidence <= 0.75);
});

test("AI answers and browser edits are coerced: bad fields dropped, pax totalled", () => {
  const e = coerceExtracted({ name: "  Sam  ", date: "2026-13-45", time: "7.30", adults: "2", infants: 1, email: "not-an-email", amount: "1.196,50", junk: "x" });
  assert.deepEqual(e, { name: "Sam", time: "07:30", adults: 2, infants: 1, amount: 1196.5, quantity: 3 });
  assert.equal(coerceRead({ kind: "maybe" }), null);
  assert.equal(coerceRead({ kind: "cancel", confidence: 3, extracted: {} })?.confidence, 1);
});
