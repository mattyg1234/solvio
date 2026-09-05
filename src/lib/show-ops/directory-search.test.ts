import assert from "node:assert/strict";
import { test } from "node:test";
import {
  matchesDirectorySearch,
  normaliseDirectorySearch,
  hotelNamesForStops,
} from "./directory-search";
test("hotel and pickup searches match accents, punctuation and words in any order", () => {
  assert.equal(
    matchesDirectorySearch("sol puerto", "Sol — Puerto de la Cruz"),
    true,
  );
  assert.equal(
    matchesDirectorySearch("jose tenerife", "Hotel José · Tenerife"),
    true,
  );
  assert.equal(
    matchesDirectorySearch(
      "h10 playa",
      "H10 Conquistador",
      "Playa de las Américas",
    ),
    true,
  );
  assert.equal(matchesDirectorySearch("missing", "Hotel José"), false);
  assert.equal(normaliseDirectorySearch("  JOSÉ—Playa  "), "jose playa");
});
test("a hotel name finds its mapped pickup, retaining all names at shared stops", () => {
  const names = hotelNamesForStops([
    { name: "Hotel José", bus_stop_id: "s" },
    { name: "Sun Palace", bus_stop_id: "s" },
    { name: "Unassigned", bus_stop_id: null },
  ]);
  assert.deepEqual(names, { s: ["Hotel José", "Sun Palace"] });
  assert.equal(
    matchesDirectorySearch("jose", "Main road", ...(names.s ?? [])),
    true,
  );
});
