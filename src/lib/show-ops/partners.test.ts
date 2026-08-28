import assert from "node:assert/strict";
import { test } from "node:test";

import {
  normalisePartnerIslands,
  partnerIslands,
  partnerSearchHaystack,
  partnerSellsOnIsland,
} from "./partners";

test("a partner selling two islands shows up on both desks", () => {
  const both = "Tenerife, Gran Canaria";
  assert.equal(partnerSellsOnIsland(both, "Tenerife"), true);
  assert.equal(partnerSellsOnIsland(both, "Gran Canaria"), true);
  assert.equal(partnerSellsOnIsland(both, "Lanzarote"), false);
});

test("ALL and blank still sell everywhere", () => {
  assert.equal(partnerSellsOnIsland("ALL", "Gran Canaria"), true);
  assert.equal(partnerSellsOnIsland("", "Gran Canaria"), true);
  assert.equal(partnerSellsOnIsland(null, "Gran Canaria"), true);
});

test("a single stored location keeps working exactly as before", () => {
  assert.equal(partnerSellsOnIsland("Lanzarote", "Lanzarote"), true);
  assert.equal(partnerSellsOnIsland("Lanzarote", "Tenerife"), false);
});

test("islands parse into a clean list", () => {
  assert.deepEqual(partnerIslands("Tenerife,  Gran Canaria ,"), ["Tenerife", "Gran Canaria"]);
  assert.deepEqual(partnerIslands(null), []);
});

test("ALL swallows everything else when saving", () => {
  assert.equal(normalisePartnerIslands(["Tenerife", "ALL"]), "ALL");
  assert.equal(normalisePartnerIslands([]), "ALL");
  assert.equal(normalisePartnerIslands(["Tenerife", "Tenerife", "Gran Canaria"]), "Tenerife, Gran Canaria");
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

test("search haystack also matches invoice email and NIF", () => {
  const hay = partnerSearchHaystack({
    name: "Island Agency",
    partner_type: "agency",
    island: "Gran Canaria",
    email: "cuentas@islandagency.es",
    tax_id: "B76543210",
  });
  assert.ok(hay.includes("cuentas@islandagency.es"));
  assert.ok(hay.includes("b76543210"));
});
