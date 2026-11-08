import assert from "node:assert/strict";
import test from "node:test";

import { lastYearDate, lastYearIsland, lastYearPaxByNight, parseLastYearCsv, yearOnYearPct } from "@/lib/show-ops/last-year";

test("dates: ISO and UK day-first", () => {
  assert.equal(lastYearDate("2025-11-08"), "2025-11-08");
  assert.equal(lastYearDate("08/11/2025"), "2025-11-08");
  assert.equal(lastYearDate("8/11/25"), "2025-11-08");
  assert.equal(lastYearDate("31/02/2025"), null);
});

test("islands: office codes", () => {
  assert.equal(lastYearIsland("ACE"), "Lanzarote");
  assert.equal(lastYearIsland("lpa"), "Gran Canaria");
  assert.equal(lastYearIsland("Tenerife"), "Tenerife");
  assert.equal(lastYearIsland("Mars"), null);
});

test("csv with header in any order, sums repeats, reports bad lines", () => {
  const { rows, skipped } = parseLastYearCsv("Island,Pax,Date\nACE,80,07/11/2025\nACE,2,07/11/2025\nTFS,105,07/11/2025\nxx,1,07/11/2025\n");
  assert.deepEqual(rows, [
    { show_date: "2025-11-07", island: "Lanzarote", pax: 82 },
    { show_date: "2025-11-07", island: "Tenerife", pax: 105 },
  ]);
  assert.deepEqual(skipped, [5]);
});

test("csv without header", () => {
  assert.deepEqual(parseLastYearCsv("2025-11-07,Lanzarote,82").rows, [{ show_date: "2025-11-07", island: "Lanzarote", pax: 82 }]);
});

test("imported figure wins for its night and island, Hub fills the rest", () => {
  const m = lastYearPaxByNight(
    [
      { show_date: "2025-11-07", island: "Lanzarote", pax: 5 },
      { show_date: "2025-11-07", island: "Tenerife", pax: 10 },
    ],
    [{ show_date: "2025-11-07", island: "Lanzarote", pax: 82 }],
  );
  assert.equal(m.get("2025-11-07"), 92);
});

test("year on year percent", () => {
  assert.equal(yearOnYearPct(110, 100), 10);
  assert.equal(yearOnYearPct(90, 100), -10);
  assert.equal(yearOnYearPct(90, 0), null);
});
