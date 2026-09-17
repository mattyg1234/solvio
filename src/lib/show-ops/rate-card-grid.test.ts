import assert from "node:assert/strict";
import { test } from "node:test";

import { buildRateGrid, rateGridChanges, rateGridField } from "./rate-card-grid";
import type { RatePriceRow } from "./rate-cards";

const products = [
  { id: "p-live", name: "Live show", active: true },
  { id: "p-old", name: "Archived priced", active: false },
  { id: "p-dead", name: "Archived unpriced", active: false },
];

const rows: RatePriceRow[] = [
  { product_id: "p-live", tipo: 2, no_transport: false, adult_price: "99", child_price: "99" },
  { product_id: "p-live", tipo: 1, no_transport: false, adult_price: "48.30", child_price: "41.30" },
  { product_id: "p-live", tipo: 1, no_transport: true, adult_price: "41.30", child_price: "34.30" },
  { product_id: "p-old", tipo: 1, no_transport: false, adult_price: "79", child_price: "59" },
];

test("grid shows the row pricing reads (tipo 1 wins) and hides unpriced archived shows", () => {
  const grid = buildRateGrid(products, rows);
  assert.deepEqual(grid.map((g) => g.product_id), ["p-live", "p-old"]);
  assert.deepEqual(grid[0].bus, { adult: 48.3, child: 41.3 });
  assert.deepEqual(grid[0].noBus, { adult: 41.3, child: 34.3 });
  assert.deepEqual(grid[1].noBus, { adult: null, child: null });
});

function form(values: Record<string, string>) {
  return (field: string) => (field in values ? values[field] : null);
}

function unchangedForm(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const g of buildRateGrid(products, rows)) {
    for (const nt of [false, true]) {
      const cell = nt ? g.noBus : g.bus;
      out[rateGridField("adult", g.product_id, nt)] = cell.adult === null ? "" : String(cell.adult);
      out[rateGridField("child", g.product_id, nt)] = cell.child === null ? "" : String(cell.child);
    }
  }
  return out;
}

test("an untouched form changes nothing", () => {
  const grid = buildRateGrid(products, rows);
  assert.deepEqual(rateGridChanges(grid, form(unchangedForm())), { changes: [], error: null });
});

test("only edited cells come back — new price, comma decimals, and a cleared cell", () => {
  const grid = buildRateGrid(products, rows);
  const values = unchangedForm();
  values[rateGridField("adult", "p-live", false)] = "50,5";
  values[rateGridField("adult", "p-live", true)] = "";
  values[rateGridField("child", "p-live", true)] = "";
  values[rateGridField("adult", "p-old", true)] = "70";
  values[rateGridField("child", "p-old", true)] = "50";
  const { changes, error } = rateGridChanges(grid, form(values));
  assert.equal(error, null);
  assert.deepEqual(changes, [
    { product_id: "p-live", no_transport: false, adult_price: 50.5, child_price: 41.3 },
    { product_id: "p-live", no_transport: true, adult_price: null, child_price: null },
    { product_id: "p-old", no_transport: true, adult_price: 70, child_price: 50 },
  ]);
});

test("half-filled or junk cells are refused, nothing is saved", () => {
  const grid = buildRateGrid(products, rows);
  const half = unchangedForm();
  half[rateGridField("child", "p-live", false)] = "";
  assert.match(rateGridChanges(grid, form(half)).error ?? "", /both the adult and child/);
  const junk = unchangedForm();
  junk[rateGridField("adult", "p-live", false)] = "-4";
  assert.match(rateGridChanges(grid, form(junk)).error ?? "", /must be a number/);
});

test("shows missing from the submitted form are left alone", () => {
  const grid = buildRateGrid(products, rows);
  assert.deepEqual(rateGridChanges(grid, form({})), { changes: [], error: null });
});
