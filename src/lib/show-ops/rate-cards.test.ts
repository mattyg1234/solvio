import assert from "node:assert/strict";
import { test } from "node:test";

import { pickRatePrice, type RatePriceRow } from "./rate-cards";

const rows: RatePriceRow[] = [
  { product_id: "ace", tipo: 1, no_transport: false, adult_price: "59.00", child_price: "49.00" },
  { product_id: "ace", tipo: 1, no_transport: true, adult_price: "49.00", child_price: "39.00" },
  { product_id: "nye", tipo: 2, no_transport: false, adult_price: 70, child_price: 60 },
  { product_id: "nye", tipo: 1, no_transport: false, adult_price: 69, child_price: 59 },
  { product_id: "nye", tipo: 0, no_transport: false, adult_price: 65, child_price: 55 },
  { product_id: "broken", tipo: 1, no_transport: false, adult_price: null, child_price: 10 },
];

test("pickRatePrice takes the row for the show and bus choice", () => {
  assert.deepEqual(pickRatePrice(rows, "ace", true, { id: "r1", name: "TFS Reception" }), {
    rate_id: "r1", rate_name: "TFS Reception", tipo: 1, adult_price: 59, child_price: 49,
  });
  assert.equal(pickRatePrice(rows, "ace", false)?.adult_price, 49);
});

test("pickRatePrice prefers tipo 1, then the lowest tipo", () => {
  assert.equal(pickRatePrice(rows, "nye", true)?.adult_price, 69);
  const noTipo1 = rows.filter((r) => !(r.product_id === "nye" && r.tipo === 1));
  assert.equal(pickRatePrice(noTipo1, "nye", true)?.adult_price, 65);
});

test("pickRatePrice returns null when the card has no usable row", () => {
  assert.equal(pickRatePrice(rows, "ace-no-such", true), null);
  assert.equal(pickRatePrice(rows, "nye", false), null); // no without-bus row
  assert.equal(pickRatePrice(rows, "broken", true), null); // half a price is no price
  assert.equal(pickRatePrice([], "ace", true), null);
  assert.equal(pickRatePrice(rows, null, true), null);
});
