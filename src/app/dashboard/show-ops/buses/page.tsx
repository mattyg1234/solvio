import Link from "next/link";

import { upsertBusOrderAction, upsertBusStopAction } from "@/app/dashboard/show-ops/actions";
import { BusStopReorder } from "@/components/show-ops/bus-stop-reorder";
import { SubmitOnce } from "@/components/show-ops/submit-once";
import { SHOW_OPS_PRIMARY_BTN, ShowOpsPageHeader, ShowOpsPill } from "@/components/show-ops/show-ops-page-header";
import { NumberInput } from "@/components/ui/number-input";
import { requireShowOpsEnabled } from "@/lib/show-ops/access";
import { stopRunsOnDate } from "@/lib/show-ops/bus";
import { formatShowOpsMoney, paxTotal, round2, showOpsDayName } from "@/lib/show-ops/calc";

export default async function BusBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; island?: string; view?: string; stops?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await requireShowOpsEnabled();
  const today = new Date().toISOString().slice(0, 10);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? (sp.date as string) : today;
  const island = sp.island || "";
  const tonightOnly = sp.view === "tonight";
  const showUntimed = sp.stops === "all";

  const [{ data: stops }, { data: bookings }, { data: orders }, { data: hotels }] = await Promise.all([
    ctx.supabase
      .from("show_bus_stops")
      .select("id,island,resort,stop_name,pickup_time,sort_order,guide_notes,active,runs_on")
      .eq("business_id", ctx.business.id)
      .eq("active", true)
      .order("island")
      .order("sort_order"),
    ctx.supabase
      .from("show_bookings")
      .select("island,adults,children,infants,transport_required,pickup_stop_id,show_name")
      .eq("business_id", ctx.business.id)
      .eq("show_date", date)
      .eq("transport_required", true)
      .is("cancelled_at", null),
    ctx.supabase.from("show_bus_orders").select("island,seats_ordered,cost_total,notes").eq("business_id", ctx.business.id).eq("show_date", date),
    ctx.supabase.from("show_hotels").select("bus_stop_id").eq("business_id", ctx.business.id).eq("active", true),
  ]);

  const money = (n: number) => formatShowOpsMoney(n, ctx.config.currency);
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
        subtitle={`${showOpsDayName(date)} ${date} · printed pick-up times stay on the board even when that route is not running tonight. Times save straight to every booking on that stop.`}
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

      <div className="flex flex-wrap gap-2">
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
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
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
        const cost = order ? Number(order.cost_total) : null;
        const resorts = [...new Set(islStops.map((s) => s.resort))];
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
                  {busPax} on bus{seats != null ? ` · ${seats} ordered · ${seats - busPax} free` : " · no bus ordered"}
                </span>
                {cost != null && cost > 0 && busPax > 0 ? (
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">
                    {money(cost)} · {money(round2(cost / busPax))}/head
                  </span>
                ) : null}
              </div>
            </div>

            <form action={upsertBusOrderAction} className="mt-3 flex flex-wrap items-end gap-2 text-xs">
              <input type="hidden" name="show_date" value={date} />
              <input type="hidden" name="island" value={isl} />
              <input type="hidden" name="next" value={`/dashboard/show-ops/buses?date=${date}${island ? `&island=${encodeURIComponent(island)}` : ""}`} />
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
              <label className="grow font-medium text-slate-600">
                Notes
                <input name="notes" defaultValue={order?.notes ?? ""} className="mt-1 block w-full min-w-[10rem] rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
              </label>
              <SubmitOnce className="rounded-xl bg-[var(--show-ops-primary,#7c3aed)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                Save bus
              </SubmitOnce>
            </form>

            {resorts.map((resort) => {
              const rStops = islStops.filter((s) => s.resort === resort);
              const rPax = rStops.reduce((sum, s) => sum + (paxByStop.get(s.id) ?? 0), 0);
              return (
                <div key={resort} className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {resort} · {rPax} pax tonight
                  </p>
                  <div className="mt-1 overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="text-xs uppercase text-slate-400">
                        <tr>
                          <th className="py-1.5 pr-3">#</th>
                          <th className="py-1.5 pr-3">Stop</th>
                          <th className="py-1.5 pr-3">Time</th>
                          <th className="py-1.5 pr-3">Days</th>
                          <th className="py-1.5 pr-3">Tonight</th>
                          <th className="py-1.5 pr-3">Hotels</th>
                          <th className="py-1.5">Guide notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rStops.map((s) => {
                          const runningTonight = stopRunsOnDate(s.runs_on, date) || hasPax(s.id);
                          return (
                          <tr key={s.id} className={`border-t border-slate-100 ${runningTonight ? "" : "bg-slate-50/70 text-slate-500"}`}>
                            <td className="py-2 pr-3 text-xs text-slate-400">{s.sort_order}</td>
                            <td className="py-2 pr-3 font-medium text-slate-900">{s.stop_name}</td>
                            <td className="py-2 pr-3">
                              <form action={upsertBusStopAction} className="flex items-center gap-1.5">
                                <input type="hidden" name="id" value={s.id} />
                                <input type="hidden" name="island" value={s.island} />
                                <input type="hidden" name="resort" value={s.resort} />
                                <input type="hidden" name="stop_name" value={s.stop_name} />
                                <input type="hidden" name="sort_order" value={s.sort_order} />
                                <input type="hidden" name="guide_notes" value={s.guide_notes ?? ""} />
                                <input type="hidden" name="active" value="1" />
                                <input
                                  type="time"
                                  name="pickup_time"
                                  defaultValue={s.pickup_time ? String(s.pickup_time).slice(0, 5) : ""}
                                  className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
                                />
                                <label
                                  className="flex items-center gap-1 text-[11px] text-slate-500"
                                  title="Email/text upcoming guests on this stop that their pick-up time changed"
                                >
                                  <input type="checkbox" name="notify_guests" value="1" />
                                  Tell guests
                                </label>
                                <SubmitOnce className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 disabled:opacity-60">
                                  Save
                                </SubmitOnce>
                              </form>
                            </td>
                            <td className="py-2 pr-3 text-xs text-slate-500">
                              {s.runs_on || "Every night"}
                              {!runningTonight && s.runs_on ? " · not tonight" : ""}
                            </td>
                            <td className="py-2 pr-3 tabular-nums">{paxByStop.get(s.id) ?? 0}</td>
                            <td className="py-2 pr-3 tabular-nums">{hotelsByStop.get(s.id) ?? 0}</td>
                            <td className="py-2 text-xs text-slate-500">{s.guide_notes ?? "—"}</td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}

            {islStops.length ? (
              <BusStopReorder
                island={isl}
                stops={islStops.map((s) => ({ id: s.id, label: `${s.resort} · ${s.stop_name}${s.pickup_time ? ` · ${String(s.pickup_time).slice(0, 5)}` : ""}` }))}
              />
            ) : (
              <p className="mt-3 text-sm text-slate-500">No stops on {isl} yet — add them under Hotels &amp; pick-ups.</p>
            )}
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
