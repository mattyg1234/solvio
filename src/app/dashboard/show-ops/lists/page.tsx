import Link from "next/link";

import { ArrivalPaxForm } from "@/components/show-ops/arrival-pax-form";
import { BusPickupSelect } from "@/components/show-ops/bus-pickup-select";
import { ListFlagButton } from "@/components/show-ops/list-flag-button";
import { NightListChips, nightListsHref } from "@/components/show-ops/night-list-chips";
import { NoShowDecisionForm } from "@/components/show-ops/no-show-decision";
import { PrintButton } from "@/components/show-ops/print-button";
import { ShowOpsPageHeader, ShowOpsPill } from "@/components/show-ops/show-ops-page-header";
import { requireShowOpsEnabled } from "@/lib/show-ops/access";
import { pickupStopOffered } from "@/lib/show-ops/bus";
import { formatShowOpsMoney, formatShowOpsPax, paxTotal, showOpsArrivalMark, showOpsBookingPayView, showOpsDoorPayPhrase, surnameKey } from "@/lib/show-ops/calc";
import { hasShowOpsModule } from "@/lib/show-ops/config";
import {
  clickNightListSort,
  parseNightListSort,
  parseNightListViews,
  toggleNightListView,
  type NightListView,
} from "@/lib/show-ops/lists";

type BookingRow = {
  id: string;
  booking_ref: string;
  guest_name: string;
  guest_mobile: string | null;
  show_name: string;
  island: string;
  hotel_name: string | null;
  supplier_name: string | null;
  supplier_ticket_number: string | null;
  adults: number;
  children: number;
  infants: number;
  transport_required: boolean;
  pickup_stop_id: string | null;
  pickup_stop_name: string | null;
  pickup_time: string | null;
  dietary_required: boolean;
  dietary_notes: string | null;
  office_comments: string | null;
  billing_mode: string;
  payment_status: string;
  total_cost: number;
  balance_remaining: number;
  nett_total: number | null;
  cancelled_at: string | null;
  arrived_at: string | null;
  arrived_pax: number | null;
  door_pay_method: string | null;
  no_show: boolean | null;
  no_show_charge: "charge" | "write_off" | null;
  no_show_proof_path: string | null;
  invoice_id: string | null;
  proofUrl?: string | null;
  custom_answers: unknown;
  sales_channel: string;
  created_at: string;
};

function timeKey(raw: string | null | undefined): string {
  return String(raw || "99:99").slice(0, 5);
}

export default async function DailyListsPage({
  searchParams,
}: {
  searchParams: Promise<{
    date?: string;
    island?: string;
    tab?: string;
    views?: string;
    show?: string;
    sort?: string;
    q?: string;
    diet?: string;
    time_from?: string;
    time_to?: string;
    spaces?: string;
  }>;
}) {
  const sp = await searchParams;
  const ctx = await requireShowOpsEnabled();
  if (!hasShowOpsModule(ctx.config, ctx.tier, "lists")) {
    return <p className="text-sm text-slate-600">Lists are not enabled for this workspace.</p>;
  }

  const date = sp.date || new Date().toISOString().slice(0, 10);
  const island = sp.island || "";
  const views = parseNightListViews(sp);
  const showFilter = sp.show || "";
  const sortKeys = parseNightListSort(sp.sort, views.includes("bus") && views.length === 1 ? ["time"] : ["supplier"]);
  const sort = sortKeys.join(",");
  const q = (sp.q || "").trim().toLowerCase();
  const dietOnly = sp.diet === "1";
  const timeFrom = sp.time_from || "";
  const timeTo = sp.time_to || "";
  const spacesOnly = sp.spaces === "1";
  const money = (n: number) => formatShowOpsMoney(n, ctx.config.currency);

  let query = ctx.supabase
    .from("show_bookings")
    .select("*")
    .eq("business_id", ctx.business.id)
    .eq("show_date", date);
  if (island) query = query.eq("island", island);
  query = query.is("cancelled_at", null);

  const [{ data: bookingRows }, { data: stopRows }, { data: busOrders }, { data: savedShows }] = await Promise.all([
    query,
    ctx.supabase
      .from("show_bus_stops")
      .select("id,island,resort,stop_name,pickup_time,sort_order,guide_notes,active,runs_on")
      .eq("business_id", ctx.business.id)
      .order("sort_order"),
    ctx.supabase
      .from("show_bus_orders")
      .select("island,seats_ordered")
      .eq("business_id", ctx.business.id)
      .eq("show_date", date),
    ctx.supabase
      .from("show_products")
      .select("name")
      .eq("business_id", ctx.business.id)
      .eq("active", true)
      .order("name"),
  ]);

  const bookings = (bookingRows ?? []) as BookingRow[];
  await Promise.all(
    bookings
      .filter((b) => b.no_show_proof_path)
      .map(async (b) => {
        const { data } = await ctx.supabase.storage
          .from("show-ops-proofs")
          .createSignedUrl(b.no_show_proof_path!, 60 * 60);
        if (data?.signedUrl) b.proofUrl = data.signedUrl;
      }),
  );
  const stops = stopRows ?? [];
  const stopById = new Map(stops.map((s) => [s.id, s]));
  const seatsByIsland = new Map((busOrders ?? []).map((o) => [o.island, Number(o.seats_ordered) || 0]));

  const showNames = [
    ...new Set(
      [
        ...(savedShows ?? []).map((p) => p.name),
        ...bookings.map((b) => b.show_name),
        showFilter,
      ].filter(Boolean),
    ),
  ].sort();

  function matchesSearch(b: BookingRow): boolean {
    if (showFilter && b.show_name !== showFilter) return false;
    if (dietOnly && !b.dietary_required) return false;
    if (!q) return true;
    const hay = [
      b.guest_name,
      b.booking_ref,
      b.hotel_name,
      b.supplier_name,
      b.supplier_ticket_number,
      b.dietary_notes,
      b.pickup_stop_name,
      b.show_name,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  }

  const filtered = bookings.filter(matchesSearch);

  function compareRows(a: BookingRow, b: BookingRow, key: string): number {
    if (key === "name") return surnameKey(a.guest_name).localeCompare(surnameKey(b.guest_name));
    if (key === "hotel") return (a.hotel_name || "").localeCompare(b.hotel_name || "");
    if (key === "show") return (a.show_name || "").localeCompare(b.show_name || "");
    if (key === "diet") {
      const d = Number(b.dietary_required) - Number(a.dietary_required);
      if (d !== 0) return d;
      return (a.dietary_notes || "").localeCompare(b.dietary_notes || "");
    }
    if (key === "ticket") return (a.supplier_ticket_number || "").localeCompare(b.supplier_ticket_number || "");
    if (key === "time") return timeKey(a.pickup_time).localeCompare(timeKey(b.pickup_time));
    if (key === "ref") return a.booking_ref.localeCompare(b.booking_ref);
    const s = (a.supplier_name || "").localeCompare(b.supplier_name || "");
    if (s !== 0) return s;
    return surnameKey(a.guest_name).localeCompare(surnameKey(b.guest_name));
  }

  function sortRows(rows: BookingRow[]): BookingRow[] {
    const copy = [...rows];
    copy.sort((a, b) => {
      for (const key of sortKeys) {
        const c = compareRows(a, b, key);
        if (c !== 0) return c;
      }
      return 0;
    });
    return copy;
  }

  const office = sortRows(filtered);
  const meals = sortRows(filtered.filter((b) => b.dietary_required));
  const door = sortRows(filtered.filter((b) => !b.no_show || views.includes("door")));
  const busAll = filtered.filter((b) => b.transport_required);
  const bus = busAll
    .map((b) => {
      const stop = b.pickup_stop_id ? stopById.get(b.pickup_stop_id) : null;
      return {
        ...b,
        resort: stop?.resort || "",
        stop_sort: stop?.sort_order ?? 9999,
        guide_notes: stop?.guide_notes || "",
        time_key: timeKey(stop?.pickup_time || b.pickup_time),
        stop_label: stop ? `${stop.resort} · ${stop.stop_name}` : b.pickup_stop_name || "—",
      };
    })
    .filter((b) => {
      if (timeFrom && b.time_key < timeFrom) return false;
      if (timeTo && b.time_key > timeTo) return false;
      return true;
    })
    .sort((a, b) => {
      const islandCmp = (a.island || "").localeCompare(b.island || "");
      if (islandCmp !== 0) return islandCmp;
      const resortCmp = a.resort.localeCompare(b.resort);
      if (resortCmp !== 0) return resortCmp;
      if (a.stop_sort !== b.stop_sort) return a.stop_sort - b.stop_sort;
      return a.time_key.localeCompare(b.time_key);
    });

  const busPaxByIsland = new Map<string, number>();
  for (const b of busAll) {
    busPaxByIsland.set(b.island, (busPaxByIsland.get(b.island) || 0) + paxTotal(b.adults, b.children, b.infants));
  }

  const busGrouped = (() => {
    const groups: Array<{
      key: string;
      island: string;
      time: string;
      label: string;
      notes: string;
      pax: number;
      rows: typeof bus;
      seatsLeft: number | null;
    }> = [];
    const index = new Map<string, number>();
    for (const b of bus) {
      const key = b.pickup_stop_id || `none-${b.island}`;
      const seats = seatsByIsland.has(b.island) ? seatsByIsland.get(b.island)! : null;
      const used = busPaxByIsland.get(b.island) || 0;
      if (spacesOnly && (seats == null || seats - used <= 0)) continue;
      let gi = index.get(key);
      if (gi == null) {
        gi = groups.length;
        index.set(key, gi);
        groups.push({
          key,
          island: b.island,
          time: b.time_key === "99:99" ? "—" : b.time_key,
          label: b.stop_label,
          notes: b.guide_notes,
          pax: 0,
          rows: [],
          seatsLeft: seats != null ? seats - used : null,
        });
      }
      groups[gi].rows.push(b);
      groups[gi].pax += paxTotal(b.adults, b.children, b.infants);
    }
    return groups;
  })();
  for (const g of busGrouped) {
    g.rows = sortRows(g.rows) as typeof g.rows;
  }

  const usedStopIds = new Set(
    bookings.map((b) => b.pickup_stop_id).filter((id): id is string => Boolean(id)),
  );
  const stopOptions = stops
    .filter(
      (s) =>
        s.active !== false &&
        (usedStopIds.has(s.id) || pickupStopOffered(s, { island, showDate: date })),
    )
    .map((s) => ({
      id: s.id,
      label: `${s.island} · ${s.resort} · ${s.stop_name}${s.pickup_time ? ` · ${String(s.pickup_time).slice(0, 5)}` : ""}${s.runs_on ? ` · ${s.runs_on}` : ""}`,
    }));

  const byIsland = new Map<string, number>();
  const byChannel = new Map<string, number>();
  const byShow = new Map<string, number>();
  for (const b of bookings) {
    byIsland.set(b.island, (byIsland.get(b.island) || 0) + 1);
    byChannel.set(b.sales_channel, (byChannel.get(b.sales_channel) || 0) + 1);
    byShow.set(b.show_name, (byShow.get(b.show_name) || 0) + paxTotal(b.adults, b.children, b.infants));
  }

  const qs = (next?: { views?: NightListView[]; sort?: string }) =>
    nightListsHref({
      date,
      views: next?.views ?? views,
      island,
      show: showFilter,
      sort: next?.sort ?? sort,
      q: sp.q,
      timeFrom,
      timeTo,
      spacesOnly,
    });

  const sortHref = (key: string) => qs({ sort: clickNightListSort(sortKeys, key).join(",") });

  return (
    <div className="space-y-4 print:space-y-2">
      <div className="print:hidden space-y-3">
          <ShowOpsPageHeader
            eyebrow="Analytics"
            title="Night lists"
            subtitle={`One list per job. Tick here instead of reprinting and highlighting. ${date}${island ? ` · ${island}` : " · all islands"}.`}
            actions={<PrintButton label="Print / send this list" />}
          />
        <form method="get" className="flex flex-wrap items-end gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/80">
          <input type="hidden" name="views" value={views.join(",")} />
          <label className="text-xs font-medium text-slate-600">
            Date
            <input
              name="date"
              type="date"
              defaultValue={date}
              className="mt-1 block rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Island
            <select name="island" defaultValue={island} className="mt-1 block min-w-[10rem] rounded-lg border px-2 py-1.5 text-sm">
              <option value="">All islands</option>
              {ctx.config.islands.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Show
            <select name="show" defaultValue={showFilter} className="mt-1 block min-w-[12rem] rounded-lg border px-2 py-1.5 text-sm">
              <option value="">All shows</option>
              {showNames.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Sort
            <select name="sort" defaultValue={sortKeys[0] || "supplier"} className="mt-1 block rounded-lg border px-2 py-1.5 text-sm">
              <option value="supplier">Supplier + surname</option>
              <option value="name">Surname</option>
              <option value="hotel">Hotel</option>
              <option value="show">Show</option>
              <option value="time">Pickup time</option>
              <option value="diet">Dietary first</option>
              <option value="ticket">Ticket #</option>
              <option value="ref">Booking ref</option>
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Search
            <input
              name="q"
              defaultValue={sp.q || ""}
              placeholder="Name, hotel, ticket, ref…"
              className="mt-1 block min-w-[12rem] rounded-lg border px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex items-center gap-1.5 pb-2 text-xs text-slate-700">
            <input type="checkbox" name="diet" value="1" defaultChecked={dietOnly} /> Diet only
          </label>
          {views.includes("bus") ? (
            <>
              <label className="text-xs font-medium text-slate-600">
                From
                <input name="time_from" type="time" defaultValue={timeFrom} className="mt-1 block rounded-lg border px-2 py-1.5 text-sm" />
              </label>
              <label className="text-xs font-medium text-slate-600">
                To
                <input name="time_to" type="time" defaultValue={timeTo} className="mt-1 block rounded-lg border px-2 py-1.5 text-sm" />
              </label>
              <label className="flex items-center gap-1.5 pb-2 text-xs text-slate-700">
                <input type="checkbox" name="spaces" value="1" defaultChecked={spacesOnly} /> Island still has bus seats
              </label>
            </>
          ) : null}
          <button type="submit" className="rounded-xl bg-[var(--show-ops-primary,#7c3aed)] px-4 py-2 text-sm font-semibold text-white">
            Apply
          </button>
        </form>
      </div>

      <header className="mb-4 hidden print:block">
        <div className="flex items-center gap-3 border-b border-slate-300 pb-3">
          {ctx.branding.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ctx.branding.logoUrl} alt="" className="h-10 w-auto object-contain" />
          ) : null}
          <div>
            <p className="text-lg font-semibold" style={{ color: ctx.branding.primaryColor }}>
              {ctx.branding.displayName}
            </p>
            <p className="text-xs text-slate-600">
              {date}
              {island ? ` · ${island}` : ""}
              {showFilter ? ` · ${showFilter}` : ""}
              {views.length ? ` · ${views.join(" + ")}` : ""}
            </p>
          </div>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <NightListChips
          active={views}
          hrefFor={(id) => qs({ views: toggleNightListView(views, id) })}
        />
        <ShowOpsPill
          href={qs({ views: views.includes("sales") ? views.filter((v) => v !== "sales") : [...views, "sales"] })}
          on={views.includes("sales")}
        >
          Daily sales
        </ShowOpsPill>
      </div>
      <p className="print:hidden text-sm text-slate-500">
        Click a list to add it. Click again to remove. Click column headers to sort — each extra click adds another sort.
        {sortKeys.length > 1 ? ` Sorting by ${sortKeys.join(" then ")}.` : ""}
      </p>

      {views.includes("office") ? (
        <OfficeTable
          date={date}
          title="Office list"
          rows={office}
          questions={ctx.config.booking_questions.filter((q) => q.show_on_office_list)}
          money={money}
          sortKeys={sortKeys}
          sortHref={sortHref}
        />
      ) : null}

      {views.includes("meals") ? (
        <OfficeTable
          date={date}
          title="Special meals"
          rows={meals}
          questions={ctx.config.booking_questions.filter((q) => q.show_on_office_list)}
          money={money}
          sortKeys={sortKeys}
          sortHref={sortHref}
        />
      ) : null}

      {views.includes("door") ? <DoorTable rows={door} money={money} sortKeys={sortKeys} sortHref={sortHref} /> : null}

      {views.includes("bus") ? (
        <div className="space-y-4">
          {busGrouped.map((g) => (
            <div key={g.key} className="overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-200">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3">
                <h3 className="font-semibold">
                  {g.time} · {g.label}
                </h3>
                <p className="text-sm text-slate-600">
                  {g.pax} pax
                  {g.seatsLeft == null ? " · order a bus" : ` · ${g.seatsLeft} island seats left`}
                </p>
              </div>
              {g.notes ? <p className="border-b px-4 py-2 text-xs text-slate-500">{g.notes}</p> : null}
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <SortCol label="Guest" k="name" sortKeys={sortKeys} sortHref={sortHref} />
                    <SortCol label="Hotel" k="hotel" sortKeys={sortKeys} sortHref={sortHref} />
                    <th className="px-3 py-2">Pax</th>
                    <th className="px-3 py-2">Mobile</th>
                    <SortCol label="Diet" k="diet" sortKeys={sortKeys} sortHref={sortHref} />
                    <th className="px-3 py-2 print:hidden">Move stop</th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((b) => (
                    <tr key={b.id} className="border-t border-slate-100">
                      <td className="px-3 py-1.5">
                        <Link href={`/dashboard/show-ops/bookings/${b.id}`} className="font-medium hover:underline">
                          {b.guest_name}
                        </Link>
                        <div className="text-[11px] text-slate-500">{b.booking_ref}</div>
                      </td>
                      <td className="px-3 py-1.5">{b.hotel_name || "—"}</td>
                      <td className="px-3 py-1.5">{formatShowOpsPax(b.adults, b.children, b.infants)}</td>
                      <td className="px-3 py-1.5">{b.guest_mobile || "—"}</td>
                      <td className="px-3 py-1.5">{b.dietary_required ? b.dietary_notes || "Yes" : ""}</td>
                      <td className="px-3 py-1.5">
                        <BusPickupSelect
                          bookingId={b.id}
                          currentStopId={b.pickup_stop_id}
                          stops={stopOptions.filter((s) => s.label.startsWith(`${b.island} ·`))}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          {!busGrouped.length ? (
            <p className="rounded-2xl bg-white p-5 text-sm text-slate-500 ring-1 ring-slate-200">No bus guests for these filters.</p>
          ) : null}
        </div>
      ) : null}

      {views.includes("sales") ? (
        <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <h3 className="font-semibold">Daily sales · {date}</h3>
          <p className="mt-2 text-sm">Total bookings: {bookings.length}</p>
          <h4 className="mt-4 text-xs font-semibold uppercase text-slate-500">By island</h4>
          <ul className="text-sm">
            {[...byIsland.entries()].map(([k, v]) => (
              <li key={k}>
                {k}: {v}
              </li>
            ))}
          </ul>
          <h4 className="mt-4 text-xs font-semibold uppercase text-slate-500">By show (pax)</h4>
          <ul className="text-sm">
            {[...byShow.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([k, v]) => (
                <li key={k}>
                  {k}: {v}
                </li>
              ))}
          </ul>
          <h4 className="mt-4 text-xs font-semibold uppercase text-slate-500">By channel</h4>
          <ul className="text-sm">
            {[...byChannel.entries()].map(([k, v]) => (
              <li key={k}>
                {k}: {v}
              </li>
            ))}
          </ul>
          <a
            className="mt-4 inline-block text-sm font-semibold text-[var(--show-ops-primary,#7c3aed)] underline"
            href={`/api/show-ops/daily-sales.csv?date=${date}&island=${encodeURIComponent(island)}`}
          >
            Download summary + detail CSV
          </a>
        </div>
      ) : null}
    </div>
  );
}

function SortCol({
  label,
  k,
  sortKeys,
  sortHref,
}: {
  label: string;
  k: string;
  sortKeys: string[];
  sortHref: (key: string) => string;
}) {
  const rank = sortKeys.indexOf(k);
  return (
    <th className="px-3 py-2">
      <Link href={sortHref(k)} className={rank >= 0 ? "text-slate-900 underline" : "hover:underline"}>
        {label}
        {rank >= 0 ? <span className="ml-1 text-[10px] font-semibold text-slate-500">{rank + 1}</span> : null}
      </Link>
    </th>
  );
}

function DietCell({ row }: { row: BookingRow }) {
  if (!row.dietary_required) return <span className="text-slate-400">—</span>;
  return <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-950">{row.dietary_notes || "Yes"}</span>;
}

function OfficeTable({
  date,
  title,
  rows,
  questions,
  money,
  sortKeys,
  sortHref,
}: {
  date: string;
  title: string;
  rows: BookingRow[];
  questions: Array<{ id: string; label: string }>;
  money: (n: number) => string;
  sortKeys: string[];
  sortHref: (key: string) => string;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-200">
      <h3 className="border-b px-4 py-3 font-semibold">
        {title} · {date} · {rows.length} {rows.length === 1 ? "booking" : "bookings"}
      </h3>
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <SortCol label="Ref" k="ref" sortKeys={sortKeys} sortHref={sortHref} />
            <SortCol label="Supplier" k="supplier" sortKeys={sortKeys} sortHref={sortHref} />
            <SortCol label="Guest" k="name" sortKeys={sortKeys} sortHref={sortHref} />
            <SortCol label="Show" k="show" sortKeys={sortKeys} sortHref={sortHref} />
            <SortCol label="Hotel" k="hotel" sortKeys={sortKeys} sortHref={sortHref} />
            <th className="px-3 py-2">Pax</th>
            <SortCol label="Ticket" k="ticket" sortKeys={sortKeys} sortHref={sortHref} />
            <SortCol label="Diet" k="diet" sortKeys={sortKeys} sortHref={sortHref} />
            {questions.map((q) => (
              <th key={q.id} className="px-3 py-2">
                {q.label}
              </th>
            ))}
            <th className="px-3 py-2">Door</th>
            <th className="px-3 py-2">Owed</th>
            <th className="px-3 py-2">Comments</th>
            <th className="px-3 py-2 print:hidden">Tick</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => {
            const answers =
              b.custom_answers && typeof b.custom_answers === "object"
                ? (b.custom_answers as Record<string, string | boolean | number>)
                : {};
            const pay = showOpsBookingPayView({
              billingMode: b.billing_mode,
              totalCost: b.total_cost,
              balanceRemaining: b.balance_remaining,
              nettTotal: b.nett_total,
              paymentStatus: b.payment_status,
              cancelledAt: b.cancelled_at,
            });
            const arrival = showOpsArrivalMark({
              adults: b.adults,
              children: b.children,
              infants: b.infants,
              arrivedPax: b.arrived_pax,
              arrivedAt: b.arrived_at,
              noShow: b.no_show,
            });
            const payPhrase = showOpsDoorPayPhrase(b.door_pay_method);
            return (
              <tr key={b.id} className={`border-t border-slate-100 ${arrival.status === "all_in" ? "bg-emerald-50/40" : ""} ${arrival.status === "partial" ? "bg-amber-50/70" : ""} ${arrival.status === "absent" ? "bg-slate-100 text-slate-500" : ""}`}>
                <td className="px-3 py-1.5 font-mono text-xs">{b.booking_ref}</td>
                <td className="px-3 py-1.5">{b.supplier_name || "—"}</td>
                <td className="px-3 py-1.5">
                  <Link href={`/dashboard/show-ops/bookings/${b.id}`} className="font-medium hover:underline">
                    {b.guest_name}
                  </Link>
                </td>
                <td className="px-3 py-1.5">{b.show_name}</td>
                <td className="px-3 py-1.5">{b.hotel_name || "—"}</td>
                <td className="px-3 py-1.5 whitespace-nowrap">
                  {formatShowOpsPax(b.adults, b.children, b.infants)}
                  {arrival.status !== "pending" ? (
                    <span className={`block text-[11px] font-semibold ${arrival.status === "partial" ? "text-amber-800" : arrival.status === "all_in" ? "text-emerald-800" : "text-rose-700"}`}>
                      {arrival.shortLabel}
                      {arrival.status === "partial" && arrival.missing ? ` · ${arrival.missing} missing` : ""}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-1.5">{b.supplier_ticket_number || "—"}</td>
                <td className="px-3 py-1.5">
                  <DietCell row={b} />
                </td>
                {questions.map((q) => {
                  const v = answers[q.id];
                  const text = typeof v === "boolean" ? (v ? "Yes" : "No") : v != null && String(v).trim() ? String(v) : "—";
                  return (
                    <td key={q.id} className="px-3 py-1.5">
                      {text}
                    </td>
                  );
                })}
                <td className="px-3 py-1.5 whitespace-nowrap text-xs">
                  {arrival.doorLabel}
                  {payPhrase ? ` · ${payPhrase}` : ""}
                </td>
                <td className="px-3 py-1.5">
                  {pay.outstandingAmount != null && pay.outstandingAmount > 0 ? money(pay.outstandingAmount) : pay.label}
                </td>
                <td className="px-3 py-1.5">{b.office_comments || ""}</td>
                <td className="px-3 py-1.5">
                  <div className="flex flex-col gap-1">
                    <ArrivalPaxForm key={`${b.id}:${arrival.arrived}`} bookingId={b.id} mark={arrival} />
                    <NoShowDecisionForm
                      bookingId={b.id}
                      charge={b.no_show_charge === "write_off" || b.no_show_charge === "charge" ? b.no_show_charge : null}
                      missing={arrival.missing ?? 0}
                      booked={arrival.booked}
                      invoiced={Boolean(b.invoice_id)}
                      proofUrl={b.proofUrl ?? null}
                      compact
                    />
                    <div className="flex flex-wrap gap-1">
                      <ListFlagButton bookingId={b.id} flag="cash" label="Cash" hide={Boolean(b.door_pay_method || arrival.status === "absent")} />
                      <ListFlagButton bookingId={b.id} flag="card" label="On card" hide={Boolean(b.door_pay_method || arrival.status === "absent")} tone="sky" />
                      <ListFlagButton bookingId={b.id} flag="cash" label="Undo cash" hide={b.door_pay_method !== "cash"} undo />
                      <ListFlagButton bookingId={b.id} flag="card" label="Undo card" hide={b.door_pay_method !== "card"} undo />
                    </div>
                  </div>
                </td>
              </tr>
            );
          })}
          {!rows.length ? (
            <tr>
              <td colSpan={12 + questions.length} className="px-3 py-6 text-center text-slate-500">
                No rows
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function DoorTable({
  rows,
  money,
  sortKeys,
  sortHref,
}: {
  rows: BookingRow[];
  money: (n: number) => string;
  sortKeys: string[];
  sortHref: (key: string) => string;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-200">
      <h3 className="border-b px-4 py-3 font-semibold">Door · how many showed / paid cash / paid on card</h3>
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <SortCol label="Guest" k="name" sortKeys={sortKeys} sortHref={sortHref} />
            <SortCol label="Show" k="show" sortKeys={sortKeys} sortHref={sortHref} />
            <th className="px-3 py-2">Pax</th>
            <SortCol label="Ticket" k="ticket" sortKeys={sortKeys} sortHref={sortHref} />
            <SortCol label="Diet" k="diet" sortKeys={sortKeys} sortHref={sortHref} />
            <th className="px-3 py-2">Owed</th>
            <th className="px-3 py-2 print:hidden">Mark</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => {
            const pay = showOpsBookingPayView({
              billingMode: b.billing_mode,
              totalCost: b.total_cost,
              balanceRemaining: b.balance_remaining,
              nettTotal: b.nett_total,
              paymentStatus: b.payment_status,
              cancelledAt: b.cancelled_at,
            });
            const arrival = showOpsArrivalMark({
              adults: b.adults,
              children: b.children,
              infants: b.infants,
              arrivedPax: b.arrived_pax,
              arrivedAt: b.arrived_at,
              noShow: b.no_show,
            });
            return (
              <tr key={b.id} className={`border-t border-slate-100 ${arrival.status === "all_in" ? "bg-emerald-50/50" : ""} ${arrival.status === "partial" ? "bg-amber-50/70" : ""} ${arrival.status === "absent" ? "opacity-50" : ""}`}>
                <td className="px-3 py-2 font-medium">{b.guest_name}</td>
                <td className="px-3 py-2">{b.show_name}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {formatShowOpsPax(b.adults, b.children, b.infants)}
                  {arrival.status !== "pending" ? (
                    <span className={`block text-[11px] font-semibold ${arrival.status === "partial" ? "text-amber-800" : arrival.status === "all_in" ? "text-emerald-800" : "text-rose-700"}`}>
                      {arrival.shortLabel}
                      {arrival.status === "partial" && arrival.missing ? ` · ${arrival.missing} missing` : ""}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2">{b.supplier_ticket_number || "—"}</td>
                <td className="px-3 py-2">
                  <DietCell row={b} />
                </td>
                <td className="px-3 py-2">
                  {pay.outstandingAmount != null && pay.outstandingAmount > 0 ? money(pay.outstandingAmount) : pay.label}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-col gap-1">
                    <ArrivalPaxForm key={`${b.id}:${arrival.arrived}`} bookingId={b.id} mark={arrival} />
                    <NoShowDecisionForm
                      bookingId={b.id}
                      charge={b.no_show_charge === "write_off" || b.no_show_charge === "charge" ? b.no_show_charge : null}
                      missing={arrival.missing ?? 0}
                      booked={arrival.booked}
                      invoiced={Boolean(b.invoice_id)}
                      proofUrl={b.proofUrl ?? null}
                      compact
                    />
                    <div className="flex flex-wrap gap-1">
                      <ListFlagButton bookingId={b.id} flag="cash" label="Paid cash" hide={Boolean(b.door_pay_method || arrival.status === "absent")} />
                      <ListFlagButton bookingId={b.id} flag="card" label="Paid on card" hide={Boolean(b.door_pay_method || arrival.status === "absent")} tone="sky" />
                      <ListFlagButton bookingId={b.id} flag="cash" label="Undo cash" hide={b.door_pay_method !== "cash"} undo />
                      <ListFlagButton bookingId={b.id} flag="card" label="Undo card" hide={b.door_pay_method !== "card"} undo />
                    </div>
                  </div>
                </td>
              </tr>
            );
          })}
          {!rows.length ? (
            <tr>
              <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                No rows
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
