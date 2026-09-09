import assert from "node:assert/strict";
import { test } from "node:test";

import { buildPnl, expenseTotals, holdedPurchaseFromExpense, parseExpenseForm, pickHoldedPurchaseTaxKey } from "./expenses";

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

test("expense totals round like invoices and default the workspace rate", () => {
  assert.deepEqual(expenseTotals(100, 7), { net: 100, tax: 7, total: 107 });
  assert.deepEqual(expenseTotals(33.333, 7), { net: 33.33, tax: 2.33, total: 35.66 });
  const parsed = parseExpenseForm(fd({ expense_date: "2026-09-08", supplier_name: "Guaguas SL", description: "Bus night 8 Sept", category: "transport", net_amount: "450", island: "Tenerife" }), { currency: "eur", taxRate: 7 });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.value.tax_rate, 7);
    assert.equal(parsed.value.total_amount, 481.5);
    assert.equal(parsed.value.category, "transport");
  }
});

test("expense form rejects what the accountant cannot book", () => {
  const base = { expense_date: "2026-09-08", supplier_name: "X", description: "Y", net_amount: "10" };
  assert.equal(parseExpenseForm(fd({ ...base, expense_date: "8/9/26" }), { currency: "eur", taxRate: 7 }).ok, false);
  assert.equal(parseExpenseForm(fd({ ...base, supplier_name: "" }), { currency: "eur", taxRate: 7 }).ok, false);
  assert.equal(parseExpenseForm(fd({ ...base, net_amount: "0" }), { currency: "eur", taxRate: 7 }).ok, false);
  assert.equal(parseExpenseForm(fd({ ...base, tax_rate: "150" }), { currency: "eur", taxRate: 7 }).ok, false);
  const weird = parseExpenseForm(fd({ ...base, category: "yachts", currency: "chf" }), { currency: "eur", taxRate: 7 });
  assert.equal(weird.ok && weird.value.category, "other");
  assert.equal(weird.ok && weird.value.currency, "eur");
});

test("purchase tax key prefers IGIC on the purchases side and never a sales key", () => {
  const taxes = [
    { key: "s_igic_7", name: "IGIC 7%", amount: 7, scope: "sales", legalTreatment: "igic" },
    { key: "p_iva_7", name: "IVA 7%", amount: 7, scope: "purchases", legalTreatment: "iva" },
    { key: "p_igic_7", name: "IGIC 7%", amount: 7, scope: "purchases", legalTreatment: "igic" },
  ];
  assert.equal(pickHoldedPurchaseTaxKey(taxes, 7), "p_igic_7");
  assert.equal(pickHoldedPurchaseTaxKey(taxes.filter((t) => t.key !== "p_igic_7"), 7), "p_iva_7");
  assert.equal(pickHoldedPurchaseTaxKey(taxes, 21), null);
});

test("expense → Holded purchase draft carries net, tax key, tags and the Solvio reference", () => {
  const p = holdedPurchaseFromExpense(
    { id: "e1", expense_date: "2026-09-08", supplier_name: "Guaguas SL", supplier_tax_id: null, description: "Bus night", category: "transport", island: "Tenerife", product_id: null, net_amount: 450, tax_rate: 7, tax_amount: 31.5, total_amount: 481.5, currency: "eur", notes: null },
    "c1",
    "p_igic_7",
  );
  assert.equal(p.approveDoc, false);
  assert.deepEqual(p.items, [{ name: "Bus night", units: 1, subtotal: 450, taxes: ["p_igic_7"] }]);
  assert.deepEqual(p.tags, ["solvio", "cattransport", "islandtenerife"]);
  assert.match(p.notes ?? "", /Solvio expense e1/);
  assert.equal(p.currency, undefined);
});

test("P&L: income is the partner nett, commission is the gap to gross, margin is income minus expenses", () => {
  const rows = buildPnl(
    [
      { show_date: "2026-09-05", island: "Tenerife", total_cost: 100, nett_total: 60 },
      { show_date: "2026-09-06", island: "Tenerife", total_cost: 50, nett_total: 30, cancelled_at: "2026-09-01" },
      { show_date: "2026-09-07", island: "Gran Canaria", total_cost: 80, nett_total: 40 },
      { show_date: "2026-09-08", island: "Gran Canaria", total_cost: 20, nett_total: null },
      { show_date: "2026-08-30", island: "Tenerife", total_cost: 10, nett_total: 5 },
    ],
    [
      { expense_date: "2026-09-08", island: "Tenerife", net_amount: 25 },
      { expense_date: "2026-09-08", island: null, net_amount: 5 },
    ],
  );
  assert.deepEqual(rows.map((r) => [r.month, r.island, r.gross, r.income, r.commission, r.expenses, r.margin, r.bookings]), [
    ["2026-09", "All islands", 0, 0, 0, 5, -5, 0],
    ["2026-09", "Gran Canaria", 100, 60, 40, 0, 60, 2],
    ["2026-09", "Tenerife", 100, 60, 40, 25, 35, 1],
    ["2026-08", "Tenerife", 10, 5, 5, 0, 5, 1],
  ]);
});
