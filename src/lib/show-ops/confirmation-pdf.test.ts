import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { PDFDocument } from "pdf-lib";

import {
  CONFIRMATION_TEMPLATE_PATH,
  buildGuestConfirmationPdf,
  confirmationAvailableFor,
  confirmationRows,
  confirmationTransportLine,
  type GuestConfirmationInput,
} from "./confirmation-pdf";

const sample: GuestConfirmationInput = {
  bookingRef: "MHT-319400",
  guestName: "Mr & Mrs Smith",
  showName: "MHT Tenerife",
  showDate: "2026-10-27",
  adults: 2,
  children: 1,
  infants: 0,
  hotelName: "Hotel Sol Tenerife",
  transportRequired: true,
  pickupKind: "bus",
  pickupStopName: "Sol Tenerife (taxi rank)",
  pickupTime: "18:15:00",
  billingMode: "deposit",
  balanceRemaining: 98,
  currency: "eur",
  ticketUrl: "https://www.solviosystems.com/ticket/abc123",
  printedAt: new Date("2026-10-20T10:00:00Z"),
};

test("only Tenerife and Lanzarote bookings get Ruth's printed confirmation", () => {
  assert.equal(confirmationAvailableFor("Tenerife"), true);
  assert.equal(confirmationAvailableFor("Lanzarote"), true);
  assert.equal(confirmationAvailableFor("Gran Canaria"), false);
  assert.equal(confirmationAvailableFor("UK Tour"), false);
  assert.equal(confirmationAvailableFor(null), false);
});

test("rows read like the office says them: name, ref, show, day and date, guests, hotel, pick-up, balance", () => {
  const rows = confirmationRows(sample);
  assert.deepEqual(rows.map(([l]) => l), ["Name", "Booking ref", "Show", "Date", "Guests", "Hotel", "Getting there", "To pay on the night"]);
  assert.equal(rows[3][1], "Tuesday 27 October 2026");
  assert.equal(rows[4][1], "2 adults, 1 child");
  assert.match(rows[6][1], /Sol Tenerife \(taxi rank\) at 18:15/);
  assert.equal(rows[7][1], "€98.00");
});

test("invoice (partner-billed) bookings never print a balance; own way and private read plainly", () => {
  const rows = confirmationRows({ ...sample, billingMode: "invoice", balanceRemaining: 98, hotelName: null, transportRequired: false, pickupKind: "own_way" });
  assert.equal(rows.some(([l]) => l === "To pay on the night"), false);
  assert.equal(rows.some(([l]) => l === "Hotel"), false);
  assert.match(confirmationTransportLine({ transportRequired: false, pickupKind: "own_way" }), /own way/);
  assert.match(confirmationTransportLine({ transportRequired: false, pickupKind: "private", privateZone: "PDC" }), /Private transfer from PDC/);
  assert.match(confirmationTransportLine({ transportRequired: true, pickupStopName: null }), /to be confirmed/);
});

test("the booking prints onto Ruth's template as a single A4 page with the QR embedded", async () => {
  const template = new Uint8Array(await readFile(CONFIRMATION_TEMPLATE_PATH));
  const out = await buildGuestConfirmationPdf(template, sample);
  const doc = await PDFDocument.load(out);
  assert.equal(doc.getPageCount(), 1);
  const { width, height } = doc.getPage(0).getSize();
  assert.ok(Math.abs(width - 595.28) < 1 && Math.abs(height - 841.89) < 1);
  assert.equal(doc.getTitle(), "Booking confirmation MHT-319400");
  assert.ok(out.byteLength > template.byteLength, "the filled page must carry more than the blank template");
  const noQr = await buildGuestConfirmationPdf(template, { ...sample, ticketUrl: null });
  assert.ok(noQr.byteLength < out.byteLength, "without a ticket link there is no QR image");
});
