import Link from "next/link";

import { saveRateCardPricesAction, upsertRateCardAction } from "@/app/dashboard/show-ops/actions";
import { SHOW_OPS_PRIMARY_BTN } from "@/components/show-ops/show-ops-page-header";
import { SubmitOnce } from "@/components/show-ops/submit-once";
import { rateGridField, type RateGridCell, type RateGridRow } from "@/lib/show-ops/rate-card-grid";

export type MasterRateRow = {
  id: string;
  name: string;
  rate_type: "sale" | "invoice";
  commission_percent: number | null;
  active: boolean;
};

const INPUT = "mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm";
const PRICE_INPUT = "w-20 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm tabular-nums";
const RATES_HREF = "/dashboard/show-ops/master?tab=rates";

export function MasterRatesForm({
  rates,
  partnerCounts,
  selected,
  grid,
  currency,
}: {
  rates: MasterRateRow[];
  /** Active partners pointing at each card, by card id. */
  partnerCounts: Record<string, number>;
  selected: MasterRateRow | null;
  grid: RateGridRow[];
  currency: string;
}) {
  const byName = (a: MasterRateRow, b: MasterRateRow) => a.name.localeCompare(b.name);
  const live = rates.filter((r) => r.active).sort(byName);
  const retired = rates.filter((r) => !r.active).sort(byName);

  return (
    <div className="mt-4 space-y-6">
      {selected ? (
        <RateCardEditor card={selected} partners={partnerCounts[selected.id] ?? 0} grid={grid} currency={currency} />
      ) : null}

      <details className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <summary className="cursor-pointer font-semibold text-slate-900">+ Add a rate card</summary>
        <form action={upsertRateCardAction} className="mt-4 grid gap-2 sm:grid-cols-4">
          <label className="text-xs font-medium text-slate-600 sm:col-span-2">
            Name
            <input name="name" required placeholder="2027 TFS 30% Rate" className={INPUT} />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Type
            <select name="rate_type" className={INPUT}>
              <option value="sale">Sale (sets the prices)</option>
              <option value="invoice">Invoice</option>
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Commission %
            <input name="commission_percent" inputMode="decimal" placeholder="30" className={INPUT} />
          </label>
          <SubmitOnce className={`${SHOW_OPS_PRIMARY_BTN} sm:col-span-4`}>Add rate card</SubmitOnce>
        </form>
      </details>

      <RateTable title="Live rate cards" rows={live} partnerCounts={partnerCounts} selectedId={selected?.id} empty="No live rate cards." />
      {retired.length ? (
        <RateTable title="Retired / not used" rows={retired} partnerCounts={partnerCounts} selectedId={selected?.id} empty="" />
      ) : null}
    </div>
  );
}

function RateCardEditor({
  card,
  partners,
  grid,
  currency,
}: {
  card: MasterRateRow;
  partners: number;
  grid: RateGridRow[];
  currency: string;
}) {
  return (
    <div id={`created-${card.id}`} className="scroll-mt-24 rounded-xl bg-violet-50/60 p-4 ring-1 ring-violet-200">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold text-slate-900">{card.name}</h3>
        <Link href={RATES_HREF} className="text-xs font-semibold text-slate-500 hover:text-slate-800">
          Close
        </Link>
      </div>
      <p className="mt-1 text-xs text-slate-600">
        {card.rate_type === "sale" ? "Sale card" : "Invoice card"} · used by {partners} active partner{partners === 1 ? "" : "s"}
        {!card.active && partners > 0 ? " — retired, but these partners still price from it" : ""}
      </p>

      <form action={upsertRateCardAction} className="mt-3 grid gap-2 sm:grid-cols-4">
        <input type="hidden" name="id" value={card.id} />
        <label className="text-xs font-medium text-slate-600 sm:col-span-2">
          Name
          <input name="name" required defaultValue={card.name} className={INPUT} />
        </label>
        <label className="text-xs font-medium text-slate-600">
          Commission %
          <input
            name="commission_percent"
            inputMode="decimal"
            defaultValue={card.commission_percent == null ? "" : String(Number(card.commission_percent))}
            className={INPUT}
          />
        </label>
        <label className="flex items-end gap-2 pb-2 text-sm font-medium text-slate-700">
          <input type="checkbox" name="active" defaultChecked={card.active} className="size-4 rounded border-slate-300" />
          In use
        </label>
        <p className="text-xs text-slate-500 sm:col-span-4">
          The % here is the card’s label. What a partner actually keeps is the deposit % / invoice nett % on the partner
          itself. Untick In use to retire the card — it drops to the bottom of the partner dropdowns.
        </p>
        <SubmitOnce className={`${SHOW_OPS_PRIMARY_BTN} sm:col-span-4 sm:w-fit`}>Save card</SubmitOnce>
      </form>

      {card.rate_type === "sale" ? (
        <form action={saveRateCardPricesAction.bind(null, card.id)} className="mt-6">
          <h4 className="text-sm font-semibold text-slate-800">Prices on this card ({currency})</h4>
          <p className="mt-1 text-xs text-slate-500">
            What partners on this card sell each show for. New bookings use these straight away; bookings already taken
            keep the price they were sold at. Clear both boxes to take a show off the card — it then sells at the show’s
            own price.
          </p>
          <div className="mt-2 overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2" rowSpan={2}>Show</th>
                  <th className="px-3 pt-2 text-center" colSpan={2}>With bus</th>
                  <th className="px-3 pt-2 text-center" colSpan={2}>No bus</th>
                </tr>
                <tr>
                  <th className="px-3 pb-2 text-right">Adult</th>
                  <th className="px-3 pb-2 text-right">Child</th>
                  <th className="px-3 pb-2 text-right">Adult</th>
                  <th className="px-3 pb-2 text-right">Child</th>
                </tr>
              </thead>
              <tbody>
                {grid.map((g) => (
                  <tr key={g.product_id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium text-slate-900">
                      {g.product_name}
                      {g.product_active ? null : <span className="ml-2 text-xs font-normal text-slate-400">archived</span>}
                    </td>
                    <PriceCells productId={g.product_id} productName={g.product_name} noTransport={false} cell={g.bus} />
                    <PriceCells productId={g.product_id} productName={g.product_name} noTransport cell={g.noBus} />
                  </tr>
                ))}
                {!grid.length ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                      No shows yet — add one under Shows first.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <SubmitOnce className={`${SHOW_OPS_PRIMARY_BTN} mt-3`}>Save prices</SubmitOnce>
        </form>
      ) : (
        <p className="mt-4 text-xs text-slate-500">
          Invoice cards carry no prices of their own — invoices are worked out from the partner’s sale card and nett %.
        </p>
      )}
    </div>
  );
}

function PriceCells({
  productId,
  productName,
  noTransport,
  cell,
}: {
  productId: string;
  productName: string;
  noTransport: boolean;
  cell: RateGridCell;
}) {
  const where = noTransport ? "no bus" : "with bus";
  return (
    <>
      {(["adult", "child"] as const).map((kind) => (
        <td key={kind} className="px-3 py-1.5 text-right">
          <input
            name={rateGridField(kind, productId, noTransport)}
            inputMode="decimal"
            aria-label={`${productName} ${kind} price, ${where}`}
            defaultValue={cell[kind] == null ? "" : cell[kind]!.toFixed(2)}
            placeholder="—"
            className={PRICE_INPUT}
          />
        </td>
      ))}
    </>
  );
}

function RateTable({
  title,
  rows,
  partnerCounts,
  selectedId,
  empty,
}: {
  title: string;
  rows: MasterRateRow[];
  partnerCounts: Record<string, number>;
  selectedId?: string;
  empty: string;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      <div className="mt-2 overflow-x-auto rounded-xl ring-1 ring-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Commission</th>
              <th className="px-3 py-2">Partners</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={`border-t border-slate-100 ${selectedId === r.id ? "bg-violet-50" : ""}`}>
                <td className="px-3 py-2 font-medium text-slate-900">{r.name}</td>
                <td className="px-3 py-2 text-slate-600">{r.rate_type === "sale" ? "Sale (pay now)" : "Invoice"}</td>
                <td className="px-3 py-2 tabular-nums text-slate-700">
                  {r.commission_percent == null ? "—" : `${Number(r.commission_percent)}%`}
                </td>
                <td className="px-3 py-2 tabular-nums text-slate-700">{partnerCounts[r.id] ?? 0}</td>
                <td className="px-3 py-2 text-right">
                  <Link href={`${RATES_HREF}&card=${r.id}`} className="font-semibold text-violet-700 hover:underline">
                    {r.rate_type === "sale" ? "Edit card & prices" : "Edit card"}
                  </Link>
                </td>
              </tr>
            ))}
            {!rows.length && empty ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                  {empty}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
