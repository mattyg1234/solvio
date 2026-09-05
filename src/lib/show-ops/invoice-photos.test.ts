import assert from "node:assert/strict";
import { test } from "node:test";
import { loadInvoicePhotos, type InvoicePhotoStorage } from "./invoice-photos";

const business = "business-1";
const seller = "seller-1";
const booking = { id: "booking-1", business_id: business, supplier_id: seller, booking_ref: "BK/42", guest_name: "Guest", no_show_proof_path: "business-1/booking-1/photo.png" };
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9xkAAAAASUVORK5CYII=", "base64");
function storage(data: Blob | null = new Blob([png], { type: "image/png" }), error: unknown = null) {
  const calls: string[] = [];
  return { calls, client: { from(bucket: string) { assert.equal(bucket, "show-ops-proofs"); return { async download(path: string) { calls.push(path); return { data, error }; } }; } } as InvoicePhotoStorage };
}

test("paper-ticket bytes are attached with safe booking filenames and no external URL fetch", async () => {
  const stub = storage();
  const result = await loadInvoicePhotos(stub.client, business, seller, [booking]);
  assert.equal(result.photos.length, 1);
  assert.deepEqual(Buffer.from(result.photos[0].content, "base64"), png);
  assert.equal(result.photos[0].mimeType, "image/png");
  assert.match(result.photos[0].filename, /^ticket-BK-42-booking-1\.png$/);
  assert.deepEqual(stub.calls, [booking.no_show_proof_path]);
});

test("cross-business, cross-seller and forged booking paths fail before any download", async () => {
  for (const patch of [
    { supplier_id: "other-seller" }, { business_id: "other-business" },
    { no_show_proof_path: "https://example.com/photo.png" }, { no_show_proof_path: "business-1/other-booking/photo.png" },
    { no_show_proof_path: "business-1/booking-1/../photo.png" }, { no_show_proof_path: "business-1/booking-1/%2e%2e.png" },
  ]) {
    const stub = storage();
    await assert.rejects(loadInvoicePhotos(stub.client, business, seller, [{ ...booking, ...patch }]), /belong|path/i);
    assert.equal(stub.calls.length, 0);
  }
});

test("missing photos are counted but download errors, MIME mismatch and oversized files fail closed", async () => {
  const missing = await loadInvoicePhotos(storage().client, business, seller, [{ ...booking, no_show_proof_path: null }]);
  assert.equal(missing.missing.length, 1);
  await assert.rejects(loadInvoicePhotos(storage(null, new Error("missing")).client, business, seller, [booking]), /download/i);
  await assert.rejects(loadInvoicePhotos(storage(new Blob([png], { type: "image/jpeg" })).client, business, seller, [booking]), /type/i);
  await assert.rejects(loadInvoicePhotos(storage(new Blob(["not an image"], { type: "image/png" })).client, business, seller, [booking]), /type|image/i);
  await assert.rejects(loadInvoicePhotos(storage(new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: "image/png" })).client, business, seller, [booking]), /5 MB/i);
});

test("attachment counts and aggregate bytes stop oversized deliveries", async () => {
  const many = Array.from({ length: 51 }, (_, i) => ({ ...booking, id: `booking-${i}`, no_show_proof_path: `business-1/booking-${i}/photo.png` }));
  const stub = storage();
  await assert.rejects(loadInvoicePhotos(stub.client, business, seller, many), /50/);
  assert.equal(stub.calls.length, 0);
  const padded = Buffer.alloc(5 * 1024 * 1024); png.copy(padded);
  await assert.rejects(loadInvoicePhotos(storage(new Blob([padded], { type: "image/png" })).client, business, seller, many.slice(0, 4)), /attachment limit/);
});
