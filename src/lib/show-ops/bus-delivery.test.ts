import assert from "node:assert/strict";
import { test } from "node:test";
import { deliverBusList } from "./bus-delivery";
const input = {
  date: "2026-09-05",
  bookingIds: ["booking"],
  recipient: "guide@example.com",
};
test("blocked bus email never builds or sends guest information", async () => {
  await assert.rejects(
    deliverBusList(input, {
      allowed: () => false,
      build: async () => {
        throw new Error("should not build");
      },
      send: async () => {
        throw new Error("should not send");
      },
    }),
    /test mode/,
  );
});
test("bus email provider failure remains a retryable error", async () => {
  await assert.rejects(
    deliverBusList(input, {
      allowed: () => true,
      build: async () => new Uint8Array([1, 2]),
      send: async () => ({ ok: false, message: "transport failed" }),
    }),
    /not sent.*transport failed/,
  );
});
test("bus email attaches the freshly built PDF on success", async () => {
  await deliverBusList(input, {
    allowed: () => true,
    build: async () => new Uint8Array([1, 2]),
    send: async (file) => {
      assert.equal(file.filename, "bus-list-2026-09-05.pdf");
      assert.equal(file.content, "AQI=");
      return { ok: true };
    },
  });
});
