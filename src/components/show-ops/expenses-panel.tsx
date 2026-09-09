import Link from "next/link";

import { deleteExpenseAction, pushExpenseToHoldedAction, saveExpenseAction } from "@/app/dashboard/show-ops/actions-expenses";
import { SubmitOnce } from "@/components/show-ops/submit-once";
import { formatShowOpsMoney } from "@/lib/show-ops/calc";
import { EXPENSE_CATEGORIES, type PnlRow } from "@/lib/show-ops/expenses";
import type { ShowOpsCurrency } from "@/lib/show-ops/types";

export type ExpenseRow = {
  id: string;
  expense_date: string;
  supplier_name: string;
  description: string;
  category: string;
  island: string | null;
  net_amount: number | string;
  tax_rate: number | string;
  total_amount: number | string;
  currency: string;
  receipt_url: string | null;
  holded_status: string;
  holded_error: string | null;
};

const categoryLabel = (k: string) => EXPENSE_CATEGORIES.find(([key]) => key === k)?.[1] ?? k;

export function ExpensesPanel({
  rows,
  islands,
  products,
  currency,
  defaultTaxRate,
  holdedConnected,
  message,
  error,
}: {
  rows: ExpenseRow[];
  islands: string[];
  products: Array<{ id: string; name: string; island: string }>;
  currency: ShowOpsCurrency;
  defaultTaxRate: number;
  holdedConnected: boolean;
  message?: string;
  error?: string;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const money = (n: number | string, cur: string) => formatShowOpsMoney(Number(n), cur === "gbp" || cur === "usd" || cur === "eur" ? cur : currency);
  const notice =
    message === "saved" ? "Expense saved." :
    message === "updated" ? "Expense updated." :
    message === "deleted" ? "Expense deleted." :
    message === "sent" ? "Sent to Holded as a draft purchase." :
    message === "already" ? "That expense is already in Holded." : null;

  return (
    <div className="space-y-4">
      {notice ? <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">{notice}</p> : null}
      {error ? <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800 ring-1 ring-rose-200">{error}</p> : null}

      <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="font-semibold">Record an expense</h2>
        <p className="mt-1 text-sm text-slate-600">
          Buses, food, venue, staff. Enter it once here with the receipt; it goes to Holded as a draft purchase for the accountant and
          into the P&amp;L for the island it belongs to.
        </p>
        <form action={saveExpenseAction} className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="text-xs font-medium text-slate-600">
            Date
            <input name="expense_date" type="date" required defaultValue={today} className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Supplier (who was paid)
            <input name="supplier_name" required placeholder="Guaguas Tenerife SL" className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Supplier tax id (optional)
            <input name="supplier_tax_id" placeholder="B12345678" className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm uppercase" />
          </label>
          <label className="text-xs font-medium text-slate-600 sm:col-span-2">
            What for
            <input name="description" required placeholder="Coach hire, Friday 12 Sept, 2 buses" className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Category
            <select name="category" defaultValue="other" className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm">
              {EXPENSE_CATEGORIES.map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Net amount (before tax)
            <input name="net_amount" type="number" step="0.01" min="0.01" required className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Tax %
            <input name="tax_rate" type="number" step="0.5" min="0" max="100" defaultValue={defaultTaxRate} className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Currency
            <select name="currency" defaultValue={currency} className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm">
              <option value="eur">EUR</option>
              <option value="gbp">GBP</option>
              <option value="usd">USD</option>
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Island
            <select name="island" defaultValue="" className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm">
              <option value="">All islands / not specific</option>
              {islands.map((i) => (
                <option key={i} value={i}>{i}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Show (optional)
            <select name="product_id" defaultValue="" className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm">
              <option value="">Not show-specific</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name} · {p.island}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Receipt photo or PDF
            <input name="receipt" type="file" accept="image/*,application/pdf" className="mt-1 w-full text-sm" />
          </label>
          <label className="text-xs font-medium text-slate-600 sm:col-span-3">
            Notes (optional)
            <input name="notes" className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm" />
          </label>
          <div className="sm:col-span-3">
            <SubmitOnce className="rounded-xl bg-[var(--show-ops-primary,#7c3aed)] px-4 py-2 text-sm font-semibold text-white">Save expense</SubmitOnce>
          </div>
        </form>
      </section>

      <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Recent expenses</h2>
          {!holdedConnected ? (
            <Link href="/dashboard/show-ops/settings#holded" className="text-sm font-semibold text-violet-700 underline">Connect Holded to send purchases</Link>
          ) : null}
        </div>
        {!rows.length ? (
          <p className="mt-2 text-sm text-slate-600">No expenses recorded yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-1 pr-3">Date</th>
                  <th className="py-1 pr-3">Supplier</th>
                  <th className="py-1 pr-3">What for</th>
                  <th className="py-1 pr-3">Island</th>
                  <th className="py-1 pr-3 text-right">Net</th>
                  <th className="py-1 pr-3 text-right">Total</th>
                  <th className="py-1 pr-3">Holded</th>
                  <th className="py-1"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id} className="border-t border-slate-100 align-top">
                    <td className="py-1.5 pr-3 whitespace-nowrap">{e.expense_date}</td>
                    <td className="py-1.5 pr-3">{e.supplier_name}</td>
                    <td className="py-1.5 pr-3">
                      {e.description}
                      <span className="block text-xs text-slate-500">{categoryLabel(e.category)}{e.receipt_url ? <> · <a href={e.receipt_url} target="_blank" rel="noreferrer" className="underline">receipt</a></> : null}</span>
                    </td>
                    <td className="py-1.5 pr-3">{e.island || "All"}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{money(e.net_amount, e.currency)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{money(e.total_amount, e.currency)} <span className="text-xs text-slate-500">({Number(e.tax_rate)}%)</span></td>
                    <td className="py-1.5 pr-3">
                      {e.holded_status === "draft" ? <span className="text-emerald-700">Draft in Holded</span>
                        : e.holded_status === "error" ? <span className="text-rose-700" title={e.holded_error ?? ""}>Error</span>
                        : <span className="text-slate-500">Not sent</span>}
                    </td>
                    <td className="py-1.5">
                      <div className="flex flex-wrap gap-1">
                        {holdedConnected && e.holded_status !== "draft" ? (
                          <form action={pushExpenseToHoldedAction}>
                            <input type="hidden" name="id" value={e.id} />
                            <SubmitOnce className="rounded-lg bg-white px-2 py-1 text-xs font-semibold text-slate-800 ring-1 ring-slate-200">Send to Holded</SubmitOnce>
                          </form>
                        ) : null}
                        {e.holded_status !== "draft" ? (
                          <form action={deleteExpenseAction}>
                            <input type="hidden" name="id" value={e.id} />
                            <SubmitOnce className="rounded-lg bg-white px-2 py-1 text-xs font-semibold text-rose-700 ring-1 ring-rose-200">Delete</SubmitOnce>
                          </form>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export function PnlPanel({ rows, currency, from, to }: { rows: PnlRow[]; currency: ShowOpsCurrency; from: string; to: string }) {
  const money = (n: number) => formatShowOpsMoney(n, currency);
  const totals = rows.reduce(
    (t, r) => ({ revenue: t.revenue + r.revenue, nett: t.nett + r.nett_to_partners, expenses: t.expenses + r.expenses, margin: t.margin + r.margin, bookings: t.bookings + r.bookings }),
    { revenue: 0, nett: 0, expenses: 0, margin: 0, bookings: 0 },
  );
  return (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-semibold">Profit &amp; loss by month and island</h2>
          <p className="mt-1 text-sm text-slate-600">
            Ticket revenue and partner nett from bookings by show date; costs from recorded expenses. Amounts are net of tax.
            Costs not tied to an island sit under &ldquo;All islands&rdquo;.
          </p>
        </div>
        <form method="get" className="flex flex-wrap items-end gap-2 text-xs font-medium text-slate-600">
          <input type="hidden" name="view" value="pnl" />
          <label>From<input type="date" name="pnl_from" defaultValue={from} className="mt-1 block rounded-lg border px-2 py-1.5 text-sm" /></label>
          <label>To<input type="date" name="pnl_to" defaultValue={to} className="mt-1 block rounded-lg border px-2 py-1.5 text-sm" /></label>
          <button type="submit" className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-800 ring-1 ring-slate-200">Show</button>
        </form>
      </div>
      {!rows.length ? (
        <p className="mt-3 text-sm text-slate-600">Nothing in this period.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="py-1 pr-3">Month</th>
                <th className="py-1 pr-3">Island</th>
                <th className="py-1 pr-3 text-right">Bookings</th>
                <th className="py-1 pr-3 text-right">Ticket revenue</th>
                <th className="py-1 pr-3 text-right">Partner nett</th>
                <th className="py-1 pr-3 text-right">Expenses</th>
                <th className="py-1 text-right">Margin</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.month}|${r.island}`} className="border-t border-slate-100">
                  <td className="py-1.5 pr-3">{r.month}</td>
                  <td className="py-1.5 pr-3">{r.island}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{r.bookings}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{money(r.revenue)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{money(r.nett_to_partners)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{money(r.expenses)}</td>
                  <td className={`py-1.5 text-right font-semibold tabular-nums ${r.margin < 0 ? "text-rose-700" : "text-emerald-700"}`}>{money(r.margin)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-slate-200 font-semibold">
              <tr>
                <td className="py-2 pr-3" colSpan={2}>Total</td>
                <td className="py-2 pr-3 text-right tabular-nums">{totals.bookings}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{money(totals.revenue)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{money(totals.nett)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{money(totals.expenses)}</td>
                <td className={`py-2 text-right tabular-nums ${totals.margin < 0 ? "text-rose-700" : "text-emerald-700"}`}>{money(totals.margin)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-slate-500">
        Partner nett is what Solvio owes partners on deposit-mode bookings and what it invoices on invoice-mode ones, as stored on each booking.
        Door cash, no-show write-offs and Holded ledger entries are not yet reflected here.
      </p>
    </section>
  );
}
