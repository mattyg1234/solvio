import assert from "node:assert/strict";
import { test } from "node:test";

import { parseStopRunsOn, pickupStopOffered, stopRunsOnDate } from "./bus";

test("parses printed weekday labels from the TFS sheet", () => {
  assert.deepEqual(parseStopRunsOn("Tue,Fri"), [2, 5]);
  assert.deepEqual(parseStopRunsOn("TUESDAY & FRIDAY"), [2, 5]);
  assert.deepEqual(parseStopRunsOn("Monday"), [1]);
  assert.deepEqual(parseStopRunsOn("MONDAY"), [1]);
  assert.deepEqual(parseStopRunsOn(null), []);
});

test("undated stops appear every night; dated stops only on their days", () => {
  assert.equal(stopRunsOnDate(null, "2026-08-17"), true); // Monday
  assert.equal(stopRunsOnDate("Mon", "2026-08-17"), true);
  assert.equal(stopRunsOnDate("Mon", "2026-08-18"), false); // Tuesday
  assert.equal(stopRunsOnDate("Tue,Fri", "2026-08-18"), true);
  assert.equal(stopRunsOnDate("Tue,Fri", "2026-08-21"), true); // Friday
  assert.equal(stopRunsOnDate("Tue,Fri", "2026-08-17"), false);
  assert.equal(stopRunsOnDate("Tue,Fri", ""), true);
});

test("pickup dropdown keeps the selected stop and hides other islands / off-days", () => {
  const west = { id: "w", island: "Tenerife", runs_on: "Tue,Fri" };
  const golf = { id: "g", island: "Tenerife", runs_on: "Mon" };
  const pb = { id: "p", island: "Lanzarote", runs_on: null };
  assert.equal(pickupStopOffered(west, { island: "Tenerife", showDate: "2026-08-18" }), true);
  assert.equal(pickupStopOffered(golf, { island: "Tenerife", showDate: "2026-08-18" }), false);
  assert.equal(pickupStopOffered(golf, { island: "Tenerife", showDate: "2026-08-18", selectedId: "g" }), true);
  assert.equal(pickupStopOffered(pb, { island: "Tenerife", showDate: "2026-08-18" }), false);
  assert.equal(pickupStopOffered(pb, { island: "Lanzarote", showDate: "2026-08-18" }), true);
});
