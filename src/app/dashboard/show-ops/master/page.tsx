import { upsertBusOrderAction, upsertProductAction, upsertSupplierAction } from "@/app/dashboard/show-ops/actions";
import { HotelsDirectory } from "@/components/show-ops/hotels-directory";
import { MasterRatesForm } from "@/components/show-ops/master-rates-form";
import { MasterShowsForm } from "@/components/show-ops/master-shows-form";
import { MasterSuppliersForm } from "@/components/show-ops/master-suppliers-form";
import { PickupPointsDirectory } from "@/components/show-ops/pickup-points-directory";
import { ScrollToCreated } from "@/components/show-ops/scroll-to-created";
import { SHOW_OPS_PRIMARY_BTN, ShowOpsPageHeader, ShowOpsPill } from "@/components/show-ops/show-ops-page-header";
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
  /*
   * Rates was a duplicate of the deposit % / invoice nett % that already live on
   * every partner, and nothing prices from it — so it is gone from the nav and any
   * old link lands on Partners instead. The rate-card rows are still on the
   * partner record for reference.
   */
  const allowed = new Set(["shows", "partners", "hotels", "stops"]);
  const tab = sp.tab === "rates" ? "partners" : sp.tab && allowed.has(sp.tab) ? sp.tab : "shows";
  const created = /^[0-9a-f-]{36}$/i.test(sp.created ?? "") ? sp.created : undefined;
  const ctx = await requireShowOpsPage("shows");
  const biz = ctx.business.id;
  const islands = ctx.config.islands;
  const sb = ctx.supabase;

  /*
   * Only load what the open tab renders. Every tab used to pull suppliers,
   * products, 1,200 hotels, 327 stops and the partner totals RPC on every
   * visit, so Shows paid for Hotels and vice versa.
   */
  const wantsMaster = tab === "hotels" || tab === "stops";
  const [
    { data: suppliers },
    { data: products },
    { data: stops },
    { data: hotels },
    { data: busOrders },
    { data: rates },
  ] = await Promise.all([
    tab === "partners"
      ? sb.from("show_suppliers").select("*").eq("business_id", biz).eq("active", true).order("name")
      : Promise.resolve({ data: [] as never[] }),
    tab === "shows"
      ? sb.from("show_products").select("*").eq("business_id", biz).order("name")
      : Promise.resolve({ data: [] as never[] }),
    wantsMaster
      ? sb
          .from("show_bus_stops")
          .select("id,island,zone,resort,stop_name,pickup_time,sort_order,runs_on,guide_notes,active,map_url,photo_url")
          .eq("business_id", biz)
          .order("island")
          .order("sort_order")
          .order("stop_name")
      : Promise.resolve({ data: [] as never[] }),
    wantsMaster
      ? sb.from("show_hotels").select("id,name,island,bus_stop_id,active").eq("business_id", biz).order("name")
      : Promise.resolve({ data: [] as never[] }),
    tab === "stops"
      ? sb
          .from("show_bus_orders")
          .select("*")
          .eq("business_id", biz)
          .order("show_date", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] as never[] }),
    tab === "partners"
      ? sb.from("show_supplier_rates").select("*").eq("business_id", biz).order("name")
      : Promise.resolve({ data: [] as never[] }),
  ]);

  // Per-partner sales for the list rows — aggregated in SQL, never row-fetched.
  const statsYear = new Date().getUTCFullYear();
  const { data: partnerTotals } =
    tab === "partners"
      ? await sb.rpc("show_ops_partner_totals", {
          p_business: biz,
          p_from: `${statsYear}-01-01`,
          p_to: `${statsYear}-12-31`,
        })
      : { data: [] as never[] };
  const supplierStats = Object.fromEntries(
    ((partnerTotals ?? []) as Array<{ supplier_id: string; bookings: number; pax: number; revenue: number }>).map(
      (r) => [r.supplier_id, { bookings: Number(r.bookings), pax: Number(r.pax), revenue: Number(r.revenue) }],
    ),
  );

  const hotelsByStop: Record<string, number> = {};
  for (const h of (hotels ?? []) as Array<{ bus_stop_id: string | null }>) {
    if (h.bus_stop_id) hotelsByStop[h.bus_stop_id] = (hotelsByStop[h.bus_stop_id] ?? 0) + 1;
  }

  const title =
    tab === "partners"
      ? "Partners"
      : tab === "rates"
        ? "Rates & commissions"
        : tab === "hotels"
          ? "Hotels & pick-ups"
          : tab === "stops"
            ? "Pick-up points"
            : "Shows";
  const intro =
    tab === "partners"
      ? "Sellers — ticket shops, agencies, hotels, web. Type and location match the old Partners list. Commission cards live under Rates."
      : tab === "rates"
        ? "Commission cards (sale vs invoice). Partners pick one of these — they are not sellers."
        : tab === "hotels"
          ? "Every hotel and the pick-up point it uses. Pick-up points, run order and bus orders are on their own tab."
          : tab === "stops"
            ? "Bus stops, printed times, permanent run order and buses ordered per night. Changing a stop never wipes bookings."
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

      {tab === "hotels" || tab === "stops" ? (
      <>
      <div className="flex flex-wrap gap-2">
        <ShowOpsPill href="/dashboard/show-ops/master?tab=hotels" on={tab === "hotels"}>
          Hotels
        </ShowOpsPill>
        <ShowOpsPill href="/dashboard/show-ops/master?tab=stops" on={tab === "stops"}>
          Pick-up points
        </ShowOpsPill>
      </div>

      {tab === "hotels" ? (
      <section id="hotels" className="scroll-mt-24 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="font-semibold text-slate-900">Hotels</h2>
        <p className="mt-1 text-xs text-slate-500">
          Each hotel points at one pick-up point; the resort and time come from that stop. Filter by island or
          resort, or type any part of the name.
        </p>
        <div className="mt-3">
          <HotelsDirectory
            hotels={(hotels ?? []) as never}
            stops={(stops ?? []) as never}
            islands={islands}
            highlightId={created}
          />
        </div>
      </section>
      ) : null}

      {tab === "stops" ? (
      <>
      <section id="stops" className="scroll-mt-24 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="font-semibold text-slate-900">Pick-up points</h2>
        <p className="mt-1 text-xs text-slate-500">
          Bus stops with their printed time and which nights they run. Changing a time here moves every booking on
          that stop; hotels keep their stop.
        </p>
        <div className="mt-3">
          <PickupPointsDirectory
            stops={(stops ?? []) as never}
            hotelsByStop={hotelsByStop}
            islands={islands}
            highlightId={created}
          />
        </div>
      </section>

      <section id="buses" className="scroll-mt-24 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="font-semibold text-slate-900">Bus orders (buses, seats + cost)</h2>
        <p className="mt-1 text-xs text-slate-500">
          How many buses and seats were ordered per island-night — drives the outlook spaces and cost-per-head reports.
        </p>
        <form action={upsertBusOrderAction} className="mt-3 grid gap-2 sm:grid-cols-5">
          <input type="hidden" name="tab" value="stops" />
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
          <Field label="Buses" name="bus_count" type="number" defaultValue={1} />
          <Field label="Seats ordered" name="seats_ordered" type="number" defaultValue={50} />
          <Field label="Cost €" name="cost_total" type="number" step="0.01" defaultValue={0} />
          <Field label="Notes" name="notes" />
          <SubmitOnce className={`${SHOW_OPS_PRIMARY_BTN} sm:col-span-5`}>Save bus order</SubmitOnce>
        </form>
        <ul className="mt-4 divide-y text-sm">
          {pinCreated(busOrders ?? [], created).map((b) => (
            <li
              key={b.id}
              id={`created-${b.id}`}
              className={`py-2 ${created === b.id ? "rounded-lg bg-violet-50 px-2 font-medium" : ""}`}
            >
              {b.show_date} · {b.island} · {Number(b.bus_count ?? 1)} bus{Number(b.bus_count ?? 1) === 1 ? "" : "es"} ·{" "}
              {b.seats_ordered} seats · €{b.cost_total}
            </li>
          ))}
        </ul>
      </section>
      </>
      ) : null}
      </>
      ) : null}
    </div>
  );
}
