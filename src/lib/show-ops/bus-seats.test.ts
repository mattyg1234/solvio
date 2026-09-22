import assert from "node:assert/strict";
import { test } from "node:test";

import { busLoads, parseSeatsByBus, seatsPerBus } from "./bus-seats";

test("one bus keeps every seat; two buses split evenly with the odd seat on bus 1", () => {
  assert.deepEqual(seatsPerBus({ seats_ordered: 53, bus_count: 1 }), [53]);
  assert.deepEqual(seatsPerBus({ seats_ordered: 106, bus_count: 2 }), [53, 53]);
  assert.deepEqual(seatsPerBus({ seats_ordered: 105, bus_count: 2 }), [53, 52]);
  assert.equal(seatsPerBus({ seats_ordered: null, bus_count: 2 }), null);
});

test("an explicit split wins over the even share, but only when it matches the bus count", () => {
  assert.deepEqual(seatsPerBus({ seats_ordered: 100, bus_count: 2, seats_by_bus: [60, 40] }), [60, 40]);
  assert.deepEqual(seatsPerBus({ seats_ordered: 100, bus_count: 2, seats_by_bus: [100] }), [50, 50]);
});

test("Gran Canaria: pax land on the coach their stop belongs to, seats free per coach", () => {
  const stops = [
    { id: "a", bus_no: 1 },
    { id: "b", bus_no: 1 },
    { id: "c", bus_no: 2 },
  ];
  const loads = busLoads({ seats_ordered: 106, bus_count: 2 }, stops, { a: 20, b: 18, c: 40 });
  assert.deepEqual(loads.map((l) => [l.bus, l.pax, l.seats, l.free, l.stops]), [
    [1, 38, 53, 15, 2],
    [2, 40, 53, 13, 1],
  ]);
});

test("guests with no stop yet sit on bus 1; a stop marked bus 2 forces two loads even with no order", () => {
  const loads = busLoads(null, [{ id: "a", bus_no: 2 }], { a: 10 }, 5);
  assert.equal(loads.length, 2);
  assert.equal(loads[0].pax, 5);
  assert.equal(loads[1].pax, 10);
  assert.equal(loads[0].seats, null);
  assert.equal(loads[1].free, null);
});

test("the order form's per-bus seats parse only when every bus has a number", () => {
  const form = new Map<string, string>([["seats_bus_1", "53"], ["seats_bus_2", "48"]]);
  assert.deepEqual(parseSeatsByBus((k) => form.get(k), 2), [53, 48]);
  assert.equal(parseSeatsByBus((k) => form.get(k), 1), null);
  form.delete("seats_bus_2");
  assert.equal(parseSeatsByBus((k) => form.get(k), 2), null);
});
