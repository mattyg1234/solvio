import Link from "next/link";

import { requireShowOpsPage } from "@/lib/show-ops/access";
import { nightsAheadKeys, productRunsOnDate } from "@/lib/show-ops/calendar";
import { addDaysIso, paxTotal } from "@/lib/show-ops/calc";
import { todayIsoUtc } from "@/lib/show-ops/nights";
import { ShowOpsPageHeader, ShowOpsPill } from "@/components/show-ops/show-ops-page-header";

export default async function WeeklyOutlookPage({
  searchParams,
}: {
  searchParams: Promise<{ island?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await requireShowOpsPage("outlook");
  const island = sp.island || ctx.config.islands[0] || "";
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
      .select("show_date,hotel_name,adults,children,infants,transport_required,show_name,pickup_stop_id,pickup_stop_name,island")
      .eq("business_id", ctx.business.id)
      .eq("island", island)
      .gte("show_date", today)
      .lte("show_date", endIso)
      .is("cancelled_at", null)
      .order("show_date"),
    ctx.supabase
      .from("show_bus_orders")
      .select("show_date,island,seats_ordered,cost_total")
      .eq("business_id", ctx.business.id)
      .eq("island", island)
      .gte("show_date", today)
      .lte("show_date", endIso),
    ctx.supabase
      .from("show_bus_stops")
      .select("id,resort")
      .eq("business_id", ctx.business.id)
      .eq("island", island),
  ]);

  const resortByStop = new Map((stops ?? []).map((s) => [s.id, s.resort]));
  const keys = nightsAheadKeys({
    from: today,
    to: endIso,
    products: (products ?? []).filter((p) => p.island === island),
    bookings: bookings ?? [],
    busOrders: busOrders ?? [],
    island,
  });

  type Night = {
    date: string;
    show: string;
    resorts: Map<string, { direct: number; bus: number }>;
  };
  const nights = new Map<string, Night>();
  for (const key of keys) {
    const date = key.split("|")[0] ?? "";
    const running = (products ?? []).filter((p) => p.island === island);
    const names = running
      .filter((p) => productRunsOnDate(p.run_weekdays as number[] | null, date) || (bookings ?? []).some((b) => b.show_date === date && b.show_name === p.name))
      .map((p) => p.name);
    const label = names.join(" · ") || "Show night";
    nights.set(`${date}|${label}`, { date, show: label, resorts: new Map() });
  }
  for (const b of bookings ?? []) {
    const match = [...nights.values()].find((n) => n.date === b.show_date);
    if (!match) continue;
    const resort =
      (b.pickup_stop_id ? resortByStop.get(b.pickup_stop_id) : null) ||
      (b.pickup_stop_name?.includes("·") ? b.pickup_stop_name.split("·")[0]?.trim() : null) ||
      b.hotel_name ||
      "Direct / unknown";
    const cur = match.resorts.get(resort) || { direct: 0, bus: 0 };
    const pax = paxTotal(b.adults, b.children, b.infants);
    if (b.transport_required) cur.bus += pax;
    else cur.direct += pax;
    match.resorts.set(resort, cur);
  }

  const sorted = [...nights.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 14);
  const busByDate = new Map((busOrders ?? []).map((o) => [o.show_date, o]));

  return (
    <div className="space-y-6">
      <ShowOpsPageHeader
        eyebrow="Analytics"
        title="Weekly outlook"
        subtitle="Nights ahead — show pax, bus ordered, seats left. Set the bus on the show calendar."
        actions={
          <Link href="/dashboard/show-ops/calendar" className="text-sm font-semibold text-[var(--show-ops-primary,#7c3aed)]">
            Open calendar
          </Link>
        }
      />

      <div className="flex flex-wrap gap-2">
        {ctx.config.islands.map((i) => (
          <ShowOpsPill key={i} href={`/dashboard/show-ops/outlook?island=${encodeURIComponent(i)}`} on={i === island}>
            {i}
          </ShowOpsPill>
        ))}
      </div>

      {!sorted.length ? (
        <p className="rounded-2xl bg-white p-6 text-sm text-slate-500 ring-1 ring-slate-200">
          No upcoming show nights for {island}. Set run nights under Shows, or add a bus order on the calendar.
        </p>
      ) : (
        sorted.map((n) => {
          const order = busByDate.get(n.date);
          const busPax = [...n.resorts.values()].reduce((s, r) => s + r.bus, 0);
          const seats = order ? Number(order.seats_ordered) : null;
          const spaces = seats != null ? seats - busPax : null;
          return (
            <div key={`${n.date}-${n.show}`} className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
              <div className="flex flex-wrap justify-between gap-2">
                <h3 className="font-semibold text-slate-900">
                  <Link href={`/dashboard/show-ops/calendar?date=${n.date}&island=${encodeURIComponent(island)}`} className="hover:underline">
                    {n.date} · {n.show}
                  </Link>
                </h3>
                <p className={`text-sm ${spaces != null && spaces < 0 ? "font-semibold text-rose-700" : "text-slate-600"}`}>
                  Bus pax {busPax}
                  {order ? ` · ordered ${order.seats_ordered} · spaces left ${spaces}` : " · no bus ordered yet"}
                </p>
              </div>
              <table className="mt-3 w-full text-left text-sm">
                <thead className="text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-1">Resort</th>
                    <th className="py-1">Pax direct</th>
                    <th className="py-1">Pax bus</th>
                  </tr>
                </thead>
                <tbody>
                  {[...n.resorts.entries()].map(([resort, v]) => (
                    <tr key={resort} className="border-t border-slate-100">
                      <td className="py-1.5">{resort}</td>
                      <td className="py-1.5">{v.direct}</td>
                      <td className="py-1.5">{v.bus}</td>
                    </tr>
                  ))}
                  {!n.resorts.size ? (
                    <tr>
                      <td colSpan={3} className="py-2 text-slate-400">
                        No bookings yet — seats left {spaces ?? "once a bus is ordered"}.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          );
        })
      )}
    </div>
  );
}
