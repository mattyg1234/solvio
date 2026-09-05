import { test } from "node:test";
import assert from "node:assert/strict";
import { applyTicketType, parseTicketTypeFields } from "./ticket-types";
test("child price overrides retain the parent identity and never enable parent-disabled transport", () => {
  const parent = {
    id: "p",
    name: "Show",
    transport_available: false,
    adult_price: 10,
  };
  const child = {
    id: "t",
    product_id: "p",
    name: "VIP",
    adult_price: 50,
    transport_available: true,
  };
  const result = applyTicketType(parent, child as never);
  assert.equal(result.id, "p");
  assert.equal(result.adult_price, 50);
  assert.equal(result.transport_available, false);
  assert.equal(result.name, "Show · VIP");
});
test("prices reject negative and nonfinite amounts, optional blank values stay null", () => {
  const fd = new FormData();
  fd.set("name", "VIP");
  fd.set("adult_price", "20");
  fd.set("child_price", "10");
  fd.set("infant_price", "0");
  assert.equal(parseTicketTypeFields(fd).adult_nett, null);
  for (const bad of ["-1", "NaN", "Infinity", "bad"]) {
    fd.set("adult_price", bad);
    assert.throws(() => parseTicketTypeFields(fd));
  }
});

test("base ticket remains unchanged and selected type never imports a different capacity or schedule", () => {
  const parent = {
    id: "p",
    name: "Show",
    transport_available: true,
    adult_price: 10,
    capacity: 100,
    run_weekdays: [1, 3],
  };
  assert.equal(applyTicketType(parent, null), parent);
  const result = applyTicketType(parent, {
    id: "t",
    product_id: "p",
    name: "VIP",
    adult_price: 50,
    transport_available: true,
    capacity: 5,
    run_weekdays: [2],
  } as never);
  assert.equal(result.capacity, 100);
  assert.deepEqual(result.run_weekdays, [1, 3]);
  assert.equal(result.id, "p");
});
test("zero optional prices and explicit disabled transport survive validation", () => {
  const fd = new FormData();
  for (const name of [
    "adult_price",
    "child_price",
    "infant_price",
    "adult_nett",
    "adult_price_no_transport",
  ])
    fd.set(name, "0");
  fd.set("name", "Child");
  fd.set("transport_available", "0");
  const fields = parseTicketTypeFields(fd);
  assert.equal(fields.adult_nett, 0);
  assert.equal(fields.adult_price_no_transport, 0);
  assert.equal(fields.transport_available, false);
});

test("editing notes preserves the booked ticket name and never replaces its price snapshot", async () => {
  const { ticketBookingSnapshotPatch } = await import("./ticket-types");
  const existing = { show_name: "Show · VIP", ticket_type_name: "VIP" };
  const fresh = {
    show_name: "Show · Renamed VIP",
    ticket_type_name: "Renamed VIP",
    pricing_snapshot: { adult_price: 999 },
  };
  assert.deepEqual(
    ticketBookingSnapshotPatch(existing, fresh, false),
    existing,
  );
  assert.deepEqual(ticketBookingSnapshotPatch(existing, fresh, true), fresh);
});

test("unchanged historical bus booking remains editable after type transport is disabled", async () => {
  const { ticketTransportAvailable } = await import("./ticket-types");
  const existing = {
    product_id: "p",
    ticket_type_id: "t",
    transport_required: true,
  };
  assert.equal(ticketTransportAvailable(false, "p", "t", existing), true);
  assert.equal(
    ticketTransportAvailable(false, "p", "t", {
      ...existing,
      transport_required: false,
    }),
    false,
  );
  assert.equal(ticketTransportAvailable(false, "other", "t", existing), false);
  assert.equal(ticketTransportAvailable(false, "p", "other", existing), false);
  assert.equal(ticketTransportAvailable(false, "p", "t"), false);
});
