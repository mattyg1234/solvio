import assert from "node:assert/strict";
import { test } from "node:test";

import {
  clickNightListSort,
  parseNightListSort,
  parseNightListViews,
  toggleNightListView,
} from "./lists";

test("views: tab and diet still open the right list", () => {
  assert.deepEqual(parseNightListViews({ tab: "bus" }), ["bus"]);
  assert.deepEqual(parseNightListViews({ diet: "1" }), ["meals"]);
  assert.deepEqual(parseNightListViews({ views: "office,door" }), ["office", "door"]);
});

test("views: click another list adds it, click again removes it", () => {
  const two = toggleNightListView(["office"], "bus");
  assert.deepEqual(two, ["office", "bus"]);
  assert.deepEqual(toggleNightListView(two, "bus"), ["office"]);
  assert.deepEqual(toggleNightListView(["office"], "office"), ["office"]);
});

test("sort: extra clicks stack columns", () => {
  assert.deepEqual(parseNightListSort("hotel,name", ["supplier"]), ["hotel", "name"]);
  assert.deepEqual(clickNightListSort(["supplier"], "name"), ["name", "supplier"]);
  assert.deepEqual(clickNightListSort(["name", "supplier"], "hotel"), ["hotel", "name", "supplier"]);
});
