import assert from "node:assert/strict";
import { test } from "node:test";

import { partnerSearchHaystack, partnerSellsOnIsland } from "./partners";

test("ALL and blank partner locations appear on every island", () => {
  assert.equal(partnerSellsOnIsland("ALL", "Tenerife"), true);
  assert.equal(partnerSellsOnIsland("all", "Lanzarote"), true);
  assert.equal(partnerSellsOnIsland("", "Lanzarote"), true);
  assert.equal(partnerSellsOnIsland(null, "Lanzarote"), true);
});

test("island-specific partners only appear on that island", () => {
  assert.equal(partnerSellsOnIsland("Tenerife", "Tenerife"), true);
  assert.equal(partnerSellsOnIsland("Tenerife", "Lanzarote"), false);
  assert.equal(partnerSellsOnIsland("Lanzarote", "Tenerife"), false);
});

test("no show island means every partner is listed", () => {
  assert.equal(partnerSellsOnIsland("Tenerife", ""), true);
  assert.equal(partnerSellsOnIsland("Tenerife", null), true);
});

test("search haystack includes type and location", () => {
  const hay = partnerSearchHaystack({
    name: "TFS Web Booking",
    partner_type: "MHT Web",
    island: "Tenerife",
  });
  assert.ok(hay.includes("web booking"));
  assert.ok(hay.includes("mht web"));
  assert.ok(hay.includes("tenerife"));
});
