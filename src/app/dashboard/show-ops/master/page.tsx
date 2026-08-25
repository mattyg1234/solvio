import {
  nudgeBusStopAction,
  upsertBusOrderAction,
  upsertBusStopAction,
  upsertHotelAction,
  upsertProductAction,
  upsertSupplierAction,
} from "@/app/dashboard/show-ops/actions";
import { BusStopReorder } from "@/components/show-ops/bus-stop-reorder";
import { MasterRatesForm } from "@/components/show-ops/master-rates-form";
import { MasterShowsForm } from "@/components/show-ops/master-shows-form";
import { MasterSuppliersForm } from "@/components/show-ops/master-suppliers-form";
import { ScrollToCreated } from "@/components/show-ops/scroll-to-created";
import { SHOW_OPS_PRIMARY_BTN, ShowOpsPageHeader } from "@/components/show-ops/show-ops-page-header";
import { SubmitOnce } from "@/components/show-ops/submit-once";
import { NumberInput } from "@/components/ui/number-input";
import { requireShowOpsPage } from "@/lib/show-ops/access";
import { SHOW_OPS_WEEKDAYS } from "@/lib/show-ops/nights";

function Field({
  label,
  name,
  type = "text",
  defaultValue,
  required,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string | number | null;
  required?: boolean;
  step?: string;
}) {
  return (
    <label className="text-xs font-medium text-slate-600">
      {label}
      {type === "number" ? (
        <NumberInput
          name={name}
          required={required}
          defaultValue={defaultValue ?? ""}
          className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
        />
      ) : (
        <input
          name={name}
          type={type}
          required={required}
          defaultValue={defaultValue ?? undefined}
          className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
        />
      )}
    </label>
  );
}

function pinCreated<T extends { id: string }>(rows: T[] | null | undefined, created?: string): T[] {
  const list = rows ?? [];
  if (!created) return list;
  const hit = list.find((r) => r.id === created);
  if (!hit) return list;
  return [hit, ...list.filter((r) => r.id !== created)];
}

export default async function MasterDataPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; saved?: string; created?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const allowed = new Set(["shows", "partners", "rates", "hotels"]);
  const tab = sp.tab && allowed.has(sp.tab) ? sp.tab : "shows";
  const created = /^[0-9a-f-]{36}$/i.test(sp.created ?? "") ? sp.created : undefined;
  const ctx = await requireShowOpsPage("shows");
  const biz = ctx.business.id;
  const islands = ctx.config.islands;

  const [
    { data: suppliers },
    { data: products },
    { data: stops },
    { data: hotels },
    { data: busOrders },
    { data: rates },
  ] =
    await Promise.all([
      ctx.supabase.from("show_suppliers").select("*").eq("business_id", biz).eq("active", true).order("name"),
      ctx.supabase.from("show_products").select("*").eq("business_id", biz).order("name"),
      ctx.supabase.from("show_bus_stops").select("*").eq("business_id", biz).order("sort_order"),
      ctx.supabase.from("show_hotels").select("*").eq("business_id", biz).order("name"),
      ctx.supabase
        .from("show_bus_orders")
        .select("*")
        .eq("business_id", biz)
        .order("show_date", { ascending: false })
        .limit(20),
      ctx.supabase.from("show_supplier_rates").select("*").eq("business_id", biz).order("name"),
    ]);

  // Per-partner sales for the list rows — aggregated in SQL, never row-fetched.
  const statsYear = new Date().getUTCFullYear();
  const { data: partnerTotals } = await ctx.supabase.rpc("show_ops_partner_totals", {
    p_business: biz,
    p_from: `${statsYear}-01-01`,
    p_to: `${statsYear}-12-31`,
  });
  const supplierStats = Object.fromEntries(
    ((partnerTotals ?? []) as Array<{ supplier_id: string; bookings: number; pax: number; revenue: number }>).map(
      (r) => [r.supplier_id, { bookings: Number(r.bookings), pax: Number(r.pax), revenue: Number(r.revenue) }],
    ),
  );

  const stopById = new Map((stops ?? []).map((s) => [s.id, s]));
  const title =
    tab === "partners"
      ? "Partners"
      : tab === "rates"
        ? "Rates & commissions"
        : tab === "hotels"
          ? "Hotels & pick-ups"
          : "Shows";
  const intro =
    tab === "partners"
      ? "Sellers — ticket shops, agencies, hotels, web. Type and location match the old Partners list. Commission cards live under Rates."
      : tab === "rates"
        ? "Commission cards (sale vs invoice). Partners pick one of these — they are not sellers."
        : tab === "hotels"
          ? "Hotels, bus stops and seats ordered. Changing a stop here does not wipe bookings — only the run order and times."
          : "Shows, islands, capacity and ticket prices. Tick rows to master-edit, or Save all shows at once. Reprice uninvoiced bookings after you change a rate.";

  return (
    <div className="space-y-8">
      <ShowOpsPageHeader eyebrow="Operations" title={title} subtitle={intro} />
      {sp.error ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{sp.error}</p>
      ) : null}
      {sp.saved === "bulk" ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Applied to the ticked rows.</p>
      ) : null}
      {sp.saved === "exists" ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Already on the list — opened it below so you can edit it.
        </p>
      ) : null}
      {sp.saved === "1" ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Saved. The new row is at the top of the list.</p>
      ) : null}
      <ScrollToCreated id={created} />

      {tab === "rates" ? (
      <section id="rates" className="scroll-mt-24 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="font-semibold text-slate-900">Rates & commissions</h2>
        <p className="mt-1 text-xs text-slate-500">
          Sale cards are pay-now. Invoice cards are billed later at (100% − commission). Attach a card on each partner —
          this list is not the seller list.
        </p>
        <MasterRatesForm rates={(rates ?? []) as never} />
      </section>
      ) : null}

      {tab === "partners" ? (
      <section id="partners" className="scroll-mt-24 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="font-semibold text-slate-900">Partners</h2>
        <p className="mt-1 text-xs text-slate-500">
          Hotels and resellers with their own billing mode. Invoice email is where Verifactu packs are sent.
        </p>
        <form action={upsertSupplierAction} className="mt-3 grid gap-2 sm:grid-cols-3">
          <input type="hidden" name="tab" value="partners" />
          <Field label="Name" name="name" required />
          <label className="text-xs font-medium text-slate-600">
            Partner type
            <select name="partner_type" className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm">
              {ctx.config.partner_types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Location
            <select name="island" className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm">
              <option value="ALL">ALL</option>
              {islands.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Billing
            <select name="billing_mode" className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm">
              <option value="deposit">Deposit %</option>
              <option value="invoice">Invoice nett</option>
            </select>
          </label>
          <Field label="Invoice email" name="email" type="email" />
          <Field label="Legal name" name="legal_name" />
          <Field label="NIF / tax ID" name="tax_id" />
          <Field label="Invoice address" name="invoice_address" />
          <Field label="Deposit %" name="deposit_percent" type="number" defaultValue={30} />
          <Field label="Invoice nett %" name="invoice_nett_percent" type="number" defaultValue={70} />
          <label className="text-xs font-medium text-slate-600">
            No-show default
            <select name="no_show_policy" className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm">
              <option value="charge">Charge anyway</option>
              <option value="write_off">Write off</option>
            </select>
          </label>
          <Field label="Notes" name="notes" />
          <SubmitOnce className={`${SHOW_OPS_PRIMARY_BTN} sm:col-span-3`}>Add partner</SubmitOnce>
        </form>
        <MasterSuppliersForm
          key={(suppliers ?? []).map((s) => `${s.id}:${s.billing_mode}:${s.deposit_percent}:${s.invoice_nett_percent}:${s.active}:${s.island}`).join("|")}
          tab="partners"
          partnerTypes={ctx.config.partner_types}
          islands={islands}
          rates={(rates ?? []) as never}
          suppliers={pinCreated((suppliers ?? []) as never, created)}
          highlightId={created}
          stats={supplierStats}
          statsLabel={String(statsYear)}
          currency={ctx.config.currency}
        />
      </section>
      ) : null}

      {tab === "shows" ? (
      <section id="shows" className="scroll-mt-24 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="font-semibold text-slate-900">Shows / ticket types</h2>
        <form action={upsertProductAction} className="mt-3 grid gap-2 sm:grid-cols-3">
          <input type="hidden" name="tab" value="shows" />
          <Field label="Show name" name="name" required />
          <label className="text-xs font-medium text-slate-600">
            Island
            <select name="island" className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm">
              {islands.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </label>
          <Field label="Ticket type" name="ticket_type" defaultValue="standard" />
          <Field label="Adult € with transport" name="adult_price" type="number" step="0.01" defaultValue={0} />
          <Field label="Child € with transport" name="child_price" type="number" step="0.01" defaultValue={0} />
          <Field label="Infant € with transport" name="infant_price" type="number" step="0.01" defaultValue={0} />
          <Field label="Adult € no transport" name="adult_price_no_transport" type="number" step="0.01" />
          <Field label="Child € no transport" name="child_price_no_transport" type="number" step="0.01" />
          <Field label="Infant € no transport" name="infant_price_no_transport" type="number" step="0.01" />
          <Field label="Adult nett €" name="adult_nett" type="number" step="0.01" />
          <Field label="Child nett €" name="child_nett" type="number" step="0.01" />
          <Field label="Capacity" name="capacity" type="number" />
          <Field label="Show starts" name="show_time" type="time" />
          <label className="flex items-center gap-2 text-xs sm:col-span-2">
            <input type="checkbox" name="transport_available" value="1" defaultChecked /> Transport available
          </label>
          <div className="sm:col-span-3">
            <p className="text-xs font-medium text-slate-600">Runs on</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {SHOW_OPS_WEEKDAYS.map((d) => (
                <label
                  key={d.n}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200"
                >
                  <input type="checkbox" name="run_weekday" value={d.n} />
                  {d.label}
                </label>
              ))}
            </div>
          </div>
          <SubmitOnce className={`${SHOW_OPS_PRIMARY_BTN} sm:col-span-3`}>Add show</SubmitOnce>
        </form>
        <MasterShowsForm
          key={(products ?? []).map((p) => `${p.id}:${p.adult_price}:${p.child_price}:${p.capacity}:${p.island}`).join("|")}
          islands={islands}
          products={pinCreated((products ?? []) as never, created)}
          highlightId={created}
        />
      </section>
      ) : null}

      {tab === "hotels" ? (
      <>
      <section id="stops" className="scroll-mt-24 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="font-semibold text-slate-900">Bus stops</h2>
        <form action={upsertBusStopAction} className="mt-3 grid gap-2 sm:grid-cols-3">
          <input type="hidden" name="tab" value="hotels" />
          <label className="text-xs font-medium text-slate-600">
            Island
            <select name="island" className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm">
              {islands.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </label>
          <Field label="Resort" name="resort" required />
          <Field label="Stop name" name="stop_name" required />
          <Field label="Pickup time" name="pickup_time" type="time" />
          <Field label="Sort order" name="sort_order" type="number" defaultValue={0} />
          <Field label="Days (blank = every night)" name="runs_on" />
          <Field label="Guide notes" name="guide_notes" />
          <SubmitOnce className={`${SHOW_OPS_PRIMARY_BTN} sm:col-span-3`}>Add stop</SubmitOnce>
        </form>
        <div className="mt-4 space-y-3">
          {pinCreated(stops ?? [], created).map((s) => (
            <form
              key={s.id}
              id={`created-${s.id}`}
              action={upsertBusStopAction}
              className={`grid gap-2 rounded-xl p-3 sm:grid-cols-3 ${
                created === s.id ? "bg-violet-50 ring-2 ring-[var(--show-ops-primary,#7c3aed)]" : "bg-slate-50"
              }`}
            >
              <input type="hidden" name="id" value={s.id} />
              <input type="hidden" name="tab" value="hotels" />
              <label className="text-xs font-medium text-slate-600">
                Island
                <select
                  name="island"
                  defaultValue={s.island}
                  className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm"
                >
                  {islands.map((i) => (
                    <option key={i} value={i}>
                      {i}
                    </option>
                  ))}
                </select>
              </label>
              <Field label="Resort" name="resort" required defaultValue={s.resort} />
              <Field label="Stop name" name="stop_name" required defaultValue={s.stop_name} />
              <Field
                label="Pickup time"
                name="pickup_time"
                type="time"
                defaultValue={s.pickup_time ? String(s.pickup_time).slice(0, 5) : ""}
              />
              <Field label="Sort order" name="sort_order" type="number" defaultValue={s.sort_order} />
              <Field
                label="Days (blank = every night)"
                name="runs_on"
                defaultValue={(s as { runs_on?: string | null }).runs_on ?? ""}
              />
              <Field
                label="Guide notes"
                name="guide_notes"
                defaultValue={(s as { guide_notes?: string | null }).guide_notes ?? ""}
              />
              <label className="flex items-center gap-2 text-xs self-end pb-2">
                <input type="checkbox" name="active" value="1" defaultChecked={s.active !== false} /> Active
              </label>
              <div className="flex flex-wrap items-end gap-2">
                <button type="submit" className="rounded-xl bg-[var(--show-ops-primary,#7c3aed)] px-4 py-2 text-sm font-semibold text-white">
                  Save
                </button>
              </div>
            </form>
          ))}
          <div className="mt-2 flex flex-wrap gap-2">
            {(stops ?? []).map((s) => (
              <div key={`nudge-${s.id}`} className="flex gap-1">
                <form action={nudgeBusStopAction}>
                  <input type="hidden" name="id" value={s.id} />
                  <input type="hidden" name="dir" value="up" />
                  <button type="submit" className="rounded bg-white px-2 py-1 text-xs ring-1 ring-slate-200">
                    {s.stop_name} ↑
                  </button>
                </form>
                <form action={nudgeBusStopAction}>
                  <input type="hidden" name="id" value={s.id} />
                  <input type="hidden" name="dir" value="down" />
                  <button type="submit" className="rounded bg-white px-2 py-1 text-xs ring-1 ring-slate-200">
                    ↓
                  </button>
                </form>
              </div>
            ))}
          </div>
          {islands.map((island) => {
            const islandStops = (stops ?? []).filter((s) => s.island === island);
            if (!islandStops.length) return null;
            return (
              <BusStopReorder
                key={island}
                island={island}
                stops={islandStops.map((s) => ({
                  id: s.id,
                  label: `${s.resort} · ${s.stop_name}${s.pickup_time ? ` · ${String(s.pickup_time).slice(0, 5)}` : ""}`,
                }))}
              />
            );
          })}
        </div>
      </section>

      <section id="hotels" className="scroll-mt-24 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="font-semibold text-slate-900">Hotels</h2>
        <form action={upsertHotelAction} className="mt-3 grid gap-2 sm:grid-cols-3">
          <input type="hidden" name="tab" value="hotels" />
          <Field label="Hotel name" name="name" required />
          <label className="text-xs font-medium text-slate-600">
            Island
            <select name="island" className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm">
              {islands.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Bus stop
            <select name="bus_stop_id" className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm">
              <option value="">—</option>
              {(stops ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.resort} · {s.stop_name}
                  {s.pickup_time ? ` · ${String(s.pickup_time).slice(0, 5)}` : ""}
                </option>
              ))}
            </select>
          </label>
          <SubmitOnce className={`${SHOW_OPS_PRIMARY_BTN} sm:col-span-3`}>Add hotel</SubmitOnce>
        </form>
        <div className="mt-4 space-y-3">
          {pinCreated(hotels ?? [], created).map((h) => {
            const stop = h.bus_stop_id ? stopById.get(h.bus_stop_id) : null;
            return (
              <form
                key={h.id}
                id={`created-${h.id}`}
                action={upsertHotelAction}
                className={`grid gap-2 rounded-xl p-3 sm:grid-cols-3 ${
                  created === h.id ? "bg-violet-50 ring-2 ring-[var(--show-ops-primary,#7c3aed)]" : "bg-slate-50"
                }`}
              >
                <input type="hidden" name="id" value={h.id} />
                <input type="hidden" name="tab" value="hotels" />
                <Field label="Hotel name" name="name" required defaultValue={h.name} />
                <label className="text-xs font-medium text-slate-600">
                  Island
                  <select
                    name="island"
                    defaultValue={h.island}
                    className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm"
                  >
                    {islands.map((i) => (
                      <option key={i} value={i}>
                        {i}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-medium text-slate-600">
                  Bus stop
                  {stop
                    ? ` (${stop.resort}${stop.pickup_time ? ` · ${String(stop.pickup_time).slice(0, 5)}` : ""})`
                    : ""}
                  <select
                    name="bus_stop_id"
                    defaultValue={h.bus_stop_id ?? ""}
                    className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm"
                  >
                    <option value="">—</option>
                    {(stops ?? []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.resort} · {s.stop_name}
                        {s.pickup_time ? ` · ${String(s.pickup_time).slice(0, 5)}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2 text-xs self-end pb-2">
                  <input type="checkbox" name="active" value="1" defaultChecked={h.active !== false} /> Active
                </label>
                <button type="submit" className="rounded-xl bg-[var(--show-ops-primary,#7c3aed)] px-4 py-2 text-sm font-semibold text-white sm:col-span-2">
                  Save
                </button>
              </form>
            );
          })}
        </div>
      </section>

      <section id="buses" className="scroll-mt-24 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="font-semibold text-slate-900">Bus orders (capacity + cost)</h2>
        <p className="mt-1 text-xs text-slate-500">
          Tell the system seats ordered + cost for weekly outlook spaces and cost-per-head reports.
        </p>
        <form action={upsertBusOrderAction} className="mt-3 grid gap-2 sm:grid-cols-4">
          <input type="hidden" name="tab" value="hotels" />
          <Field label="Date" name="show_date" type="date" required />
          <label className="text-xs font-medium text-slate-600">
            Island
            <select name="island" className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm">
              {islands.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </label>
          <Field label="Seats ordered" name="seats_ordered" type="number" defaultValue={50} />
          <Field label="Cost €" name="cost_total" type="number" step="0.01" defaultValue={0} />
          <Field label="Notes" name="notes" />
          <SubmitOnce className={`${SHOW_OPS_PRIMARY_BTN} sm:col-span-4`}>Save bus order</SubmitOnce>
        </form>
        <ul className="mt-4 divide-y text-sm">
          {pinCreated(busOrders ?? [], created).map((b) => (
            <li
              key={b.id}
              id={`created-${b.id}`}
              className={`py-2 ${created === b.id ? "rounded-lg bg-violet-50 px-2 font-medium" : ""}`}
            >
              {b.show_date} · {b.island} · {b.seats_ordered} seats · €{b.cost_total}
            </li>
          ))}
        </ul>
      </section>
      </>
      ) : null}
    </div>
  );
}
