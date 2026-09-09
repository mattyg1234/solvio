import { round2 } from "@/lib/show-ops/calc";
import { holdedTag, unixDay, type HoldedItem, type HoldedTax } from "@/lib/show-ops/holded";

export const EXPENSE_CATEGORIES = [
  ["transport", "Buses & transport"],
  ["food", "Food & drink"],
  ["venue", "Venue & rent"],
  ["staff", "Staff & artists"],
  ["marketing", "Marketing & reps"],
  ["utilities", "Utilities & insurance"],
  ["fees", "Fees & software"],
  ["other", "Other"],
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number][0];

export type ExpenseInput = {
  expense_date: string;
  supplier_name: string;
  supplier_tax_id: string | null;
  description: string;
  category: ExpenseCategory;
  island: string | null;
  product_id: string | null;
  net_amount: number;
  tax_rate: number;
  tax_amount: number;
  total_amount: number;
  currency: "eur" | "gbp" | "usd";
  notes: string | null;
};

const num = (v: unknown, fallback = 0) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
};

/** Net + rate → tax and total, rounded the way the invoice module rounds. */
export function expenseTotals(net: number, rate: number): { net: number; tax: number; total: number } {
  const n = round2(Math.max(0, num(net)));
  const r = Math.max(0, num(rate));
  const tax = round2(n * (r / 100));
  return { net: n, tax, total: round2(n + tax) };
}

export function parseExpenseForm(fd: FormData, defaults: { currency: "eur" | "gbp" | "usd"; taxRate: number }): { ok: true; value: ExpenseInput } | { ok: false; error: string } {
  const expense_date = String(fd.get("expense_date") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expense_date)) return { ok: false, error: "Pick the date of the expense." };
  const supplier_name = String(fd.get("supplier_name") ?? "").trim().slice(0, 120);
  if (!supplier_name) return { ok: false, error: "Who was paid? Enter the supplier." };
  const description = String(fd.get("description") ?? "").trim().slice(0, 200);
  if (!description) return { ok: false, error: "Say what the expense was for." };
  const categoryRaw = String(fd.get("category") ?? "other");
  const category = (EXPENSE_CATEGORIES.some(([k]) => k === categoryRaw) ? categoryRaw : "other") as ExpenseCategory;
  const net = num(fd.get("net_amount"), NaN);
  if (!Number.isFinite(net) || net <= 0) return { ok: false, error: "Enter the amount before tax." };
  const rateRaw = fd.get("tax_rate");
  const rate = rateRaw == null || String(rateRaw).trim() === "" ? defaults.taxRate : num(rateRaw, NaN);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) return { ok: false, error: "Tax rate must be between 0 and 100." };
  const totals = expenseTotals(net, rate);
  const cur = String(fd.get("currency") ?? defaults.currency);
  const currency = cur === "gbp" || cur === "usd" || cur === "eur" ? cur : defaults.currency;
  const island = String(fd.get("island") ?? "").trim() || null;
  const product_id = String(fd.get("product_id") ?? "").trim() || null;
  return {
    ok: true,
    value: {
      expense_date,
      supplier_name,
      supplier_tax_id: String(fd.get("supplier_tax_id") ?? "").trim().toUpperCase().slice(0, 20) || null,
      description,
      category,
      island,
      product_id,
      net_amount: totals.net,
      tax_rate: rate,
      tax_amount: totals.tax,
      total_amount: totals.total,
      currency,
      notes: String(fd.get("notes") ?? "").trim().slice(0, 600) || null,
    },
  };
}

/** Holded purchase-side tax key for a rate: IGIC purchases first, else any purchase key at that rate. */
export function pickHoldedPurchaseTaxKey(taxes: HoldedTax[], rate: number): string | null {
  const wanted = round2(num(rate));
  const purchases = taxes.filter((t) => (t.scope ?? "") === "purchases" && round2(num(t.amount)) === wanted);
  if (!purchases.length) return null;
  return (purchases.find((t) => t.legalTreatment === "igic") ?? purchases.find((t) => /^p_/.test(t.key)) ?? purchases[0]).key;
}

export type HoldedPurchaseInput = {
  contactId: string;
  desc: string;
  date: number;
  items: HoldedItem[];
  notes?: string;
  tags?: string[];
  approveDoc: false;
  currency?: string;
};

export function holdedPurchaseFromExpense(
  e: ExpenseInput & { id: string },
  contactId: string,
  taxKey: string | null,
): HoldedPurchaseInput {
  const tags = ["solvio", holdedTag(`cat ${e.category}`)];
  if (e.island) tags.push(holdedTag(`island ${e.island}`));
  const item: HoldedItem = { name: e.description.slice(0, 120), units: 1, subtotal: e.net_amount, ...(taxKey ? { taxes: [taxKey] } : { tax: e.tax_rate }) };
  const input: HoldedPurchaseInput = {
    contactId,
    desc: `${e.supplier_name} · ${e.expense_date}`,
    date: unixDay(e.expense_date),
    items: [item],
    notes: [e.notes?.trim(), `Solvio expense ${e.id}`].filter(Boolean).join("\n"),
    tags,
    approveDoc: false,
  };
  if (e.currency !== "eur") input.currency = e.currency;
  return input;
}

export type PnlRow = { month: string; island: string; revenue: number; nett_to_partners: number; expenses: number; margin: number; bookings: number };

/**
 * Per-month, per-island P&L from what Solvio already knows: ticket revenue and
 * partner nett from bookings, costs from expenses. Costs with no island are
 * shown under "All islands" rather than guessed.
 */
export function buildPnl(
  bookings: Array<{ show_date: string; island: string | null; total_cost: number | string | null; nett_total: number | string | null; cancelled_at?: string | null }>,
  expenses: Array<{ expense_date: string; island: string | null; net_amount: number | string | null }>,
): PnlRow[] {
  const rows = new Map<string, PnlRow>();
  const get = (month: string, island: string) => {
    const key = `${month}|${island}`;
    let row = rows.get(key);
    if (!row) {
      row = { month, island, revenue: 0, nett_to_partners: 0, expenses: 0, margin: 0, bookings: 0 };
      rows.set(key, row);
    }
    return row;
  };
  for (const b of bookings) {
    if (b.cancelled_at) continue;
    const month = String(b.show_date).slice(0, 7);
    if (month.length !== 7) continue;
    const row = get(month, b.island?.trim() || "All islands");
    row.revenue = round2(row.revenue + num(b.total_cost));
    row.nett_to_partners = round2(row.nett_to_partners + num(b.nett_total));
    row.bookings += 1;
  }
  for (const e of expenses) {
    const month = String(e.expense_date).slice(0, 7);
    if (month.length !== 7) continue;
    const row = get(month, e.island?.trim() || "All islands");
    row.expenses = round2(row.expenses + num(e.net_amount));
  }
  for (const row of rows.values()) row.margin = round2(row.revenue - row.nett_to_partners - row.expenses);
  return [...rows.values()].sort((a, b) => (a.month === b.month ? a.island.localeCompare(b.island) : b.month.localeCompare(a.month)));
}
