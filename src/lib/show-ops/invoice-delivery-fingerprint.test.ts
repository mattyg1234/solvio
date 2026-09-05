import assert from "node:assert/strict";
import { test } from "node:test";
import { invoiceDeliveryFingerprint, assertInvoiceDeliveryReviewed } from "./invoice-delivery-fingerprint";

test("preview fingerprint changes with invoice totals, lines, photo ownership and photo bytes", () => {
  const invoice = { id: "i1", total: 120, currency: "gbp" };
  const lines = [{ id: "l1", booking_id: "b1", amount: 120 }];
  const photos = [{ bookingId: "b1", path: "business/b1/photo.jpg", sha256: "first" }];
  const original = invoiceDeliveryFingerprint(invoice, lines, photos);
  for (const changed of [
    invoiceDeliveryFingerprint({ ...invoice, total: 121 }, lines, photos),
    invoiceDeliveryFingerprint(invoice, [{ ...lines[0], booking_id: "other" }], photos),
    invoiceDeliveryFingerprint(invoice, lines, [{ ...photos[0], sha256: "second" }]),
    invoiceDeliveryFingerprint(invoice, lines, [{ ...photos[0], path: "business/other/photo.jpg" }]),
  ]) assert.notEqual(changed, original);
  assert.equal(original, invoiceDeliveryFingerprint({ currency: "gbp", total: 120, id: "i1" }, lines, photos));
});

test("sending requires a current reviewed preview and a deliberate missing-photo acknowledgement", () => {
  const current = { expected: "version-1", actual: "version-1", reviewed: true, missingCount: 2, missingAcknowledged: true };
  assert.doesNotThrow(() => assertInvoiceDeliveryReviewed(current));
  assert.throws(() => assertInvoiceDeliveryReviewed({ ...current, actual: "version-2" }), /changed/i);
  assert.throws(() => assertInvoiceDeliveryReviewed({ ...current, expected: "" }), /changed/i);
  assert.throws(() => assertInvoiceDeliveryReviewed({ ...current, reviewed: false }), /review/i);
  assert.throws(() => assertInvoiceDeliveryReviewed({ ...current, missingAcknowledged: false }), /2.*without/i);
});
