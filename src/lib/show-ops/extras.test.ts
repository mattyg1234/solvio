import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calculateExtras,
  parseExtraSelections,
  sameExtraSelection,
  type ShowExtra,
} from "./extras";
import { computeBookingMoney } from "./calc";
const catalogue: ShowExtra[] = [
  {
    id: "meal",
    business_id: "b",
    product_id: "p",
    name: "Meal",
    description: null,
    unit_price: 10,
    charge_basis: "per_person",
    commissionable: true,
    active: true,
  },
  {
    id: "photo",
    business_id: "b",
    product_id: "p",
    name: "Photo",
    description: null,
    unit_price: 20,
    charge_basis: "per_booking",
    commissionable: false,
    active: true,
  },
];
test("extras use catalogue prices, all passengers, and commissionable nett only", () => {
  const lines = calculateExtras(
    catalogue,
    [
      { id: "meal", quantity: 99 },
      { id: "photo", quantity: 99 },
    ],
    3,
    80,
  );
  assert.equal(lines[0].quantity, 3);
  assert.equal(lines[0].gross_total, 30);
  assert.equal(lines[0].nett_total, 24);
  assert.equal(lines[1].quantity, 1);
  assert.equal(lines[1].nett_total, 20);
  const money = computeBookingMoney({
    adults: 2,
    children: 1,
    infants: 0,
    product: null,
    supplier: {
      billing_mode: "deposit",
      deposit_percent: 30,
      invoice_nett_percent: 80,
    },
    extras: lines,
  });
  assert.equal(money.total_cost, 50);
  assert.equal(money.nett_total, 44);
  assert.equal(money.deposit_amount, 15);
  assert.deepEqual(money.pricing_snapshot.extras, lines);
  assert.equal(money.adult_nett_total, 0);
});
test("extras reject malformed, duplicated, unknown, inactive and invalid quantity selections", () => {
  for (const raw of [
    "{}",
    '[{"id":"meal","quantity":0}]',
    '[{"id":"meal","quantity":1.5}]',
    '[{"id":"meal","quantity":101}]',
    '[{"id":"meal","quantity":1},{"id":"meal","quantity":1}]',
  ])
    assert.throws(() => parseExtraSelections(raw));
  assert.throws(() =>
    calculateExtras(catalogue, [{ id: "wrong", quantity: 1 }], 2, 80),
  );
  assert.throws(() =>
    calculateExtras(
      [{ ...catalogue[0], active: false }],
      [{ id: "meal", quantity: 1 }],
      2,
      80,
    ),
  );
});
test("selection comparison ignores catalogue price/name changes but detects quantity changes", () => {
  assert.equal(
    sameExtraSelection(
      [{ id: "meal", quantity: 2 }],
      [{ id: "meal", quantity: 2 }],
    ),
    true,
  );
  assert.equal(
    sameExtraSelection(
      [{ id: "meal", quantity: 2 }],
      [{ id: "meal", quantity: 3 }],
    ),
    false,
  );
});

test("invoice totals include paid infants and extras without changing adult or child components", () => {
  const extras = calculateExtras(
    catalogue,
    [{ id: "photo", quantity: 1 }],
    3,
    80,
  );
  const money = computeBookingMoney({
    adults: 1,
    children: 1,
    infants: 1,
    product: {
      adult_price: 100,
      child_price: 50,
      infant_price: 10,
      adult_nett: null,
      child_nett: null,
      adult_price_no_transport: null,
      child_price_no_transport: null,
      infant_price_no_transport: null,
    },
    supplier: {
      billing_mode: "invoice",
      deposit_percent: 30,
      invoice_nett_percent: 80,
    },
    extras,
  });
  assert.equal(money.total_cost, 180);
  assert.equal(money.adult_nett_total, 80);
  assert.equal(money.child_nett_total, 40);
  assert.equal(money.infant_nett_total, 8);
  assert.equal(money.nett_total, 148);
  assert.equal(money.deposit_amount, 0);
});
test("quantity extras use explicit counts and reject client-supplied price data", () => {
  const item = {
    ...catalogue[0],
    charge_basis: "quantity" as const,
    unit_price: 3.99,
  };
  const parsed = parseExtraSelections(
    '[{"id":"meal","quantity":3,"unit_price":0,"gross_total":0}]',
  );
  const lines = calculateExtras([item], parsed, 9, 85);
  assert.equal(lines[0].gross_total, 11.97);
  assert.equal(lines[0].nett_total, 10.17);
  assert.equal(lines[0].quantity, 3);
});
test("archived extras are available only for explicit historical recalculation", () => {
  const item = { ...catalogue[0], active: false };
  assert.equal(
    calculateExtras([item], [{ id: item.id, quantity: 1 }], 2, 80, {
      allowArchived: true,
    })[0].gross_total,
    20,
  );
});

test("per-person extras support a 350-person show while manual quantities stay limited", () => {
 const lines=calculateExtras(catalogue,[{id:"meal",quantity:1}],350,80);
 assert.equal(lines[0].quantity,350);assert.equal(lines[0].gross_total,3500);
 const restored=lines.map((line)=>({id:line.id,quantity:line.charge_basis==="quantity"?line.quantity:1}));
 assert.deepEqual(calculateExtras(catalogue,restored,350,80),lines);
 assert.throws(()=>parseExtraSelections([{id:"meal",quantity:350}]));
});
