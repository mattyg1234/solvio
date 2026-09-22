import assert from "node:assert/strict";
import { test } from "node:test";

import {
  cancellationRequestWindow,
  cancelledChargeNote,
  defaultCancellationCharge,
  partnerCancellationStatus,
  showOpsTodayIso,
} from "./cancellation";

test("a partner can request up to the day before the show, not on the day", () => {
  assert.equal(cancellationRequestWindow({ show_date: "2026-10-27" }, "2026-10-26").allowed, true);
  const onTheDay = cancellationRequestWindow({ show_date: "2026-10-26" }, "2026-10-26");
  assert.equal(onTheDay.allowed, false);
  assert.match(onTheDay.allowed ? "" : onTheDay.reason, /day before/);
  assert.equal(cancellationRequestWindow({ show_date: "2026-10-20" }, "2026-10-26").allowed, false);
});

test("cancelled, invoiced or already-requested bookings cannot be requested again", () => {
  assert.equal(cancellationRequestWindow({ show_date: "2026-10-27", cancelled_at: "2026-10-01T10:00:00Z" }, "2026-10-26").allowed, false);
  assert.equal(cancellationRequestWindow({ show_date: "2026-10-27", invoice_id: "inv" }, "2026-10-26").allowed, false);
  assert.equal(cancellationRequestWindow({ show_date: "2026-10-27", cancel_request_status: "pending" }, "2026-10-26").allowed, false);
  // A declined request can be sent again.
  assert.equal(cancellationRequestWindow({ show_date: "2026-10-27", cancel_request_status: "denied" }, "2026-10-26").allowed, true);
});

test("partner sees the state of their request", () => {
  assert.equal(partnerCancellationStatus({ show_date: "2026-10-27" }), null);
  assert.equal(partnerCancellationStatus({ show_date: "2026-10-27", cancel_request_status: "pending" })?.tone, "pending");
  assert.equal(
    partnerCancellationStatus({ show_date: "2026-10-27", cancel_request_status: "denied", cancel_request_reply: "Bus already ordered" })?.label,
    "Cancellation declined — Bus already ordered",
  );
  assert.equal(partnerCancellationStatus({ show_date: "2026-10-27", cancelled_at: "x", cancel_charge: "charge" })?.label, "Cancelled — charged in full");
  assert.equal(partnerCancellationStatus({ show_date: "2026-10-27", cancelled_at: "x" })?.label, "Cancelled");
});

test("inside the cut-off the default is write off; late follows the partner policy", () => {
  assert.equal(defaultCancellationCharge("charge", "2026-10-27", "2026-10-26"), "write_off");
  assert.equal(defaultCancellationCharge("charge", "2026-10-26", "2026-10-26"), "charge");
  assert.equal(defaultCancellationCharge("write_off", "2026-10-26", "2026-10-26"), "write_off");
  assert.equal(defaultCancellationCharge(null, "2026-10-25", "2026-10-26"), "charge");
});

test("charged cancellations carry an invoice note, written-off ones do not", () => {
  assert.equal(cancelledChargeNote({ show_date: "x", cancelled_at: "t", cancel_charge: "charge" }), "Cancelled late — charged in full");
  assert.equal(cancelledChargeNote({ show_date: "x", cancelled_at: "t", cancel_charge: "write_off" }), null);
  assert.equal(cancelledChargeNote({ show_date: "x", cancel_charge: "charge" }), null);
});

test("office today is a Canary-time calendar date", () => {
  // 23:30 UTC on 10 Oct is 00:30 on 11 Oct in the Canaries (WEST, UTC+1).
  assert.equal(showOpsTodayIso(new Date("2026-10-10T23:30:00Z")), "2026-10-11");
  // Same instant in winter (WET, UTC+0) is still 26 Oct.
  assert.equal(showOpsTodayIso(new Date("2026-11-26T23:30:00Z")), "2026-11-26");
});
