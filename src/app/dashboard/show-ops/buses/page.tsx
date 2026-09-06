import { collectPartnerPages } from "@/lib/show-ops/partner-analytics";
import { loadDirectoryHotels, loadDirectoryStops } from "@/lib/show-ops/directory-data";
import Link from "next/link";

import { upsertBusOrderAction } from "@/app/dashboard/show-ops/actions";
import { BusNightBoard } from "@/components/show-ops/bus-night-board";
import { PickupTimetable } from "@/components/show-ops/pickup-timetable";
import { SubmitOnce } from "@/components/show-ops/submit-once";
import { SHOW_OPS_PRIMARY_BTN, ShowOpsPageHeader, ShowOpsPill } from "@/components/show-ops/show-ops-page-header";
import { NumberInput } from "@/components/ui/number-input";
import { requireShowOpsPage } from "@/lib/show-ops/access";
import { stopRunsOnDate } from "@/lib/show-ops/bus";
import { formatShowOpsMoney, paxTotal, round2, showOpsDayName } from "@/lib/show-ops/calc";
import { showOpsCurrencyFor } from "@/lib/show-ops/config";

export default async function BusBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; island?: string; view?: string; stops?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await requireShowOpsPage("buses");
  const canManageCatalogue = ctx.role === "owner" || ctx.role === "admin";
  const today = new Date().toISOString().slice(0, 10);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? (sp.date as string) : today;
  const island = sp.island || "";
  const tonightOnly = sp.view === "tonight";
  const showUntimed = sp.stops === "all";

  const [{ data: stops }, { data: bookings }, { data: orders }, { data: hotels }] = await Promise.all([
    loadDirectoryStops(ctx.supabase, ctx.business.id, true),
    collectPartnerPages<{island:string;adults:number;children:number;infants:number;transport_required:boolean;pickup_stop_id:string|null;show_name:string}>(async (offset, limit) => {
      const { data, error } = await ctx.supabase.from("show_bookings").select("island,adults,children,infants,transport_required,pickup_stop_id,show_name")
        .eq("business_id", ctx.business.id).eq("show_date", date).eq("transport_required", true).is("cancelled_at", null)
        .order("id").range(offset, offset + limit - 1);
      if (error) throw new Error("Could not load bus bookings. Refresh and try again.");
      return data ?? [];
    }).then(data => ({data})),
    ctx.supabase.from("show_bus_orders").select("island,seats_ordered,bus_count,cost_total,notes,guide_name").eq("business_id", ctx.business.id).eq("show_date", date),
    loadDirectoryHotels(ctx.supabase, ctx.business.id, true),
  ]);

  const money = (n: number) => formatShowOpsMoney(n, showOpsCurrencyFor(ctx.config, island));
  const paxByStop = new Map<string, number>();
  const paxByIsland = new Map<string, number>();
  let unassignedPax = 0;
  for (const b of bookings ?? []) {
    const pax = paxTotal(b.adults, b.children, b.infants);
    paxByIsland.set(b.island, (paxByIsland.get(b.island) ?? 0) + pax);
    if (b.pickup_stop_id) paxByStop.set(b.pickup_stop_id, (paxByStop.get(b.pickup_stop_id) ?? 0) + pax);
    else unassignedPax += pax;
  }
  const hotelsByStop = new Map<string, number>();
  for (const h of hotels ?? []) {
    if (h.bus_stop_id) hotelsByStop.set(h.bus_stop_id, (hotelsByStop.get(h.bus_stop_id) ?? 0) + 1);
  }
  const orderByIsland = new Map((orders ?? []).map((o) => [o.island, o]));

  const islandNames = island
    ? [island]
    : [...new Set([...(stops ?? []).map((s) => s.island), ...paxByIsland.keys()])]
        .filter(Boolean)
        .filter((isl) => {
          if (showUntimed) return true;
          const hasTimed = (stops ?? []).some((s) => s.island === isl && s.pickup_time);
          return hasTimed || paxByIsland.has(isl);
        })
        .sort();

  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    if (date !== today) p.set("date", date);
    if (island) p.set("island", island);
    if (tonightOnly) p.set("view", "tonight");
    if (showUntimed) p.set("stops", "all");
    for (const [k, v] of Object.entries(extra)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    const s = p.toString();
    return s ? `/dashboard/show-ops/buses?${s}` : "/dashboard/show-ops/buses";
  };

  return (
    <div className="space-y-5">
      <ShowOpsPageHeader
        eyebrow="Operations"
        title="Bus board"
        subtitle={`${showOpsDayName(date)} ${date} · buses ordered per night, plus the permanent pick-up timetable per island: drag to reorder, edit a stop in place, download or print. Time changes save straight to every booking on that stop.`}
        actions={
          <form method="get" className="flex flex-wrap items-end gap-2">
            <label className="text-xs font-medium text-slate-600">
              Date
              <input type="date" name="date" defaultValue={date} className="mt-1 block rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm" />
            </label>
            {island ? <input type="hidden" name="island" value={island} /> : null}
            <button type="submit" className={SHOW_OPS_PRIMARY_BTN}>
              Go
            </button>
          </form>
        }
      />

      <div className="flex flex-wrap gap-2 print:hidden">
        <ShowOpsPill href={qs({ island: "" })} on={!island}>
          All islands
        </ShowOpsPill>
        {ctx.config.islands.map((i) => (
          <ShowOpsPill key={i} href={qs({ island: i })} on={island === i}>
            {i}
          </ShowOpsPill>
        ))}
        <span className="mx-1 hidden h-6 w-px bg-slate-200 sm:inline-block" />
        <ShowOpsPill href={qs({ view: "" })} on={!tonightOnly}>
          Full timetable
        </ShowOpsPill>
        <ShowOpsPill href={qs({ view: "tonight" })} on={tonightOnly}>
          Tonight only
        </ShowOpsPill>
      </div>

      {unassignedPax > 0 ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950 print:hidden">
          {unassignedPax} bus pax tonight have no pick-up stop assigned —{" "}
          <Link href={`/dashboard/show-ops/bookings?date=${date}`} className="underline">
            find them in Bookings
          </Link>
          .
        </p>
      ) : null}

      {islandNames.map((isl) => {
        const allForIsland = (stops ?? []).filter((s) => s.island === isl);
        const hasPax = (id: string) => (paxByStop.get(id) ?? 0) > 0;
        const islStops = allForIsland.filter((s) => {
          const running = stopRunsOnDate(s.runs_on, date) || hasPax(s.id);
          if (tonightOnly) return running;
          if (s.pickup_time || hasPax(s.id) || showUntimed) return true;
          return false;
        });
        const hiddenUntimed = allForIsland.filter((s) => !s.pickup_time && !hasPax(s.id)).length;
        const order = orderByIsland.get(isl);
        const busPax = paxByIsland.get(isl) ?? 0;
        const seats = order ? Number(order.seats_ordered) : null;
        const buses = order ? Math.max(1, Number(order.bus_count) || 1) : null;
        const cost = order ? Number(order.cost_total) : null;
        return (
          <section key={isl} className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-semibold text-slate-900">{isl}</h3>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span
                  className={`rounded-full px-2.5 py-1 font-semibold ${
                    seats != null && seats - busPax < 0
                      ? "bg-rose-100 text-rose-900"
                      : seats != null && seats - busPax <= 10
                        ? "bg-amber-100 text-amber-900"
                        : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {busPax} on bus
                  {seats != null
                    ? ` · ${buses} bus${buses === 1 ? "" : "es"} · ${seats} seats ordered · ${seats - busPax} free`
                    : " · no bus ordered"}
                </span>
                {order?.guide_name ? (
                  <span className="rounded-full bg-violet-50 px-2.5 py-1 font-semibold text-violet-900">
                    Guide · {order.guide_name}
                  </span>
                ) : null}
                {cost != null && cost > 0 && busPax > 0 ? (
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">
                    {money(cost)} · {money(round2(cost / busPax))}/head
                  </span>
                ) : null}
              </div>
            </div>

            <form action={upsertBusOrderAction} className="mt-3 flex flex-wrap items-end gap-2 text-xs print:hidden">
              <input type="hidden" name="show_date" value={date} />
              <input type="hidden" name="island" value={isl} />
              <input type="hidden" name="next" value={`/dashboard/show-ops/buses?date=${date}${island ? `&island=${encodeURIComponent(island)}` : ""}`} />
              <label className="font-medium text-slate-600">
                Buses
                <NumberInput
                  min={1}
                  name="bus_count"
                  defaultValue={buses ?? 1}
                  className="mt-1 block w-16 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                />
              </label>
              <label className="font-medium text-slate-600">
                Seats ordered
                <NumberInput
                  min={0}
                  name="seats_ordered"
                  defaultValue={seats ?? ""}
                  className="mt-1 block w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                />
              </label>
              <label className="font-medium text-slate-600">
                Bus cost
                <NumberInput
                  min={0}
                  name="cost_total"
                  defaultValue={cost ?? ""}
                  className="mt-1 block w-28 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                />
              </label>
              <label className="font-medium text-slate-600">
                Guide
                <input
                  name="guide_name"
                  defaultValue={order?.guide_name ?? ""}
                  placeholder="Who's on the coach"
                  className="mt-1 block w-36 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                />
              </label>
              <label className="grow font-medium text-slate-600">
                Notes
                <input name="notes" defaultValue={order?.notes ?? ""} className="mt-1 block w-full min-w-[10rem] rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
              </label>
              <SubmitOnce className="rounded-xl bg-[var(--show-ops-primary,#7c3aed)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                Save bus
              </SubmitOnce>
            </form>

            <PickupTimetable
              key={`${isl}-${islStops.map((s) => s.id).join(",")}`}
              island={isl}
              date={date}
              stops={islStops as never}
              hotelsByStop={Object.fromEntries(islStops.map((s) => [s.id, hotelsByStop.get(s.id) ?? 0]))}
              paxByStop={Object.fromEntries(islStops.map((s) => [s.id, paxByStop.get(s.id) ?? 0]))}
              runningTonight={Object.fromEntries(islStops.map((s) => [s.id, stopRunsOnDate(s.runs_on, date) || hasPax(s.id)]))}
              islands={ctx.config.islands}
              canManage={canManageCatalogue}
              next={qs({})}
            />

            {(["owner", "admin", "finance", "office"].includes(ctx.role)) && (islStops.length ? (
              <BusNightBoard
                key={`${date}-${isl}`}
                date={date}
                island={isl}
                stops={islStops.map((s) => ({ id: s.id, label: `${s.resort} · ${s.stop_name}${s.pickup_time ? ` · ${String(s.pickup_time).slice(0, 5)}` : ""}` }))}
              />
            ) : (
              <p className="mt-3 text-sm text-slate-500 print:hidden">No stops on {isl} yet — use “Add pick-up point” above.</p>
            ))}
            {!tonightOnly && hiddenUntimed > 0 && !showUntimed ? (
              <p className="mt-3 text-sm text-slate-500">
                {hiddenUntimed} more {isl} stops have no pick-up time yet.{" "}
                <Link href={qs({ stops: "all" })} className="font-semibold text-violet-800 underline">
                  Show them
                </Link>
              </p>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
