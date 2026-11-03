import assert from "node:assert/strict";
import { test } from "node:test";

import {
  clickNightListSort,
  comparePartnerTypeThenSupplier,
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

test("office list order: partner type A–Z, then supplier A–Z, then surname (Joel, 3 Nov)", () => {
  const rows = [
    { sales_channel: "Tour Ops", supplier_name: "TFS Tui", guest_name: "Ann Zed" },
    { sales_channel: "MHT Web", supplier_name: "TFS Web Booking", guest_name: "Bob Young" },
    { sales_channel: "GYG", supplier_name: "TFS Get Your Guide", guest_name: "Cat Xu" },
    { sales_channel: "MHT Web", supplier_name: "ACE Web Booking", guest_name: "Dan West" },
    { sales_channel: "MHT Web", supplier_name: "ACE Web Booking", guest_name: "Eve Adams" },
  ];
  const order = [...rows].sort(comparePartnerTypeThenSupplier).map((r) => r.guest_name);
  assert.deepEqual(order, ["Cat Xu", "Eve Adams", "Dan West", "Bob Young", "Ann Zed"]);
});
