import Link from "next/link";

import { requireShowOpsPage } from "@/lib/show-ops/access";
import { productRunsOnDate } from "@/lib/show-ops/calendar";
import { addDaysIso, paxTotal } from "@/lib/show-ops/calc";
import { todayIsoUtc } from "@/lib/show-ops/nights";
import { ShowOpsPageHeader, ShowOpsPill } from "@/components/show-ops/show-ops-page-header";

/**
 * Weekly outlook, organised the way the operation actually flies:
 * one section per airport code, resorts as columns, bus/direct split,
 * hotels + rates behind each night.
 */

type ResortCol = { key: string; label: string };

type Section = {
  id: string;
  code: string;
  title: string;
  island: string;
  /** show_bus_stops.zone values that belong to this section (Tenerife split) */
  zones: string[] | null;
  resorts: ResortCol[];
};

/*
 * Sections follow the airport codes the operation flies on. Joel (1 Sept):
 * FUE dropped, South and West Tenerife folded into one TFS block (the resorts
 * stay as separate columns), Puerto de la Cruz no longer gets its own column
 * — anything still booked there lands in "Other".
 */
const SECTIONS: Section[] = [
  {
    id: "ace", code: "ACE", title: "Lanzarote", island: "Lanzarote", zones: null,
    resorts: [
      { key: "CT", label: "Costa Teguise" },
      { key: "PB", label: "Playa Blanca" },
      { key: "PDC", label: "Puerto del Carmen" },
    ],
  },
  {
    id: "lpa", code: "LPA", title: "Gran Canaria (GC)", island: "Gran Canaria", zones: null,
    resorts: [
      { key: "PDI", label: "Playa del Inglés" },
      { key: "PR", label: "Puerto Rico" },
      { key: "MAS", label: "Maspalomas" },
      { key: "LPA", label: "Las Palmas" },
    ],
  },
  {
    id: "tfs", code: "TFS", title: "Tenerife · South & West", island: "Tenerife", zones: null,
    resorts: [
      { key: "TFS", label: "South · Las Américas / Los Cristianos" },
      { key: "TFCA", label: "South · Costa Adeje / La Caleta" },
      { key: "TFGolf", label: "South · Golf del Sur" },
      { key: "TFW", label: "West · Los Gigantes" },
    ],
  },
  { id: "uk", code: "UK", title: "UK Tour", island: "UK", zones: null, resorts: [] },
];

const DIRECT_KEY = "__direct__";

type HotelRow = { pax: number; value: number; stops: Set<string>; resort: string };
/** Adult / child price for a show running that night — the rates the phone asks for. */
type RateRow = { show: string; adult: number; child: number };
type Night = {
  date: string;
  shows: Set<string>;
  cells: Map<string, { bus: number; direct: number }>;
  hotels: Map<string, HotelRow>;
  rates: Map<string, RateRow>;
  bookings: number;
  pax: number;
  value: number;
  busPax: number;
};

function fmtDate(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

/** Roll the night's hotels up into their resorts — the other half of "sort by resort AND hotel". */
function groupHotelsByResort(
  hotels: Map<string, HotelRow>,
): Map<string, { pax: number; value: number; hotels: number }> {
  const out = new Map<string, { pax: number; value: number; hotels: number }>();
  for (const h of hotels.values()) {
    const key = h.resort || "Other";
    const row = out.get(key) ?? { pax: 0, value: 0, hotels: 0 };
    row.pax += h.pax;
    row.value += h.value;
    row.hotels += 1;
    out.set(key, row);
  }
  return out;
}

function euro(n: number) {
  return `€${n.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;
}

export default async function WeeklyOutlookPage({
  searchParams,
}: {
  searchParams: Promise<{ by?: string; days?: string }>;
}) {
  const sp = await searchParams;
  // Resort and hotel are different questions — "which resort is filling up" vs
  // "which hotel is sending them" — so the night detail groups by either.
  const groupBy: "resort" | "hotel" = sp.by === "resort" ? "resort" : "hotel";
  // 7 nights for the phone-desk view, 14 for bus planning. Default 14.
  // Default to 7 nights (Joel, 5 Sept); 14 is the opt-in view.
  const days: 7 | 14 = sp.days === "14" ? 14 : 7;
  const hrefFor = (next: { by?: "resort" | "hotel"; days?: 7 | 14 }) => {
    const by = next.by ?? groupBy;
    const d = next.days ?? days;
    const p = new URLSearchParams();
    if (by === "resort") p.set("by", "resort");
    if (d !== 7) p.set("days", String(d));
    const q = p.toString();
    return q ? `/dashboard/show-ops/outlook?${q}` : "/dashboard/show-ops/outlook";
  };
  const ctx = await requireShowOpsPage("outlook");
  const today = todayIsoUtc();
  const endIso = addDaysIso(today, days);

  const [{ data: products }, { data: bookings }, { data: busOrders }, { data: stops }] = await Promise.all([
    ctx.supabase
      .from("show_products")
      .select("id,name,island,capacity,run_weekdays,active,adult_price,child_price")
      .eq("business_id", ctx.business.id)
      .eq("active", true),
    ctx.supabase
      .from("show_bookings")
      .select(
        "show_date,hotel_name,adults,children,infants,transport_required,show_name,pickup_stop_id,pickup_stop_name,pickup_time,island,total_cost",
      )
      .eq("business_id", ctx.business.id)
      .gte("show_date", today)
      .lte("show_date", endIso)
      .is("cancelled_at", null)
      .order("show_date"),
    ctx.supabase
      .from("show_bus_orders")
      .select("show_date,island,seats_ordered,bus_count,cost_total")
      .eq("business_id", ctx.business.id)
      .gte("show_date", today)
      .lte("show_date", endIso),
    ctx.supabase
      .from("show_bus_stops")
      .select("id,island,zone,resort,stop_name")
      .eq("business_id", ctx.business.id),
  ]);

  const stopById = new Map(
    (stops ?? []).map((s) => [s.id, { zone: (s.zone as string | null) ?? "", island: s.island as string, name: s.stop_name as string }]),
  );

  // date -> island -> bus order
  const busOrderByDateIsland = new Map<string, { seats: number; buses: number }>();
  for (const o of busOrders ?? []) {
    const key = `${o.show_date}|${o.island}`;
    const prev = busOrderByDateIsland.get(key) ?? { seats: 0, buses: 0 };
    // Sum rather than overwrite, so a second order row for the same night adds up.
    busOrderByDateIsland.set(key, {
      seats: prev.seats + (Number(o.seats_ordered) || 0),
      buses: prev.buses + Math.max(1, Number((o as { bus_count?: number }).bus_count) || 1),
    });
  }
  // island bus pax across ALL sections of that island (bus orders are per island, not per zone)
  const islandBusPax = new Map<string, number>();

  const sectionFor = (islandName: string, zone: string | null): Section | undefined => {
    const candidates = SECTIONS.filter((s) => s.island === islandName);
    if (candidates.length === 0) return undefined;
    if (candidates.length === 1) return candidates[0];
    return candidates.find((s) => zone && s.zones?.includes(zone)) ?? candidates[0];
  };

  // Build nights per section
  const nightsBySection = new Map<string, Map<string, Night>>();
  const nightFor = (section: Section, date: string): Night => {
    let m = nightsBySection.get(section.id);
    if (!m) {
      m = new Map();
      nightsBySection.set(section.id, m);
    }
    let n = m.get(date);
    if (!n) {
      n = {
        date,
        shows: new Set(),
        cells: new Map(),
        hotels: new Map(),
        rates: new Map(),
        bookings: 0,
        pax: 0,
        value: 0,
        busPax: 0,
      };
      m.set(date, n);
    }
    return n;
  };

  // Seed nights from products that run in the window
  const dates: string[] = [];
  for (let d = today; d <= endIso; d = addDaysIso(d, 1)) dates.push(d);
  for (const section of SECTIONS) {
    const sectionProducts = (products ?? []).filter(
      (p) => p.island === section.island || (section.island === "UK" && String(p.island).startsWith("UK")),
    );
    for (const date of dates) {
      for (const p of sectionProducts) {
        if (productRunsOnDate(p.run_weekdays as number[] | null, date)) {
          const night = nightFor(section, date);
          night.shows.add(p.name);
          night.rates.set(p.name, {
            show: p.name as string,
            adult: Number(p.adult_price) || 0,
            child: Number(p.child_price) || 0,
          });
        }
      }
    }
  }

  // Fold in bookings
  for (const b of bookings ?? []) {
    const stop = b.pickup_stop_id ? stopById.get(b.pickup_stop_id) : null;
    const zone = stop?.zone || null;
    const section = sectionFor(b.island as string, zone);
    if (!section) continue;
    const night = nightFor(section, b.show_date as string);
    const pax = paxTotal(b.adults, b.children, b.infants);
    const value = Number(b.total_cost) || 0;
    if (b.show_name) night.shows.add(b.show_name);
    night.bookings += 1;
    night.pax += pax;
    night.value += value;

    const cellKey = section.resorts.some((r) => r.key === zone) ? (zone as string) : DIRECT_KEY;
    const cell = night.cells.get(cellKey) ?? { bus: 0, direct: 0 };
    if (b.transport_required) {
      cell.bus += pax;
      night.busPax += pax;
      islandBusPax.set(`${b.show_date}|${b.island}`, (islandBusPax.get(`${b.show_date}|${b.island}`) ?? 0) + pax);
    } else {
      cell.direct += pax;
    }
    night.cells.set(cellKey, cell);

    const hotelName = (b.hotel_name as string) || "No hotel given";
    const hotel =
      night.hotels.get(hotelName) ?? { pax: 0, value: 0, stops: new Set<string>(), resort: "" };
    if (!hotel.resort) hotel.resort = section.resorts.find((r) => r.key === zone)?.label || "Other";
    hotel.pax += pax;
    hotel.value += value;
    if (stop?.name) hotel.stops.add(`${stop.name}${b.pickup_time ? ` · ${String(b.pickup_time).slice(0, 5)}` : ""}`);
    else if (b.pickup_stop_name) hotel.stops.add(b.pickup_stop_name);
    night.hotels.set(hotelName, hotel);
  }

  return (
    <div className="space-y-8">
      <ShowOpsPageHeader
        eyebrow="Overview"
        title="Weekly outlook"
        subtitle={`Next ${days} nights by airport — resorts, bus vs direct, hotels, rates and buses. Order buses on the show calendar.`}
        actions={
          <Link href="/dashboard/show-ops/calendar" className="text-sm font-semibold text-[var(--show-ops-primary,#7c3aed)]">
            Open calendar
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {SECTIONS.map((s) => (
          <ShowOpsPill key={s.id} href={`#${s.id}`} on={false}>
            {s.code}
          </ShowOpsPill>
        ))}
        <span className="mx-1 hidden h-6 w-px bg-slate-200 sm:inline-block" />
        <span className="text-xs font-medium text-slate-500">Break each night down by</span>
        <ShowOpsPill href={hrefFor({ by: "hotel" })} on={groupBy === "hotel"}>
          Hotel
        </ShowOpsPill>
        <ShowOpsPill href={hrefFor({ by: "resort" })} on={groupBy === "resort"}>
          Resort
        </ShowOpsPill>
        <span className="mx-1 hidden h-6 w-px bg-slate-200 sm:inline-block" />
        <span className="text-xs font-medium text-slate-500">Show</span>
        <ShowOpsPill href={hrefFor({ days: 7 })} on={days === 7}>
          7 nights
        </ShowOpsPill>
        <ShowOpsPill href={hrefFor({ days: 14 })} on={days === 14}>
          14 nights
        </ShowOpsPill>
      </div>

      {SECTIONS.map((section) => {
        const nights = [...(nightsBySection.get(section.id)?.values() ?? [])]
          .filter((n) => n.pax > 0 || n.shows.size > 0)
          .sort((a, b) => a.date.localeCompare(b.date));
        const isUk = section.island === "UK";
        const totals = nights.reduce(
          (acc, n) => ({ pax: acc.pax + n.pax, bookings: acc.bookings + n.bookings, value: acc.value + n.value }),
          { pax: 0, bookings: 0, value: 0 },
        );

        return (
          <section key={section.id} id={section.id} className="scroll-mt-20 rounded-2xl bg-white ring-1 ring-slate-200">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-900">
                <span className="mr-2 rounded-md bg-[var(--show-ops-primary,#7c3aed)]/10 px-2 py-0.5 font-mono text-sm font-bold text-[var(--show-ops-primary,#7c3aed)]">
                  {section.code}
                </span>
                {section.title}
              </h2>
              <p className="text-sm text-slate-500">
                {totals.pax} pax · {totals.bookings} bookings · {euro(totals.value)} in the next {days} nights
              </p>
            </div>

            {!nights.length ? (
              <p className="px-5 py-6 text-sm text-slate-400">No shows or bookings in the next {days} nights.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="text-[13px] font-semibold text-slate-900">
                      <th className="px-5 py-3 text-left font-semibold text-slate-400">{section.code}</th>
                      {section.resorts.map((r) => (
                        <th key={r.key} colSpan={2} className="border-l border-slate-200 px-2 py-3 text-center">
                          {r.label}
                        </th>
                      ))}
                      <th className="border-l border-slate-200 px-3 py-3 text-center">{isUk ? "Pax" : "Other"}</th>
                      <th className="border-l-2 border-slate-200 px-4 py-3 text-center">Total</th>
                      <th className="px-3 py-3 text-right font-medium text-slate-400">€</th>
                      {!isUk ? <th className="px-3 py-3 text-right font-medium text-slate-400">Bus</th> : null}
                    </tr>
                    {section.resorts.length ? (
                      <tr className="text-[10px] uppercase tracking-wide text-slate-400">
                        <th />
                        {section.resorts.map((r) => (
                          <>
                            <th key={`${r.key}-b`} className="border-l border-slate-200 bg-slate-50 px-2 pb-2 text-center font-medium">Bus</th>
                            <th key={`${r.key}-d`} className="px-2 pb-2 text-center font-medium">Direct</th>
                          </>
                        ))}
                        <th />
                        <th className="border-l-2 border-slate-200" />
                        <th />
                        {!isUk ? <th /> : null}
                      </tr>
                    ) : null}
                  </thead>
                  <tbody>
                    {nights.map((n) => {
                      const order = busOrderByDateIsland.get(`${n.date}|${section.island}`);
                      const allIslandBusPax = islandBusPax.get(`${n.date}|${section.island}`) ?? 0;
                      const seatsLeft = order ? order.seats - allIslandBusPax : null;
                      const other = n.cells.get(DIRECT_KEY);
                      return (
                        <tr key={n.date} className="border-t border-slate-100">
                          <td className="px-5 py-4">
                            <details className="group">
                              <summary className="cursor-pointer list-none">
                                <span className="font-semibold text-slate-900">{fmtDate(n.date)}</span>
                                {n.hotels.size || n.rates.size ? (
                                  <span className="ml-1.5 text-[11px] text-slate-400 group-open:hidden">▸</span>
                                ) : null}
                              </summary>
                              {n.hotels.size || n.rates.size ? (
                                <div className="mt-2 space-y-1 text-xs">
                                  {/* Ticket rates for what runs tonight — the number the phone actually asks for. */}
                                  {[...n.rates.values()].map((r) => (
                                    <p key={r.show} className="text-slate-500">
                                      <span className="font-medium text-slate-700">{r.show}</span> ·{" "}
                                      {euro(r.adult)} adult / {euro(r.child)} child
                                    </p>
                                  ))}
                                  {!n.rates.size ? (
                                    <p className="max-w-[240px] text-slate-400">{[...n.shows].join(" · ")}</p>
                                  ) : null}
                                  {groupBy === "resort"
                                    ? [...groupHotelsByResort(n.hotels).entries()]
                                        .sort((a, b) => b[1].pax - a[1].pax)
                                        .map(([resort, r]) => (
                                          <p key={resort} className="text-slate-500">
                                            <span className="font-medium text-slate-700">{resort}</span> · {r.pax} pax ·{" "}
                                            {euro(r.value)}
                                            <span className="text-slate-400"> · {r.hotels} hotels</span>
                                          </p>
                                        ))
                                    : [...n.hotels.entries()]
                                        .sort((a, b) => b[1].pax - a[1].pax)
                                        .map(([hotel, h]) => (
                                          <p key={hotel} className="text-slate-500">
                                            <span className="font-medium text-slate-700">{hotel}</span> · {h.pax} pax ·{" "}
                                            {euro(h.value)}
                                            {h.stops.size ? (
                                              <span className="text-slate-400"> · {[...h.stops].join(" · ")}</span>
                                            ) : null}
                                          </p>
                                        ))}
                                  <Link
                                    href={`/dashboard/show-ops/calendar?date=${n.date}&island=${encodeURIComponent(section.island)}`}
                                    className="inline-block font-medium text-[var(--show-ops-primary,#7c3aed)]"
                                  >
                                    Open on calendar →
                                  </Link>
                                </div>
                              ) : null}
                            </details>
                          </td>
                          {section.resorts.map((r) => {
                            const c = n.cells.get(r.key);
                            return (
                              <>
                                <td key={`${r.key}-b`} className={`border-l border-slate-100 bg-slate-50 px-2 py-4 text-center tabular-nums ${c?.bus ? "font-semibold text-slate-900" : "text-slate-300"}`}>
                                  {c?.bus ?? 0}
                                </td>
                                <td key={`${r.key}-d`} className={`px-2 py-4 text-center tabular-nums ${c?.direct ? "text-slate-800" : "text-slate-300"}`}>
                                  {c?.direct ?? 0}
                                </td>
                              </>
                            );
                          })}
                          <td className={`border-l border-slate-100 px-3 py-4 text-center tabular-nums ${other && other.bus + other.direct ? "text-slate-800" : "text-slate-300"}`}>
                            {other ? other.bus + other.direct : 0}
                          </td>
                          <td className="border-l-2 border-slate-200 px-4 py-4 text-center text-[15px] font-bold tabular-nums text-slate-900">
                            {n.pax}
                          </td>
                          <td className="px-3 py-4 text-right tabular-nums text-slate-500">{n.value ? euro(n.value) : "—"}</td>
                          {!isUk ? (
                            <td className="px-3 py-4 text-right text-xs">
                              {order ? (
                                <span className={seatsLeft != null && seatsLeft < 0 ? "font-semibold text-rose-600" : "text-slate-500"}>
                                  <span className="block font-medium text-slate-700">
                                    {order.buses} bus{order.buses === 1 ? "" : "es"}
                                  </span>
                                  {allIslandBusPax}/{order.seats}
                                </span>
                              ) : n.busPax ? (
                                <span className="font-medium text-amber-600">no bus</span>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
