import assert from "node:assert/strict";
import { test } from "node:test";

import {
  bookingDifferences,
  bookingDraftFromEmail,
  channelFor,
  islandFromEmail,
  matchHotel,
  matchProduct,
  matchSupplier,
  pickupFromText,
  productRunsOn,
  rankBookingMatches,
  sellerSource,
  type CatalogHotel,
  type CatalogProduct,
  type CatalogSupplier,
} from "./mapping";
import { isReplyOrForward, looksLikeSupplierBooking, senderMatches, suggestionSender, cleanSender, sellerForEmail } from "./sellers";
import { cleanEmailText, readKnownTemplate } from "./templates";
import { GYG_SUBJECT, GYG_TEXT, WOO_SUBJECT, WOO_TEXT } from "./test-fixtures";

const ISLANDS = ["Lanzarote", "Fuerteventura", "Gran Canaria", "Tenerife", "UK Tour"];

// 0 = Sunday … 5 = Friday. 2 Oct 2026 is a Friday.
const PRODUCTS: CatalogProduct[] = [
  { id: "p-tfs", name: "2 MHT TFS", island: "Tenerife", show_time: "19:00", run_weekdays: [2, 5, 6], show_ticket_types: [{ id: "tt-vip", name: "VIP", active: true }] },
  { id: "p-ace", name: "1 MHT ACE", island: "Lanzarote", show_time: "19:00", run_weekdays: [2, 3, 5, 6] },
  { id: "p-nye", name: "NYE TFS", island: "Tenerife", show_time: "20:00", run_weekdays: [4] },
];
const SUPPLIERS: CatalogSupplier[] = [
  { id: "s-tfs-web", name: "TFS Web Booking", partner_type: "MHT Web", island: "Tenerife", billing_mode: "deposit" },
  { id: "s-ace-web", name: "ACE Web Booking", partner_type: "MHT Web", island: "Lanzarote", billing_mode: "deposit" },
  { id: "s-tfs-gyg", name: "TFS Get Your Guide", partner_type: "GYG", island: "Tenerife", billing_mode: "deposit" },
  { id: "s-tfs-gyg-inv", name: "TFS Get Your Guide - INVOICE", partner_type: "GYG", island: "Tenerife", billing_mode: "invoice" },
  { id: "s-ace-gyg", name: "ACE Get Your Guide", partner_type: "GYG", island: "Lanzarote", billing_mode: "invoice" },
  { id: "s-tiqets", name: "Tiqets", partner_type: "Online Agency", island: "ALL", billing_mode: "invoice" },
];
const HOTELS: CatalogHotel[] = [
  { id: "h-palace", name: "Hotel Test Palace", island: "Tenerife", bus_stop_id: "stop-1" },
  { id: "h-palace-ace", name: "Test Palace", island: "Lanzarote", bus_stop_id: "stop-9" },
  { id: "h-bahia", name: "Apartamentos Bahía Example Costa Adeje", island: "Tenerife", bus_stop_id: "stop-2" },
];

test("island from the order prefix, the SKU, the text or the inbox", () => {
  assert.equal(islandFromEmail({ reference: "TFS/20957", text: "" }, ISLANDS), "Tenerife");
  assert.equal(islandFromEmail({ reference: "ACE/1201", text: "" }, ISLANDS), "Lanzarote");
  assert.equal(islandFromEmail({ reference: "LPA/77", text: "" }, ISLANDS), "Gran Canaria");
  assert.equal(islandFromEmail({ reference: "20957", text: "Show (#TFS_AD_8027) 2" }, ISLANDS), "Tenerife");
  assert.equal(islandFromEmail({ reference: "GYGX", text: "Music Hall Tavern Dinner Show Lanzarote" }, ISLANDS), "Lanzarote");
  assert.equal(islandFromEmail({ text: "Dinner show", inbox: "tenerife@musichalltavern.com" }, ISLANDS), "Tenerife");
  assert.equal(islandFromEmail({ text: "Tenerife or Lanzarote" }, ISLANDS), null, "two islands named: don't guess");
  assert.equal(islandFromEmail({ reference: "TFS/1", text: "" }, ["Lanzarote"]), null, "only islands the workspace has");
});

test("the show: island + the night it runs, never a show that's dark that night", () => {
  assert.equal(productRunsOn(PRODUCTS[0], "2026-10-02"), true);
  assert.equal(productRunsOn(PRODUCTS[0], "2026-10-01"), false);
  assert.equal(matchProduct(PRODUCTS, "Tenerife", "2026-10-02", "Tenerife Dinner Show")?.id, "p-tfs");
  assert.equal(matchProduct(PRODUCTS, "Tenerife", "2026-12-31", "Tenerife Dinner Show")?.id, "p-nye");
  assert.equal(matchProduct(PRODUCTS, "Tenerife", "2026-10-05", "Dinner Show"), null, "Monday: nothing runs");
  assert.equal(matchProduct(PRODUCTS, null, "2026-10-02", "Dinner Show"), null, "no island, no name: leave it to the office");
  assert.equal(matchProduct([{ ...PRODUCTS[0], run_weekdays: [5], dark_dates: ["2026-10-02"] }], "Tenerife", "2026-10-02", ""), null);
});

test("the partner row: website → the island's MHT Web, GYG → the island's GYG (invoice first), marketplaces by name", () => {
  assert.equal(matchSupplier(SUPPLIERS, "website", "MHT website", "Tenerife")?.id, "s-tfs-web");
  assert.equal(matchSupplier(SUPPLIERS, "website", "MHT website", "Lanzarote")?.id, "s-ace-web");
  assert.equal(matchSupplier(SUPPLIERS, "getyourguide", "GetYourGuide", "Tenerife")?.id, "s-tfs-gyg-inv");
  assert.equal(matchSupplier(SUPPLIERS, "getyourguide", "GetYourGuide", "Lanzarote")?.id, "s-ace-gyg");
  assert.equal(matchSupplier(SUPPLIERS, "marketplace", "Tiqets", "Tenerife")?.id, "s-tiqets");
  assert.equal(matchSupplier(SUPPLIERS, "marketplace", "Viator", "Tenerife"), null);
  assert.equal(matchSupplier(SUPPLIERS, "getyourguide", "GetYourGuide", "Gran Canaria"), null);
});

test("hotels: exact name without the filler words, then a clear containment, per island", () => {
  assert.equal(matchHotel(HOTELS, "Test Palace", "Tenerife")?.id, "h-palace");
  assert.equal(matchHotel(HOTELS, "hotel test palace", "Lanzarote")?.id, "h-palace-ace");
  assert.equal(matchHotel(HOTELS, "Bahia Example Costa Adeje, room 12", "Tenerife")?.id, "h-bahia");
  assert.equal(matchHotel(HOTELS, "Villa Sunshine", "Tenerife"), null);
  assert.equal(matchHotel(HOTELS, "Test Palace", null), null, "same name on two islands: don't guess");
});

test("pick-up from GetYourGuide's option line", () => {
  assert.equal(pickupFromText("Option: Dinner and Show - Direct Guests South"), "own_way");
  assert.equal(pickupFromText("Dinner Show with hotel pick-up"), "bus");
  assert.equal(pickupFromText("Dinner Show"), null);
});

test("channel + reference: GYG shares the API's channel so an API booking is never doubled", () => {
  assert.equal(sellerSource("getyourguide", {}), "getyourguide");
  assert.equal(sellerSource("custom:ruth@musichalltavern.com", { reference: "GYGTEST12345" }), "getyourguide");
  assert.equal(sellerSource("custom:support@musichalltavern.com", { partner: "MHT website" }), "website");
  assert.equal(channelFor("getyourguide", "getyourguide"), "getyourguide");
  assert.equal(channelFor("website", "custom:support@musichalltavern.com"), "website");
  assert.equal(channelFor("marketplace", "tiqets"), "tiqets");
  assert.equal(channelFor("custom", "custom:desk@hotel.test"), "email");
});

test("website order → a prefilled booking for the office to check", () => {
  const read = readKnownTemplate("support@musichalltavern.com", WOO_SUBJECT, WOO_TEXT);
  assert.ok(read);
  const d = bookingDraftFromEmail({
    extracted: read.extracted,
    sellerKey: "custom:support@musichalltavern.com",
    sellerName: "MHT website",
    subject: WOO_SUBJECT,
    body: cleanEmailText(WOO_TEXT),
    islands: ISLANDS,
    products: PRODUCTS,
    suppliers: SUPPLIERS,
    hotels: HOTELS,
  });
  assert.equal(d.island, "Tenerife");
  assert.equal(d.channel, "website");
  assert.equal(d.channelRef, "TFS/20957");
  assert.deepEqual(
    { ...d.defaults, office_comments: undefined, office_only_comments: undefined },
    {
      show_date: "2026-10-02",
      guest_name: "Jane Testperson",
      guest_email: "jane.test@example.com",
      guest_mobile: "+44 7700 900000",
      product_id: "p-tfs",
      supplier_id: "s-tfs-web",
      hotel_id: "h-palace",
      payment_method: "card",
      adults: 4,
      children: 1,
      infants: 1,
      supplier_ticket_number: "TFS/20957",
      office_comments: undefined,
      office_only_comments: undefined,
    },
  );
  assert.match(d.defaults.office_comments ?? "", /^MHT website TFS\/20957 · Tickets:/);
  assert.match(d.defaults.office_only_comments ?? "", /Paid online €221\.00 \(Link\)/);
  assert.ok(d.checks.some((c) => /don't say a time; the show's time \(19:00\)/.test(c)));
  assert.ok(d.checks.some((c) => /€221\.00/.test(c)));
});

test("GetYourGuide booking → GYG partner, own way from the option, time checked against the show", () => {
  const read = readKnownTemplate("do-not-reply@notification.getyourguide.com", GYG_SUBJECT, GYG_TEXT);
  assert.ok(read);
  const d = bookingDraftFromEmail({
    extracted: read.extracted,
    sellerKey: "getyourguide",
    sellerName: "GetYourGuide",
    subject: GYG_SUBJECT,
    body: cleanEmailText(GYG_TEXT),
    inbox: "tenerife@musichalltavern.com",
    islands: ISLANDS,
    products: PRODUCTS,
    suppliers: SUPPLIERS,
    hotels: HOTELS,
  });
  assert.equal(d.channel, "getyourguide");
  assert.equal(d.channelRef, "GYGTEST12345");
  assert.equal(d.defaults.product_id, "p-tfs");
  assert.equal(d.defaults.supplier_id, "s-tfs-gyg-inv");
  assert.equal(d.defaults.pickup_kind, "own_way");
  assert.equal(d.defaults.transport_required, false);
  assert.equal(d.defaults.payment_method, undefined, "GYG collects the money, not MHT");
  assert.ok(d.checks.some((c) => /19:15.*19:00/.test(c)));
});

test("GetYourGuide mapping from Settings wins over name matching", () => {
  const read = readKnownTemplate("do-not-reply@notification.getyourguide.com", GYG_SUBJECT, GYG_TEXT);
  assert.ok(read);
  const d = bookingDraftFromEmail({
    extracted: read.extracted,
    sellerKey: "getyourguide",
    sellerName: "GetYourGuide",
    subject: GYG_SUBJECT,
    body: GYG_TEXT,
    islands: ISLANDS,
    products: PRODUCTS,
    suppliers: SUPPLIERS,
    hotels: HOTELS,
    channelProducts: [{ product_id: "p-tfs", supplier_id: "s-tfs-gyg", ticket_type_id: "tt-vip", pickup_kind: "own_way", island: "Tenerife", active: true }],
  });
  assert.equal(d.defaults.supplier_id, "s-tfs-gyg");
  assert.equal(d.defaults.ticket_type_id, "tt-vip");
});

test("match, don't create: same reference or ticket number = same booking; same night + surname = possibly", () => {
  const rows = [
    { id: "b1", booking_ref: "MHT-1", guest_name: "Alex Example", show_date: "2026-09-29", channel: "getyourguide", channel_ref: "GYGTEST12345" },
    { id: "b2", booking_ref: "MHT-2", guest_name: "Kim Example", show_date: "2026-09-29", supplier_ticket_number: "gygtest12345" },
    { id: "b3", booking_ref: "MHT-3", guest_name: "Pat Example", show_date: "2026-09-29" },
    { id: "b4", booking_ref: "MHT-4", guest_name: "Pat Example", show_date: "2026-09-30" },
  ];
  const m = rankBookingMatches({ reference: "GYGTEST12345", name: "Pat Example", date: "2026-09-29" }, rows);
  assert.deepEqual(
    m.map((x) => [x.booking.id, x.kind]),
    [
      ["b1", "same"],
      ["b2", "same"],
      ["b3", "possible"],
    ],
  );
  assert.deepEqual(bookingDifferences({ date: "2026-09-30", adults: 3, name: "Pat Example" }, { ...rows[2], adults: 2, children: 0 }), ["Date 2026-09-29 → 2026-09-30", "Adults 2 → 3"]);
});

test("senders: catalog, custom, suggestions, and the subject classifier", () => {
  assert.equal(sellerForEmail("do-not-reply@notification.getyourguide.com")?.key, "getyourguide");
  assert.equal(sellerForEmail("reservations@tui.co.uk")?.matchOnly, true);
  assert.equal(cleanSender("https://www.Tiqets.com/en"), "tiqets.com");
  assert.equal(cleanSender("Support@MusicHallTavern.com"), "support@musichalltavern.com");
  assert.equal(cleanSender("not a sender"), null);
  assert.equal(senderMatches("support@musichalltavern.com", "support@musichalltavern.com"), true);
  assert.equal(senderMatches("joel@musichalltavern.com", "support@musichalltavern.com"), false);
  assert.equal(senderMatches("a@mail.tiqets.com", "tiqets.com"), true);
  // On the inbox's own domain the single address is suggested, not the whole domain.
  assert.equal(suggestionSender("support@musichalltavern.com", "tenerife@musichalltavern.com"), "support@musichalltavern.com");
  assert.equal(suggestionSender("someone@gmail.com", "tenerife@musichalltavern.com"), "someone@gmail.com");
  assert.equal(suggestionSender("desk@hotel-example.com", "tenerife@musichalltavern.com"), "hotel-example.com");
  assert.equal(suggestionSender("tenerife@musichalltavern.com", "tenerife@musichalltavern.com"), null);
  assert.equal(looksLikeSupplierBooking(WOO_SUBJECT), true);
  assert.equal(looksLikeSupplierBooking(GYG_SUBJECT), true);
  assert.equal(looksLikeSupplierBooking("Your booking is confirmed: Paris weekend"), false);
  assert.equal(looksLikeSupplierBooking("50% off experiences this weekend"), false);
  assert.equal(isReplyOrForward("Fwd: Booking - S264045 - GYGTEST12345"), true);
});
