import Link from "next/link";

import { requireShowOpsPage } from "@/lib/show-ops/access";
import { productRunsOnDate } from "@/lib/show-ops/calendar";
import { addDaysIso, paxTotal } from "@/lib/show-ops/calc";
import { todayIsoUtc } from "@/lib/show-ops/nights";
import { ShowOpsPageHeader, ShowOpsPill } from "@/components/show-ops/show-ops-page-header";

/**
 * Weekly outlook, organised the way the operation actually flies:
 * one section per airport code, resorts as columns, bus/direct split,
 * hotels + rates behind each night. Tenerife is split South / West.
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
    id: "fue", code: "FUE", title: "Fuerteventura", island: "Fuerteventura", zones: null,
    resorts: [
      { key: "CLT", label: "Caleta de Fuste" },
      { key: "CRR", label: "Corralejo" },
      { key: "JAN", label: "Jandía" },
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
    id: "tfs", code: "TFS", title: "Tenerife South", island: "Tenerife",
    zones: ["TFS", "TFGolf", "TFCA"],
    resorts: [
      { key: "TFS", label: "Las Américas / Los Cristianos" },
      { key: "TFGolf", label: "Golf del Sur" },
      { key: "TFCA", label: "Costa Adeje / La Caleta" },
    ],
  },
  {
    id: "tfw", code: "TFW", title: "Tenerife West", island: "Tenerife",
    zones: ["TFW", "CRZ"],
    resorts: [
      { key: "TFW", label: "Los Gigantes / West" },
      { key: "CRZ", label: "Puerto de la Cruz" },
    ],
  },
  { id: "uk", code: "UK", title: "UK Tour", island: "UK", zones: null, resorts: [] },
];

const DIRECT_KEY = "__direct__";

type HotelRow = { pax: number; value: number; stops: Set<string> };
type Night = {
  date: string;
  shows: Set<string>;
  cells: Map<string, { bus: number; direct: number }>;
  hotels: Map<string, HotelRow>;
  bookings: number;
  pax: number;
  value: number;
  busPax: number;
};

function fmtDate(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function euro(n: number) {
  return `€${n.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;
}

export default async function WeeklyOutlookPage() {
  const ctx = await requireShowOpsPage("outlook");
  const today = todayIsoUtc();
  const endIso = addDaysIso(today, 14);

  const [{ data: products }, { data: bookings }, { data: busOrders }, { data: stops }] = await Promise.all([
    ctx.supabase
      .from("show_products")
      .select("id,name,island,capacity,run_weekdays,active")
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
      .select("show_date,island,seats_ordered,cost_total")
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
  const busOrderByDateIsland = new Map<string, { seats: number }>();
  for (const o of busOrders ?? []) {
    busOrderByDateIsland.set(`${o.show_date}|${o.island}`, { seats: Number(o.seats_ordered) || 0 });
  }
  // island bus pax across ALL sections of that island (bus orders are per island, not per zone)
  const islandBusPax = new Map<string, number>();

  const sectionFor = (islandName: string, zone: string | null): Section | undefined => {
    const candidates = SECTIONS.filter((s) => s.island === islandName);
    if (candidates.length === 0) return undefined;
    if (candidates.length === 1) return candidates[0];
    // Tenerife: route by zone; unknown zones and direct bookings default to South.
    return candidates.find((s) => zone && s.zones?.includes(zone)) ?? candidates.find((s) => s.id === "tfs");
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
      n = { date, shows: new Set(), cells: new Map(), hotels: new Map(), bookings: 0, pax: 0, value: 0, busPax: 0 };
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
          nightFor(section, date).shows.add(p.name);
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
    const hotel = night.hotels.get(hotelName) ?? { pax: 0, value: 0, stops: new Set<string>() };
    hotel.pax += pax;
    hotel.value += value;
    if (stop?.name) hotel.stops.add(`${stop.name}${b.pickup_time ? ` · ${String(b.pickup_time).slice(0, 5)}` : ""}`);
    else if (b.pickup_stop_name) hotel.stops.add(b.pickup_stop_name);
    night.hotels.set(hotelName, hotel);
  }

  return (
    <div className="space-y-8">
      <ShowOpsPageHeader
        eyebrow="Analytics"
        title="Weekly outlook"
        subtitle="Next 14 nights by airport — resorts, bus vs direct, hotels, rates and buses. Order buses on the show calendar."
        actions={
          <Link href="/dashboard/show-ops/calendar" className="text-sm font-semibold text-[var(--show-ops-primary,#7c3aed)]">
            Open calendar
          </Link>
        }
      />

      <div className="flex flex-wrap gap-2">
        {SECTIONS.map((s) => (
          <ShowOpsPill key={s.id} href={`#${s.id}`} on={false}>
            {s.code}
          </ShowOpsPill>
        ))}
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
                {totals.pax} pax · {totals.bookings} bookings · {euro(totals.value)} in the next 14 nights
              </p>
            </div>

            {!nights.length ? (
              <p className="px-5 py-6 text-sm text-slate-400">No shows or bookings in the next 14 nights.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-slate-500">
                      <th className="px-5 py-2">Night</th>
                      {section.resorts.map((r) => (
                        <th key={r.key} colSpan={2} className="border-l border-slate-100 px-3 py-2 text-center">
                          {r.label}
                        </th>
                      ))}
                      <th className="border-l border-slate-100 px-3 py-2 text-center">{isUk ? "Venue pax" : "Direct / other"}</th>
                      <th className="border-l border-slate-100 px-3 py-2 text-right">Total</th>
                      <th className="px-3 py-2 text-right">Value</th>
                      {!isUk ? <th className="px-3 py-2 text-right">Bus</th> : null}
                    </tr>
                    {section.resorts.length ? (
                      <tr className="text-[10px] uppercase text-slate-400">
                        <th />
                        {section.resorts.map((r) => (
                          <>
                            <th key={`${r.key}-b`} className="border-l border-slate-100 px-3 pb-1 text-center">Bus</th>
                            <th key={`${r.key}-d`} className="px-3 pb-1 text-center">Direct</th>
                          </>
                        ))}
                        <th />
                        <th />
                        <th />
                        <th />
                      </tr>
                    ) : null}
                  </thead>
                  <tbody>
                    {nights.map((n) => {
                      const order = busOrderByDateIsland.get(`${n.date}|${section.island}`);
                      const allIslandBusPax = islandBusPax.get(`${n.date}|${section.island}`) ?? 0;
                      const seatsLeft = order ? order.seats - allIslandBusPax : null;
                      const other = n.cells.get(DIRECT_KEY);
                      const avgRate = n.pax > 0 ? n.value / n.pax : 0;
                      return (
                        <>
                          <tr key={n.date} className="border-t border-slate-100 align-top">
                            <td className="px-5 py-2.5">
                              <Link
                                href={`/dashboard/show-ops/calendar?date=${n.date}&island=${encodeURIComponent(section.island)}`}
                                className="font-medium text-slate-900 hover:underline"
                              >
                                {fmtDate(n.date)}
                              </Link>
                              <p className="max-w-[220px] truncate text-xs text-slate-400">{[...n.shows].join(" · ") || "—"}</p>
                            </td>
                            {section.resorts.map((r) => {
                              const c = n.cells.get(r.key);
                              return (
                                <>
                                  <td key={`${r.key}-b`} className={`border-l border-slate-50 px-3 py-2.5 text-center ${c?.bus ? "font-semibold text-slate-900" : "text-slate-300"}`}>
                                    {c?.bus ?? 0}
                                  </td>
                                  <td key={`${r.key}-d`} className={`px-3 py-2.5 text-center ${c?.direct ? "text-slate-700" : "text-slate-300"}`}>
                                    {c?.direct ?? 0}
                                  </td>
                                </>
                              );
                            })}
                            <td className={`border-l border-slate-50 px-3 py-2.5 text-center ${other && other.bus + other.direct ? "text-slate-700" : "text-slate-300"}`}>
                              {other ? other.bus + other.direct : 0}
                            </td>
                            <td className="border-l border-slate-50 px-3 py-2.5 text-right font-semibold text-slate-900">{n.pax}</td>
                            <td className="px-3 py-2.5 text-right text-slate-700">
                              {n.value ? (
                                <>
                                  {euro(n.value)}
                                  <span className="block text-[11px] text-slate-400">{euro(avgRate)}/pax</span>
                                </>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                            {!isUk ? (
                              <td className="px-3 py-2.5 text-right">
                                {order ? (
                                  <span className={seatsLeft != null && seatsLeft < 0 ? "font-semibold text-rose-600" : "text-slate-700"}>
                                    {allIslandBusPax}/{order.seats}
                                    <span className="block text-[11px] text-slate-400">{seatsLeft} left</span>
                                  </span>
                                ) : n.busPax ? (
                                  <span className="font-semibold text-amber-600">
                                    {n.busPax} pax
                                    <span className="block text-[11px]">no bus yet</span>
                                  </span>
                                ) : (
                                  <span className="text-slate-300">—</span>
                                )}
                              </td>
                            ) : null}
                          </tr>
                          {n.hotels.size ? (
                            <tr key={`${n.date}-hotels`} className="bg-slate-50/40">
                              <td colSpan={section.resorts.length * 2 + (isUk ? 4 : 5)} className="px-5 pb-3 pt-0">
                                <details>
                                  <summary className="cursor-pointer py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700">
                                    {n.hotels.size} {isUk ? "venues / groups" : "hotels"} · {n.bookings} bookings
                                  </summary>
                                  <div className="mt-1 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                                    {[...n.hotels.entries()]
                                      .sort((a, b) => b[1].pax - a[1].pax)
                                      .map(([hotel, h]) => (
                                        <div key={hotel} className="rounded-lg bg-white px-3 py-2 text-xs ring-1 ring-slate-100">
                                          <p className="font-medium text-slate-800">{hotel}</p>
                                          <p className="text-slate-500">
                                            {h.pax} pax · {euro(h.value)}
                                            {h.stops.size ? <span className="block text-slate-400">{[...h.stops].join(" · ")}</span> : null}
                                          </p>
                                        </div>
                                      ))}
                                  </div>
                                </details>
                              </td>
                            </tr>
                          ) : null}
                        </>
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
