import Link from "next/link";

import { ScrollIntoView } from "@/components/show-ops/scroll-to-created";
import {
  calendarCellSummary,
  ShowCalendarNight,
  type NightBookingRow,
  type NightCloseRow,
} from "@/components/show-ops/show-calendar-night";
import { ShowOpsPageHeader, ShowOpsPill } from "@/components/show-ops/show-ops-page-header";
import { requireShowOpsPage, roleAtLeast } from "@/lib/show-ops/access";
import { buildCalendarDays, type CloseKind, type CalendarProduct, type CalendarBooking, type CalendarBusOrder } from "@/lib/show-ops/calendar";
import { parseIsoYearMonth, shiftYearMonth, showOpsNightMonth } from "@/lib/show-ops/nights";
import { loadReportRows } from "@/lib/show-ops/report-data";
import { showOpsOutboundLive } from "@/lib/show-ops/outbound";

const WEEK_HEAD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function monthHref(year: number, month: number, island: string, date?: string) {
  const p = new URLSearchParams();
  p.set("month", `${year}-${String(month).padStart(2, "0")}`);
  if (island) p.set("island", island);
  if (date) p.set("date", date);
  return `/dashboard/show-ops/calendar?${p.toString()}`;
}

function chunkWeeks(cells: Array<string | null>) {
  const weeks: Array<Array<string | null>> = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export default async function ShowOpsCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; island?: string; date?: string; closed?: string; emailed?: string; saved?: string; reopened?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await requireShowOpsPage("calendar");
  const today = new Date().toISOString().slice(0, 10);
  const parsed = parseIsoYearMonth(`${sp.month || today.slice(0, 7)}-01`);
  const year = parsed?.year ?? Number(today.slice(0, 4));
  const month = parsed?.month ?? Number(today.slice(5, 7));
  const island = sp.island || "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? (sp.date as string) : "";
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const monthEndDate = new Date(Date.UTC(year, month, 0));
  const monthEnd = monthEndDate.toISOString().slice(0, 10);
  const prev = shiftYearMonth(year, month, -1);
  const next = shiftYearMonth(year, month, 1);
  const canClose = roleAtLeast(ctx.role, "office");

  // Scope every query before paging. Keep the selected night concurrent with
  // the month reads, so opening a day does not add a second loading waterfall.
  const scoped = <Columns extends string>(table: string, columns: Columns) => {
    const query = ctx.supabase.from(table).select(columns).eq("business_id", ctx.business.id);
    return island ? query.eq("island", island) : query;
  };
  const [{ data: products }, { data: bookings }, { data: busOrders }, { data: closes }, { data: nightRows }] = await Promise.all([
    loadReportRows<CalendarProduct>("calendar shows", (offset, limit) =>
      scoped("show_products", "id,name,island,capacity,run_weekdays,active")
        .eq("active", true).order("id").range(offset, offset + limit - 1)),
    loadReportRows<CalendarBooking>("calendar bookings", (offset, limit) =>
      scoped("show_bookings", "show_date,island,product_id,show_name,adults,children,infants,transport_required")
        .gte("show_date", monthStart).lte("show_date", monthEnd).is("cancelled_at", null)
        .order("id").range(offset, offset + limit - 1)),
    loadReportRows<CalendarBusOrder & { bus_count: number | null; cost_total: number | null }>("calendar bus orders", (offset, limit) =>
      scoped("show_bus_orders", "show_date,island,seats_ordered,bus_count,cost_total")
        .gte("show_date", monthStart).lte("show_date", monthEnd)
        .order("id").range(offset, offset + limit - 1)),
    loadReportRows<NightCloseRow>("calendar closures", (offset, limit) =>
      scoped("show_night_closes", "id,show_date,island,product_id,close_kind,note")
        .gte("show_date", monthStart).lte("show_date", monthEnd)
        .order("id").range(offset, offset + limit - 1)),
    date && date >= monthStart && date <= monthEnd
      ? loadReportRows<NightBookingRow>("night bookings", (offset, limit) =>
          scoped("show_bookings", "id,booking_ref,guest_name,show_name,supplier_name,hotel_name,pickup_stop_name,adults,children,infants,transport_required,island")
            .eq("show_date", date).is("cancelled_at", null)
            .order("show_name").order("guest_name").order("id").range(offset, offset + limit - 1))
      : Promise.resolve({ data: [] }),
  ]);
  const nightBookings = nightRows;

  const days = buildCalendarDays({
    year,
    month,
    products: products ?? [],
    bookings: bookings ?? [],
    busOrders: busOrders ?? [],
    closes: (closes ?? []).map((c) => ({
      show_date: c.show_date,
      island: c.island,
      product_id: c.product_id,
      close_kind: c.close_kind as CloseKind,
    })),
    island,
  });
  const byIso = new Map(days.map((d) => [d.iso, d]));
  const cells: Array<string | null> = [];
  const firstWeekday = new Date(`${monthStart}T12:00:00Z`).getUTCDay();
  for (let i = 0; i < firstWeekday; i += 1) cells.push(null);
  for (const d of days) cells.push(d.iso);
  while (cells.length % 7) cells.push(null);
  const weeks = chunkWeeks(cells);

  const selectedDay = date ? byIso.get(date) ?? null : null;
  const nextUrl = selectedDay ? monthHref(year, month, island, selectedDay.iso) : monthHref(year, month, island);
  const closeRows: NightCloseRow[] = (closes ?? []).map((c) => ({
    id: c.id,
    show_date: c.show_date,
    island: c.island,
    product_id: c.product_id,
    close_kind: c.close_kind as CloseKind,
  }));

  return (
    <div className="space-y-5">
      <ShowOpsPageHeader
        eyebrow="Overview"
        title="Show calendar"
        subtitle="Click a day to fold out every show, bus seats, and the bookings on that night."
        actions={
          <div className="flex items-center gap-2">
            <Link href="/dashboard/show-ops/outlook" className="mr-2 text-sm font-semibold text-[var(--show-ops-primary,#7c3aed)]">
              Outlook →
            </Link>
            <Link href={monthHref(prev.year, prev.month, island, date)} className="rounded-xl bg-white px-3 py-2 text-sm shadow-sm ring-1 ring-slate-200">
              ←
            </Link>
            <p className="min-w-[9rem] text-center text-sm font-semibold text-slate-900">{showOpsNightMonth(monthStart)}</p>
            <Link href={monthHref(next.year, next.month, island, date)} className="rounded-xl bg-white px-3 py-2 text-sm shadow-sm ring-1 ring-slate-200">
              →
            </Link>
          </div>
        }
      />

      {sp.closed ? (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950 ring-1 ring-amber-200">
          {sp.emailed && sp.emailed !== "0"
            ? `Close saved · emailed ${sp.emailed} partner${sp.emailed === "1" ? "" : "s"}.`
            : "Close saved. Partner email was not sent (test mode)."}
        </p>
      ) : null}
      {sp.reopened ? (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 ring-1 ring-emerald-200">Sale reopened for that night.</p>
      ) : null}
      {sp.saved ? (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 ring-1 ring-emerald-200">Bus order saved.</p>
      ) : null}
      {sp.error ? <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-900 ring-1 ring-rose-200">{sp.error}</p> : null}

      <div className="flex flex-wrap gap-2">
        <ShowOpsPill href={monthHref(year, month, "", date)} on={!island}>
          All islands
        </ShowOpsPill>
        {ctx.config.islands.map((i) => (
          <ShowOpsPill key={i} href={monthHref(year, month, i, date)} on={island === i}>
            {i}
          </ShowOpsPill>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
        <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          {WEEK_HEAD.map((d) => (
            <div key={d} className="px-1 py-2">
              {d}
            </div>
          ))}
        </div>
        {weeks.map((week, wi) => {
          const openHere = Boolean(selectedDay && week.includes(selectedDay.iso));
          return (
            <div key={wi}>
              <div className="grid grid-cols-7">
                {week.map((iso, idx) => {
                  if (!iso) return <div key={`e-${wi}-${idx}`} className="min-h-[5.5rem] border-t border-slate-100 bg-slate-50/40" />;
                  const day = byIso.get(iso);
                  const on = date === iso;
                  const n = Number(iso.slice(8, 10));
                  const summary = day ? calendarCellSummary(day) : null;
                  return (
                    <Link
                      key={iso}
                      href={on ? monthHref(year, month, island) : `${monthHref(year, month, island, iso)}#night-fold`}
                      className={`min-h-[5.5rem] border-t border-l border-slate-100 p-1.5 text-left text-xs ${
                        on ? "bg-violet-50 ring-1 ring-inset ring-violet-300" : "hover:bg-slate-50"
                      } ${iso === today ? "font-semibold" : ""}`}
                    >
                      <span className={`block text-[11px] ${iso === today ? "text-violet-700" : "text-slate-500"}`}>{n}</span>
                      {day?.hasShow && summary ? (
                        <>
                          <span className="mt-1 block truncate text-[11px] text-slate-800">{summary.title}</span>
                          <span className="block tabular-nums text-[11px] text-slate-500">
                            {summary.pax} pax
                            {summary.capacity != null ? ` / ${summary.capacity}` : summary.showCount > 1 ? ` · ${summary.showCount} shows` : ""}
                          </span>
                          <span
                            className={`block tabular-nums text-[11px] ${
                              summary.busLeft != null && summary.busLeft < 0 ? "text-rose-700" : "text-slate-500"
                            }`}
                          >
                            {summary.busLeft == null ? "bus ?" : `${summary.busLeft} bus left`}
                          </span>
                          {summary.closed ? (
                            <span
                              className={`mt-0.5 inline-block rounded px-1 text-[10px] font-semibold ${
                                summary.closed === "full" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-900"
                              }`}
                            >
                              {summary.closed === "full" ? "Closed" : "Part"}
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <span className="mt-2 block text-[11px] text-slate-300">—</span>
                      )}
                    </Link>
                  );
                })}
              </div>
              {openHere && selectedDay ? (
                <>
                  <ScrollIntoView id="night-fold" />
                  <ShowCalendarNight
                    day={selectedDay}
                    nextUrl={nextUrl}
                    island={island}
                    canClose={canClose}
                    emailsLive={showOpsOutboundLive()}
                    currency={ctx.config.currency}
                    bookings={nightBookings}
                    closes={closeRows}
                    busOrders={busOrders ?? []}
                  />
                </>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
