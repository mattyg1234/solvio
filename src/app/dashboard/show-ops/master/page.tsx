import { PartnerBillingFields } from "@/components/show-ops/partner-billing-fields";
import { loadDirectoryHotels, loadDirectoryStops } from "@/lib/show-ops/directory-data";
import { hotelNamesForStops } from "@/lib/show-ops/directory-search";
import {
  upsertBusOrderAction,
  upsertProductAction,
  upsertSupplierAction,
} from "@/app/dashboard/show-ops/actions";
import { HotelsDirectory } from "@/components/show-ops/hotels-directory";
import { MasterRatesForm } from "@/components/show-ops/master-rates-form";
import {
  MasterShowsForm,
  ShowProductFields,
} from "@/components/show-ops/master-shows-form";
import { MasterSuppliersForm } from "@/components/show-ops/master-suppliers-form";
import { redirect } from "next/navigation";
import { PickupPointsDirectory } from "@/components/show-ops/pickup-points-directory";
import { ScrollToCreated } from "@/components/show-ops/scroll-to-created";
import {
  SHOW_OPS_PRIMARY_BTN,
  ShowOpsPageHeader,
  ShowOpsPill,
} from "@/components/show-ops/show-ops-page-header";
import { SubmitOnce } from "@/components/show-ops/submit-once";
import { NumberInput } from "@/components/ui/number-input";
import { requireShowOpsPage } from "@/lib/show-ops/access";
import { buildRateGrid, type RateGridRow } from "@/lib/show-ops/rate-card-grid";
import { loadRatePrices } from "@/lib/show-ops/rate-cards";

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

function pinCreated<T extends { id: string }>(
  rows: T[] | null | undefined,
  created?: string,
): T[] {
  const list = rows ?? [];
  if (!created) return list;
  const hit = list.find((r) => r.id === created);
  if (!hit) return list;
  return [hit, ...list.filter((r) => r.id !== created)];
}

export default async function MasterDataPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    card?: string;
    saved?: string;
    created?: string;
    error?: string;
  }>;
}) {
  const sp = await searchParams;
  /*
   * Rates is a sub-tab of Partners. Since Sept 2026 every partner booking is
   * priced from the partner's sale rate card, so the cards and their per-show
   * prices are edited here rather than only in the database.
   */
  // Pick-up points moved onto the Bus board (Sept 2026); old links follow them there.
  if (sp.tab === "stops") redirect("/dashboard/show-ops/buses");
  const allowed = new Set(["shows", "partners", "rates", "hotels", "stops"]);
  const tab = sp.tab && allowed.has(sp.tab) ? sp.tab : "shows";
  const cardId = /^[0-9a-f-]{36}$/i.test(sp.card ?? "") ? sp.card : undefined;
  const created = /^[0-9a-f-]{36}$/i.test(sp.created ?? "")
    ? sp.created
    : undefined;
  const ctx = await requireShowOpsPage(
    tab === "partners" || tab === "rates"
      ? "partners"
      : tab === "hotels" || tab === "stops"
        ? "hotels"
        : "shows",
  );
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
      ? sb
          .from("show_suppliers")
          .select("*")
          .eq("business_id", biz)
          .eq("active", true)
          .order("name")
      : Promise.resolve({ data: [] as never[] }),
    tab === "shows" || tab === "rates"
      ? sb
          .from("show_products")
          .select("*")
          .eq("business_id", biz)
          .order("name")
      : Promise.resolve({ data: [] as never[] }),
    wantsMaster ? loadDirectoryStops(sb, biz) : Promise.resolve({ data: [] }),
    wantsMaster ? loadDirectoryHotels(sb, biz) : Promise.resolve({ data: [] }),
    tab === "stops"
      ? sb
          .from("show_bus_orders")
          .select("*")
          .eq("business_id", biz)
          .order("show_date", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] as never[] }),
    tab === "partners" || tab === "rates"
      ? sb
          .from("show_supplier_rates")
          .select("*")
          .eq("business_id", biz)
          .order("name")
      : Promise.resolve({ data: [] as never[] }),
  ]);

  // Rates tab: how many active partners sit on each card, and the open card's price grid.
  const ratePartnerCounts: Record<string, number> = {};
  let rateGrid: RateGridRow[] = [];
  const selectedRate =
    tab === "rates" && cardId
      ? (((rates ?? []) as Array<{ id: string }>).find((r) => r.id === cardId) ?? null)
      : null;
  if (tab === "rates") {
    const [{ data: onCards }, prices] = await Promise.all([
      sb
        .from("show_suppliers")
        .select("sale_rate_id,invoice_rate_id")
        .eq("business_id", biz)
        .eq("active", true)
        .limit(5000),
      selectedRate
        ? loadRatePrices(sb, biz, selectedRate.id)
        : Promise.resolve({ card: null, rows: [] }),
    ]);
    for (const s of onCards ?? []) {
      for (const id of new Set([s.sale_rate_id, s.invoice_rate_id])) {
        if (id) ratePartnerCounts[id] = (ratePartnerCounts[id] ?? 0) + 1;
      }
    }
    rateGrid = buildRateGrid(
      ((products ?? []) as Array<{ id: string; name: string; active: boolean }>).map(
        (p) => ({ id: p.id, name: p.name, active: Boolean(p.active) }),
      ),
      prices.rows.filter((r) => r.product_id),
    );
  }

  const ticketTypes: import("@/components/show-ops/ticket-types-editor").MasterTicketType[] =
    [];
  let ticketTypesError = false;
  if (tab === "shows") {
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await sb
        .from("show_ticket_types")
        .select(
          "id,product_id,name,description,adult_price,child_price,infant_price,adult_price_no_transport,child_price_no_transport,infant_price_no_transport,adult_nett,child_nett,transport_available,active",
        )
        .eq("business_id", biz)
        .order("product_id")
        .order("name")
        .order("id")
        .range(offset, offset + 499);
      if (error) {
        ticketTypesError = true;
        ticketTypes.length = 0;
        break;
      }
      ticketTypes.push(...(data ?? []));
      if (!data || data.length < 500) break;
    }
  }

  const extras: import("@/components/show-ops/extras-editor").MasterExtra[] =
    [];
  let extrasError = false;
  if (tab === "shows") {
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await sb
        .from("show_extras")
        .select(
          "id,product_id,name,description,unit_price,charge_basis,commissionable,active",
        )
        .eq("business_id", biz)
        .order("product_id")
        .order("name")
        .order("id")
        .range(offset, offset + 499);
      if (error) {
        extrasError = true;
        extras.length = 0;
        break;
      }
      extras.push(...(data ?? []));
      if (!data || data.length < 500) break;
    }
  }

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
    (
      (partnerTotals ?? []) as Array<{
        supplier_id: string;
        bookings: number;
        pax: number;
        revenue: number;
      }>
    ).map((r) => [
      r.supplier_id,
      {
        bookings: Number(r.bookings),
        pax: Number(r.pax),
        revenue: Number(r.revenue),
      },
    ]),
  );

  const hotelNamesByStop = hotelNamesForStops(hotels ?? []);
  const hotelsByStop: Record<string, number> = {};
  for (const h of (hotels ?? []) as Array<{ bus_stop_id: string | null }>) {
    if (h.bus_stop_id)
      hotelsByStop[h.bus_stop_id] = (hotelsByStop[h.bus_stop_id] ?? 0) + 1;
  }

  const title =
    tab === "partners"
      ? "Partners"
      : tab === "rates"
        ? "Rates & commissions"
        : tab === "hotels"
          ? "Hotels"
          : tab === "stops"
            ? "Pick-up points"
            : "Shows";
  const intro =
    tab === "partners"
      ? "Sellers — ticket shops, agencies, hotels, web. Type and location match the old Partners list. Rate cards and their prices live under Rates."
      : tab === "rates"
        ? "The rate cards partners are priced from. Edit a card’s name and %, retire it, or change what its partners sell each show for."
        : tab === "hotels"
          ? "Every hotel and the pick-up point it uses. The pick-up points themselves, their times and the run order are on the Bus board."
          : tab === "stops"
            ? "Bus stops, printed times, permanent run order and buses ordered per night. Changing a stop never wipes bookings."
            : "Set each show’s schedule, capacity and guest prices. Saving a price applies it to new bookings; changing existing bookings is a separate action.";

  return (
    <div className="space-y-8">
      <ShowOpsPageHeader eyebrow="Operations" title={title} subtitle={intro} />
      {sp.error ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {sp.error}
        </p>
      ) : null}
      {sp.saved === "bulk" ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Applied to the ticked rows.
        </p>
      ) : null}
      {sp.saved === "exists" ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Already on the list — opened it below so you can edit it.
        </p>
      ) : null}
      {sp.saved === "prices" ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Prices saved. New bookings use them from now; existing bookings keep
          the price they were sold at.
        </p>
      ) : null}
      {sp.saved === "none" ? (
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
          Nothing changed — no prices were different.
        </p>
      ) : null}
      {sp.saved === "1" && tab === "rates" ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Rate card saved.
        </p>
      ) : null}
      {sp.saved === "1" && tab !== "rates" ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Saved. The new row is at the top of the list.
        </p>
      ) : null}
      <ScrollToCreated id={created ?? (tab === "rates" ? cardId : undefined)} />

      {tab === "partners" || tab === "rates" ? (
        <div className="flex flex-wrap gap-2">
          <ShowOpsPill
            href="/dashboard/show-ops/master?tab=partners"
            on={tab === "partners"}
          >
            Partners
          </ShowOpsPill>
          <ShowOpsPill
            href="/dashboard/show-ops/master?tab=rates"
            on={tab === "rates"}
          >
            Rates
          </ShowOpsPill>
        </div>
      ) : null}

      {tab === "rates" ? (
        <section
          id="rates"
          className="scroll-mt-24 rounded-2xl bg-white p-5 ring-1 ring-slate-200"
        >
          <h2 className="font-semibold text-slate-900">Rates & commissions</h2>
          <p className="mt-1 text-xs text-slate-500">
            A partner’s sale card sets the price they sell each show at, with
            and without the bus. Attach a card to a partner on the Partners tab.
          </p>
          <MasterRatesForm
            key={`${cardId ?? ""}:${(rates ?? []).map((r) => `${r.id}:${r.name}:${r.commission_percent}:${r.active}`).join("|")}:${rateGrid.map((g) => `${g.bus.adult}/${g.bus.child}/${g.noBus.adult}/${g.noBus.child}`).join("|")}`}
            rates={(rates ?? []) as never}
            partnerCounts={ratePartnerCounts}
            selected={(selectedRate ?? null) as never}
            grid={rateGrid}
            currency={ctx.config.currency}
          />
        </section>
      ) : null}

      {tab === "partners" ? (
        <section
          id="partners"
          className="scroll-mt-24 rounded-2xl bg-white p-5 ring-1 ring-slate-200"
        >
          <h2 className="font-semibold text-slate-900">Partners</h2>
          <p className="mt-1 text-xs text-slate-500">
            Hotels and resellers with their own billing mode. Invoice email is
            where Verifactu packs are sent.
          </p>
          <form
            action={upsertSupplierAction}
            className="mt-3 grid gap-2 sm:grid-cols-3"
          >
            <input type="hidden" name="tab" value="partners" />
            <Field label="Name" name="name" required />
            <label className="text-xs font-medium text-slate-600">
              Partner type
              <select
                name="partner_type"
                className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm"
              >
                {ctx.config.partner_types.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-slate-600">
              Location
              <select
                name="island"
                className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm"
              >
                <option value="ALL">ALL</option>
                {islands.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </label>
            <Field label="Invoice email" name="email" type="email" />
            <Field label="Legal name" name="legal_name" />
            <Field label="NIF / tax ID" name="tax_id" />
            <Field label="Invoice address" name="invoice_address" />
            <PartnerBillingFields invoiceNettPercent={70} />
            <label className="text-xs font-medium text-slate-600">
              No-show default
              <select
                name="no_show_policy"
                className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm"
              >
                <option value="charge">Charge anyway</option>
                <option value="write_off">Write off</option>
              </select>
            </label>
            <SubmitOnce className={`${SHOW_OPS_PRIMARY_BTN} sm:col-span-3`}>
              Add partner
            </SubmitOnce>
          </form>
          <MasterSuppliersForm
            key={(suppliers ?? [])
              .map(
                (s) =>
                  `${s.id}:${s.billing_mode}:${s.deposit_percent}:${s.invoice_nett_percent}:${s.active}:${s.island}`,
              )
              .join("|")}
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
        <section
          id="shows"
          className="scroll-mt-24 rounded-2xl bg-white p-5 ring-1 ring-slate-200"
        >
          <h2 className="font-semibold text-slate-900">Show catalogue</h2>
          <p className="mt-1 text-sm text-slate-500">
            Edit an existing show below, or open Add a show to create a new one.
            Archive retired shows to keep their booking history.
          </p>
          <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <summary className="cursor-pointer font-semibold text-slate-900">
              + Add a show
            </summary>
            <form action={upsertProductAction} className="mt-4 space-y-4">
              <input type="hidden" name="tab" value="shows" />
              <ShowProductFields islands={islands} config={ctx.config} />
              <SubmitOnce className={SHOW_OPS_PRIMARY_BTN}>Add show</SubmitOnce>
            </form>
          </details>
          <h2 className="mt-6 font-semibold text-slate-900">
            Existing shows · {(products ?? []).length}
          </h2>
          <MasterShowsForm
            key={(products ?? [])
              .map(
                (p) =>
                  `${p.id}:${p.adult_price}:${p.child_price}:${p.capacity}:${p.island}`,
              )
              .join("|")}
            islands={islands}
            config={ctx.config}
            extras={extras}
            extrasError={extrasError}
            ticketTypes={ticketTypes}
            ticketTypesError={ticketTypesError}
            products={pinCreated((products ?? []) as never, created)}
            highlightId={created}
          />
        </section>
      ) : null}

      {tab === "hotels" || tab === "stops" ? (
        <>
          <div className="flex flex-wrap gap-2">
            <ShowOpsPill
              href="/dashboard/show-ops/master?tab=hotels"
              on={tab === "hotels"}
            >
              Hotels
            </ShowOpsPill>
            <ShowOpsPill href="/dashboard/show-ops/buses" on={false}>
              Pick-up points → Bus board
            </ShowOpsPill>
          </div>

          {tab === "hotels" ? (
            <section
              id="hotels"
              className="scroll-mt-24 rounded-2xl bg-white p-5 ring-1 ring-slate-200"
            >
              <h2 className="font-semibold text-slate-900">Hotels</h2>
              <p className="mt-1 text-xs text-slate-500">
                Each hotel points at one pick-up point; the resort and time come
                from that stop. Filter by island or resort, or type any part of
                the name.
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
              <section
                id="stops"
                className="scroll-mt-24 rounded-2xl bg-white p-5 ring-1 ring-slate-200"
              >
                <h2 className="font-semibold text-slate-900">Pick-up points</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Bus stops with their printed time and which nights they run.
                  Changing a time here moves every booking on that stop; hotels
                  keep their stop.
                </p>
                <div className="mt-3">
                  <PickupPointsDirectory
                    stops={(stops ?? []) as never}
                    hotelsByStop={hotelsByStop}
                    hotelNamesByStop={hotelNamesByStop}
                    islands={islands}
                    highlightId={created}
                  />
                </div>
              </section>

              <section
                id="buses"
                className="scroll-mt-24 rounded-2xl bg-white p-5 ring-1 ring-slate-200"
              >
                <h2 className="font-semibold text-slate-900">
                  Bus orders (buses, seats + cost)
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  How many buses and seats were ordered per island-night —
                  drives the outlook spaces and cost-per-head reports.
                </p>
                <form
                  action={upsertBusOrderAction}
                  className="mt-3 grid gap-2 sm:grid-cols-5"
                >
                  <input type="hidden" name="tab" value="stops" />
                  <Field label="Date" name="show_date" type="date" required />
                  <label className="text-xs font-medium text-slate-600">
                    Island
                    <select
                      name="island"
                      className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm"
                    >
                      {islands.map((i) => (
                        <option key={i} value={i}>
                          {i}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Field
                    label="Buses"
                    name="bus_count"
                    type="number"
                    defaultValue={1}
                  />
                  <Field
                    label="Seats ordered"
                    name="seats_ordered"
                    type="number"
                    defaultValue={50}
                  />
                  <Field
                    label="Cost €"
                    name="cost_total"
                    type="number"
                    step="0.01"
                    defaultValue={0}
                  />
                  <Field label="Notes" name="notes" />
                  <SubmitOnce
                    className={`${SHOW_OPS_PRIMARY_BTN} sm:col-span-5`}
                  >
                    Save bus order
                  </SubmitOnce>
                </form>
                <ul className="mt-4 divide-y text-sm">
                  {pinCreated(busOrders ?? [], created).map((b) => (
                    <li
                      key={b.id}
                      id={`created-${b.id}`}
                      className={`py-2 ${created === b.id ? "rounded-lg bg-violet-50 px-2 font-medium" : ""}`}
                    >
                      {b.show_date} · {b.island} · {Number(b.bus_count ?? 1)}{" "}
                      bus{Number(b.bus_count ?? 1) === 1 ? "" : "es"} ·{" "}
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
