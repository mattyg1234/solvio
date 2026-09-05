import assert from "node:assert/strict";
import { test } from "node:test";
import { validatePartnerTicketPhoto, assertOwnTicketBooking } from "./partner-ticket-photo";
test("ticket upload is confined to the authenticated creator even for partner admins", () => {
  const ctx = { businessId: "b", supplierId: "s", userId: "u" };
  const row = { business_id: "b", supplier_id: "s", created_by: "u", cancelled_at: null };
  assert.doesNotThrow(() => assertOwnTicketBooking(ctx, row));
  for (const wrong of [{...row, created_by:"other"}, {...row, supplier_id:"other"}, {...row, business_id:"other"}, {...row, cancelled_at:"today"}]) assert.throws(() => assertOwnTicketBooking(ctx, wrong));
});
test("photos reject empty, oversized and spoofed image content", async () => {
  for (const file of [new File([], "empty.png", {type:"image/png"}), new File([new Uint8Array(5242881)], "big.jpg", {type:"image/jpeg"}), new File(["<svg>bad</svg>"], "fake.png", {type:"image/png"}), new File(["text"], "text.txt", {type:"text/plain"})]) {
    await assert.rejects(validatePartnerTicketPhoto(file));
  }
});
test("a real PNG photo is accepted with its original bytes", async () => {
  const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=", "base64");
  const result = await validatePartnerTicketPhoto(new File([bytes], "ticket.png", {type:"image/png"}));
  assert.equal(result.extension, "png"); assert.deepEqual(result.bytes, bytes);
});
