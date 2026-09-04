import Link from "next/link";
import { CalendarDays, Download, Sparkles, TrendingUp, Trophy, Users } from "lucide-react";

import { SHOW_OPS_GHOST_BTN, ShowOpsPageHeader, ShowOpsPill } from "@/components/show-ops/show-ops-page-header";
import { requireShowOpsPage } from "@/lib/show-ops/access";
import { applyNoShowBilling, formatShowOpsMoney, paxTotal, round2, showOpsDayName } from "@/lib/show-ops/calc";
import { hasShowOpsModule, showOpsCurrencyFor } from "@/lib/show-ops/config";
import {
  dailySalesCsvHref,
  localDayUtcRange,
  SHOW_OPS_OFFICE_TZ,
  summariseDailySales,
  type DailySalesRow,
} from "@/lib/show-ops/daily-sales";
import { isoDateInTimeZone } from "@/lib/show-ops/digest";
import { REPORT_PERIOD_OPTIONS, reportPeriodHref, resolveReportRange } from "@/lib/show-ops/report-range";

const PRIMARY = "var(--show-ops-primary,#7c3aed)";
const PAGE = "/dashboard/show-ops/reports";
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09" → "September 2026" */
function monthLabel(ym: string): string {
  const d = new Date(`${ym}-01T12:00:00Z`);
  return Number.isNaN(d.getTime())
    ? ym
    : d.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

type SalesAnalytics = {
  monthly?: Array<{ m: string; gross: number; net: number; pax: number }>;
  partners?: Array<{ name: string; revenue: number; pax: number }>;
  avg_ticket?: number | null;
  no_show_rate?: number | null;
  occupancy?: number | null;
} | null;

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    period?: string;
    month?: string;
    from?: string;
    to?: string;
    island?: string;
    partner_type?: string;
    /** Year block (was the Stats page): YYYY-MM, and island or "all". Island falls back to the page filter. */
    stats_month?: string;
    stats_island?: string;
    /** Daily sales block: YYYY-MM-DD, office-local. Defaults to today. */
    sales_date?: string;
  }>;
}) {
  const sp = await searchParams;
  const ctx = await requireShowOpsPage("reports");
  if (!hasShowOpsModule(ctx.config, ctx.tier, "commercial")) {
    return <p className="text-sm text-slate-600">Reports are not enabled for this workspace.</p>;
  }

  const range = resolveReportRange({
    period: sp.period,
    month: sp.month,
    from: sp.from,
    to: sp.to,
  });
  const start = range.start;
  const end = range.end;
  const island = sp.island || "";
  const partnerType = sp.partner_type || "";

  // Office-local today — the same clock the door and the 07:00 digest run on.
  const todayLocal = isoDateInTimeZone(new Date(), SHOW_OPS_OFFICE_TZ);
  const salesDate = /^\d{4}-\d{2}-\d{2}$/.test(sp.sales_date || "") ? sp.sales_date! : todayLocal;
  const salesWindow = localDayUtcRange(salesDate, SHOW_OPS_OFFICE_TZ);
  const statsMonth = /^\d{4}-\d{2}$/.test(sp.stats_month || "") ? sp.stats_month! : todayLocal.slice(0, 7);
  const statsIsland = sp.stats_island === undefined ? island : sp.stats_island === "all" ? "" : sp.stats_island;

  /** Every current query param, with overrides — so the sub-blocks keep the page's filters when they change theirs. */
  const currentParams = (over: Record<string, string | undefined> = {}): Array<[string, string]> => {
    const all: Record<string, string | undefined> = {
      period: sp.period,
      month: sp.month,
      from: sp.from,
      to: sp.to,
      island: sp.island,
      partner_type: sp.partner_type,
      stats_month: sp.stats_month,
      stats_island: sp.stats_island,
      sales_date: sp.sales_date,
      ...over,
    };
    return Object.entries(all).filter((e): e is [string, string] => Boolean(e[1]));
  };
  const hrefWith = (over: Record<string, string | undefined>, hash = "") => {
    const p = new URLSearchParams(currentParams(over));
    const q = p.toString();
    return `${q ? `${PAGE}?${q}` : PAGE}${hash}`;
  };

  function applyShowDate<T extends { gte: (c: string, v: string) => T; lte: (c: string, v: string) => T }>(
    q: T,
    column: string,
  ): T {
    let next = q;
    if (start) next = next.gte(column, start);
    if (end) next = next.lte(column, end);
    return next;
  }

  const [
    { data: bookings },
    { data: busOrders },
    { data: products },
    { data: suppliers },
    { data: invoices },
    { data: payments },
    { data: salesRows },
    { data: analyticsRaw },
  ] = await Promise.all([
    (() => {
      let q = ctx.supabase
        .from("show_bookings")
        .select("*")
        .eq("business_id", ctx.business.id)
        .is("cancelled_at", null)
        .range(0, 9999);
      q = applyShowDate(q, "show_date");
      if (island) q = q.eq("island", island);
      return q;
    })(),
    (() => {
      let q = ctx.supabase.from("show_bus_orders").select("*").eq("business_id", ctx.business.id).range(0, 9999);
      q = applyShowDate(q, "show_date");
      return q;
    })(),
    ctx.supabase
      .from("show_products")
      .select("id,name,capacity,island")
      .eq("business_id", ctx.business.id),
    ctx.supabase.from("show_suppliers").select("id,name,partner_type").eq("business_id", ctx.business.id),
    (() => {
      let q = ctx.supabase
        .from("show_invoices")
        .select("invoice_date,total_amount,paid,paid_at,voided")
        .eq("business_id", ctx.business.id)
        .eq("voided", false)
        .range(0, 9999);
      q = applyShowDate(q, "invoice_date");
      return q;
    })(),
    (() => {
      let q = ctx.supabase
        .from("show_booking_payments")
        .select("amount,method,paid_at")
        .eq("business_id", ctx.business.id)
        .range(0, 9999);
      if (start) q = q.gte("paid_at", `${start}T00:00:00Z`);
      if (end) q = q.lte("paid_at", `${end}T23:59:59Z`);
      return q;
    })(),
    // Daily sales: bookings taken on that office-local day (same reading as the digest's "taken yesterday").
    (() => {
      let q = ctx.supabase
        .from("show_bookings")
        .select(
          "booking_ref,guest_name,show_name,island,show_date,hotel_name,supplier_name,sales_channel,adults,children,infants,total_cost,billing_mode,created_at",
        )
        .eq("business_id", ctx.business.id)
        .gte("created_at", salesWindow.start)
        .lt("created_at", salesWindow.end)
        .is("cancelled_at", null)
        .order("created_at")
        .range(0, 9999);
      if (island) q = q.eq("island", island);
      return q;
    })(),
    // Year block — the old Stats & insights RPC.
    ctx.supabase.rpc("show_ops_sales_analytics", {
      p_business: ctx.business.id,
      p_year: Number(statsMonth.slice(0, 4)) || new Date().getUTCFullYear(),
      p_island: statsIsland || null,
      p_month: statsMonth,
    }),
  ]);

  const dailySales = summariseDailySales(salesDate, (salesRows ?? []) as DailySalesRow[], SHOW_OPS_OFFICE_TZ);

  const analytics = (analyticsRaw ?? null) as SalesAnalytics;
  const monthlyByM = new Map((analytics?.monthly ?? []).map((x) => [x.m, x]));
  const analyticsMonths = MONTH_LABELS.map((label, i) => {
    const m = String(i + 1).padStart(2, "0");
    const row = monthlyByM.get(m);
    return { m, label, gross: Number(row?.gross ?? 0), net: Number(row?.net ?? 0), pax: Number(row?.pax ?? 0) };
  });
  const maxMonthGross = Math.max(...analyticsMonths.map((x) => x.gross), 0);
  const analyticsPartners = (analytics?.partners ?? []).map((p) => ({
    name: p.name,
    revenue: Number(p.revenue || 0),
    pax: Number(p.pax || 0),
  }));
  const maxPartnerRevenue = Math.max(...analyticsPartners.map((p) => p.revenue), 0);
  const statsMoney = (n: number) => formatShowOpsMoney(n, showOpsCurrencyFor(ctx.config, statsIsland));

  const supplierType = new Map((suppliers ?? []).map((s) => [s.id, s.partner_type]));
  const productCap = new Map((products ?? []).map((p) => [p.id, Number(p.capacity) || 0]));

  const filtered = (bookings ?? []).filter((b) => {
    if (!partnerType) return true;
    const t = b.supplier_id ? supplierType.get(b.supplier_id) : "direct";
    return (t || "direct") === partnerType || (!b.supplier_id && partnerType === "direct");
  });

  const totalBookings = filtered.length;
  const totalPax = filtered.reduce((s, b) => s + paxTotal(b.adults, b.children, b.infants), 0);
  const totalRevenue = round2(filtered.reduce((s, b) => s + Number(b.total_cost), 0));
  const tourOp = filtered.filter((b) => b.sales_channel === "tour_op").length;
  const direct = filtered.filter((b) => b.sales_channel === "direct").length;

  // Capacity: sum of (show capacity × nights with that show) approx via product capacity vs pax per show-night
  let capacitySlots = 0;
  let capacityPax = 0;
  const nightShow = new Map<string, { cap: number; pax: number }>();
  for (const b of filtered) {
    const key = `${b.show_date}|${b.product_id || b.show_name}`;
    const cur = nightShow.get(key) || {
      cap: b.product_id ? productCap.get(b.product_id) || 0 : 0,
      pax: 0,
    };
    cur.pax += paxTotal(b.adults, b.children, b.infants);
    nightShow.set(key, cur);
  }
  for (const v of nightShow.values()) {
    if (v.cap > 0) {
      capacitySlots += v.cap;
      capacityPax += v.pax;
    }
  }
  const capacityPct = capacitySlots ? round2((capacityPax / capacitySlots) * 100) : null;

  const byPartner = new Map<string, { pax: number; revenue: number; count: number; type: string }>();
  const byHotel = new Map<string, { pax: number; count: number }>();
  const byShow = new Map<string, { pax: number; count: number }>();
  const byPartnerType = new Map<string, { pax: number; revenue: number; count: number }>();
  const byNight = new Map<string, number>();

  for (const b of filtered) {
    const partner = b.supplier_name || "Direct";
    const type = (b.supplier_id ? supplierType.get(b.supplier_id) : "direct") || "direct";
    const p = byPartner.get(partner) || { pax: 0, revenue: 0, count: 0, type };
    p.pax += paxTotal(b.adults, b.children, b.infants);
    p.revenue += Number(b.total_cost);
    p.count += 1;
    byPartner.set(partner, p);

    const pt = byPartnerType.get(type) || { pax: 0, revenue: 0, count: 0 };
    pt.pax += paxTotal(b.adults, b.children, b.infants);
    pt.revenue += Number(b.total_cost);
    pt.count += 1;
    byPartnerType.set(type, pt);

    const hotel = b.hotel_name || "—";
    const h = byHotel.get(hotel) || { pax: 0, count: 0 };
    h.pax += paxTotal(b.adults, b.children, b.infants);
    h.count += 1;
    byHotel.set(hotel, h);

    const show = b.show_name;
    const g = byShow.get(show) || { pax: 0, count: 0 };
    g.pax += paxTotal(b.adults, b.children, b.infants);
    g.count += 1;
    byShow.set(show, g);

    byNight.set(b.show_date, (byNight.get(b.show_date) || 0) + paxTotal(b.adults, b.children, b.infants));
  }

  const topPartners = [...byPartner.entries()].sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 5);
  const topHotels = [...byHotel.entries()].sort((a, b) => b[1].pax - a[1].pax).slice(0, 5);
  const lowPartners = [...byPartner.entries()].sort((a, b) => a[1].count - b[1].count).slice(0, 5);
  const hotelsRanked = [...byHotel.entries()].sort((a, b) => b[1].pax - a[1].pax);

  const invoiceTotal = round2((invoices ?? []).reduce((s, i) => s + Number(i.total_amount || 0), 0));
  const invoicePaid = round2((invoices ?? []).filter((i) => i.paid).reduce((s, i) => s + Number(i.total_amount || 0), 0));
  const invoicePending = round2(invoiceTotal - invoicePaid);
  // Cash is not tracked here any more (Joel: the tile was noise); card / Stripe stays as its own small tile.
  const cardPaid = round2(
    (payments ?? []).filter((p) => p.method === "card" || p.method === "stripe").reduce((s, p) => s + Number(p.amount || 0), 0),
  );
  const noShows = filtered.filter((b) => Boolean((b as { no_show?: boolean }).no_show)).length;
  const grossRevenue = totalRevenue;
  const netRevenue = round2(
    filtered.reduce((s, b) => {
      const arrivalBooked = paxTotal(b.adults, b.children, b.infants);
      const billed = applyNoShowBilling({
        booked: arrivalBooked,
        arrived: (b as { arrived_pax?: number | null }).arrived_pax ?? ((b as { no_show?: boolean }).no_show ? 0 : null),
        totalCost: Number(b.total_cost),
        nettTotal: Number(b.nett_total ?? b.total_cost),
        adultNettTotal: Number((b as { adult_nett_total?: number }).adult_nett_total ?? 0),
        childNettTotal: Number((b as { child_nett_total?: number }).child_nett_total ?? 0),
        charge: (b as { no_show_charge?: "charge" | "write_off" | null }).no_show_charge,
      });
      return s + billed.billedTotalCost;
    }, 0),
  );
  const money = (n: number) => formatShowOpsMoney(n, showOpsCurrencyFor(ctx.config, island));

  const prevPax = range.prevStart && range.prevEnd
    ? await (async () => {
        let q = ctx.supabase
          .from("show_bookings")
          .select("adults,children,infants")
          .eq("business_id", ctx.business.id)
          .gte("show_date", range.prevStart!)
          .lte("show_date", range.prevEnd!)
          .is("cancelled_at", null)
          .range(0, 9999);
        if (island) q = q.eq("island", island);
        const { data } = await q;
        return (data ?? []).reduce((sum, b) => sum + paxTotal(b.adults, b.children, b.infants), 0);
      })()
    : null;

  // Same window, shifted back a year — the "vs LY" column Joel tracks.
  const lastYearPax =
    start && end
      ? await (async () => {
          const shift = (iso: string) => `${Number(iso.slice(0, 4)) - 1}${iso.slice(4)}`;
          let q = ctx.supabase
            .from("show_bookings")
            .select("adults,children,infants")
            .eq("business_id", ctx.business.id)
            .gte("show_date", shift(start))
            .lte("show_date", shift(end))
            .is("cancelled_at", null)
            .range(0, 9999);
          if (island) q = q.eq("island", island);
          const { data } = await q;
          return (data ?? []).reduce((sum, b) => sum + paxTotal(b.adults, b.children, b.infants), 0);
        })()
      : null;

  const busCostRows = (busOrders ?? [])
    .filter((o) => !island || o.island === island)
    .map((o) => {
      const nightPax = filtered
        .filter((b) => b.show_date === o.show_date && b.island === o.island && b.transport_required)
        .reduce((s, b) => s + paxTotal(b.adults, b.children, b.infants), 0);
      const cph = nightPax > 0 ? round2(Number(o.cost_total) / nightPax) : null;
      return { ...o, nightPax, cph };
    });

  const tourPct = totalBookings ? round2((tourOp / totalBookings) * 100) : 0;
  const directPct = totalBookings ? round2((direct / totalBookings) * 100) : 0;
  const partnerTypes = [...new Set([...(suppliers ?? []).map((s) => s.partner_type), "direct"])].sort();

  const nightEntries = [...byNight.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const trackerRows =
    nightEntries.length > 45
      ? [...nightEntries.reduce((m, [d, pax]) => {
          const key = d.slice(0, 7);
          m.set(key, (m.get(key) || 0) + pax);
          return m;
        }, new Map<string, number>())]
      : nightEntries;
  const trackerMax = Math.max(1, ...trackerRows.map(([, pax]) => pax));
  const isDaily = nightEntries.length <= 45;

  const daysWithActivity = nightEntries.length;
  const avgPerDay = daysWithActivity ? round2(totalPax / daysWithActivity) : 0;
  const sortedByPax = [...nightEntries].sort((a, b) => b[1] - a[1]);
  const bestDay = sortedByPax[0] ?? null;
  const lowestDay = sortedByPax.length > 1 ? sortedByPax[sortedByPax.length - 1] : null;
  const last7 = nightEntries.slice(-7);
  const last7Avg = last7.length ? round2(last7.reduce((s, [, pax]) => s + pax, 0) / last7.length) : 0;
  const changePct = prevPax ? round2(((totalPax - prevPax) / prevPax) * 100) : null;
  const exportHref = (() => {
    const p = new URLSearchParams();
    if (start) p.set("from", start);
    if (end) p.set("to", end);
    if (island) p.set("island", island);
    return `/api/show-ops/bookings.csv?${p.toString()}`;
  })();

  return (
    <div className="space-y-6">
      <div className="space-y-3">
          <ShowOpsPageHeader
            eyebrow="Analytics"
            title="Reports"
            subtitle={`${range.label}${island ? ` · ${island}` : ""}${partnerType ? ` · ${partnerType}` : ""}`}
            actions={
              <a href={exportHref} className={SHOW_OPS_GHOST_BTN}>
                <Download className="mr-2 h-4 w-4" aria-hidden />
                Export
              </a>
            }
          />
        <div className="flex flex-wrap gap-2">
          {REPORT_PERIOD_OPTIONS.map((opt) => {
            const on = range.period === opt.id;
            return (
              <ShowOpsPill
                key={opt.id}
                href={reportPeriodHref(PAGE, { period: opt.id, island, partner_type: partnerType })}
                on={on}
              >
                {opt.label}
              </ShowOpsPill>
            );
          })}
          {range.period === "custom" || range.period === "month" ? (
            <span
              className="rounded-full px-3 py-1.5 text-sm font-semibold text-white shadow-sm"
              style={{ backgroundColor: PRIMARY }}
            >
              {range.period === "custom" ? "Custom" : range.label}
            </span>
          ) : null}
        </div>
        <form method="get" className="flex flex-wrap items-end gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/80">
          <input type="hidden" name="period" value="custom" />
          <label className="text-xs font-medium text-slate-600">
            From
            <input
              type="date"
              name="from"
              defaultValue={range.period === "custom" ? range.start ?? "" : start ?? ""}
              className="mt-1 block rounded-lg border px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs font-medium text-slate-600">
            To
            <input
              type="date"
              name="to"
              defaultValue={range.period === "custom" ? range.end ?? "" : end ?? ""}
              className="mt-1 block rounded-lg border px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Island
            <select name="island" defaultValue={island} className="mt-1 block rounded-lg border px-2 py-1.5 text-sm">
              <option value="">All</option>
              {ctx.config.islands.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Partner type
            <select
              name="partner_type"
              defaultValue={partnerType}
              className="mt-1 block rounded-lg border px-2 py-1.5 text-sm"
            >
              <option value="">All types</option>
              {partnerTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="rounded-xl bg-[var(--show-ops-primary,#7c3aed)] px-4 py-2 text-sm font-semibold text-white">
            Apply range
          </button>
        </form>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          label={range.label}
          value={totalPax.toLocaleString("en-GB")}
          sub="Total pax"
          icon={<Users className="h-4 w-4" />}
          tint="#f5f3ff"
          highlight
        />
        <StatCard
          label={range.prevLabel ? "vs previous" : "vs previous"}
          value={changePct != null ? `${changePct > 0 ? "+" : ""}${changePct}%` : "—"}
          sub={prevPax != null ? `${prevPax.toLocaleString("en-GB")} (${range.prevLabel ?? "previous"})` : "No previous window"}
          icon={<TrendingUp className="h-4 w-4" />}
          tint="#eef2ff"
          tone={changePct == null ? "flat" : changePct >= 0 ? "up" : "down"}
        />
        <StatCard
          label={isDaily ? "Last 7 nights (avg)" : "Average per night"}
          value={String(isDaily ? last7Avg : avgPerDay)}
          sub="Avg pax / night"
          icon={<CalendarDays className="h-4 w-4" />}
          tint="#eff6ff"
        />
        <StatCard
          label="Best night"
          value={bestDay ? String(bestDay[1]) : "—"}
          sub={bestDay ? bestDay[0] : "No pax yet"}
          icon={<Trophy className="h-4 w-4" />}
          tint="#ecfdf5"
        />
        <StatCard
          label="Same window last year"
          value={lastYearPax != null ? lastYearPax.toLocaleString("en-GB") : "—"}
          sub="Total pax"
          icon={<Sparkles className="h-4 w-4" />}
          tint="#fffbeb"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Bookings", String(totalBookings)],
          ["Revenue (gross)", money(grossRevenue)],
          ["Tour op / Direct", `${tourPct}% / ${directPct}%`],
          ["Capacity used", capacityPct != null ? `${capacityPct}%` : "Set capacity on shows"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <p className="text-xs uppercase text-slate-500">{k}</p>
            <p className="mt-1 text-xl font-semibold">{v}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Invoices in this period", money(invoiceTotal)],
          ["Net after write-offs", money(netRevenue)],
          ["Invoice pending", money(invoicePending)],
          ["Invoice paid", money(invoicePaid)],
          ["No-shows", String(noShows)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <p className="text-xs uppercase text-slate-500">{k}</p>
            <p className="mt-1 text-xl font-semibold">{v}</p>
          </div>
        ))}
        <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-200">
          <p className="text-[11px] uppercase text-slate-500">Card taken</p>
          <p className="mt-1 text-base font-semibold">{money(cardPaid)}</p>
          <p className="text-[11px] text-slate-400">Card / Stripe payments in this period</p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(17rem,1fr)]">
        <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <h3 className="font-semibold text-slate-900">{isDaily ? "Daily pax breakdown" : "Monthly pax breakdown"}</h3>
          <div className="mt-4 space-y-1.5">
            {trackerRows.map(([d, pax]) => {
              const best = bestDay?.[0] === d;
              return (
                <div key={d} className="flex items-center gap-3 text-xs">
                  {isDaily ? (
                    <>
                      <span className="w-8 shrink-0 font-semibold text-slate-500">{showOpsDayName(d, "short")}</span>
                      <span className="w-14 shrink-0 text-right text-slate-500">{shortDate(d)}</span>
                    </>
                  ) : (
                    <span className="w-24 shrink-0 text-slate-500">{d}</span>
                  )}
                  <div className="h-2.5 flex-1 rounded-full bg-slate-100">
                    <div
                      className="h-2.5 rounded-full"
                      style={{
                        width: `${Math.max(3, (pax / trackerMax) * 100)}%`,
                        background: best
                          ? PRIMARY
                          : "linear-gradient(90deg, rgba(45,212,191,0.75) 0%, rgba(13,148,136,1) 100%)",
                      }}
                    />
                  </div>
                  <span className={`w-10 text-right font-semibold ${best ? "" : "text-slate-700"}`} style={best ? { color: PRIMARY } : undefined}>
                    {pax}
                  </span>
                </div>
              );
            })}
            {!trackerRows.length ? <p className="text-sm text-slate-500">No pax in this period</p> : null}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
            <h3 className="font-semibold text-slate-900">Summary</h3>
            <dl className="mt-3 space-y-2.5 text-sm">
              <SummaryRow label="Total pax" value={totalPax.toLocaleString("en-GB")} />
              <SummaryRow label="Nights with activity" value={String(daysWithActivity)} />
              <SummaryRow label="Average per night" value={String(avgPerDay)} />
              <SummaryRow label="Highest" value={bestDay ? String(bestDay[1]) : "—"} note={bestDay?.[0]} />
              <SummaryRow label="Lowest" value={lowestDay ? String(lowestDay[1]) : "—"} note={lowestDay?.[0]} />
            </dl>
          </div>

          <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
            <h3 className="font-semibold text-slate-900">Compare periods</h3>
            <dl className="mt-3 space-y-2.5 text-sm">
              <SummaryRow label={range.label} value={totalPax.toLocaleString("en-GB")} strong />
              <SummaryRow
                label={range.prevLabel ? `Previous (${range.prevLabel})` : "Previous"}
                value={prevPax != null ? prevPax.toLocaleString("en-GB") : "—"}
              />
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-slate-600">Change</dt>
                <dd
                  className={`font-semibold tabular-nums ${
                    changePct == null ? "text-slate-400" : changePct >= 0 ? "text-emerald-600" : "text-rose-600"
                  }`}
                >
                  {changePct != null ? `${changePct > 0 ? "+" : ""}${changePct}% ${changePct >= 0 ? "↑" : "↓"}` : "—"}
                </dd>
              </div>
              <SummaryRow label="Same window last year" value={lastYearPax != null ? lastYearPax.toLocaleString("en-GB") : "—"} />
            </dl>
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-slate-900">By partner type</h3>
          <Link href="#partners-table" className="text-sm font-semibold" style={{ color: PRIMARY }}>
            View all partners →
          </Link>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              <tr>
                <th className="py-2 pr-3">Partner type</th>
                <th className="py-2 pr-3">Bookings</th>
                <th className="py-2 pr-3">Pax</th>
                <th className="py-2 pr-3">Revenue</th>
                <th className="py-2 w-[38%]" />
              </tr>
            </thead>
            <tbody>
              {[...byPartnerType.entries()]
                .sort((a, b) => b[1].revenue - a[1].revenue)
                .map(([type, v]) => {
                  const share = totalRevenue ? Math.round((v.revenue / totalRevenue) * 100) : 0;
                  return (
                    <tr key={type} className="border-t border-slate-100">
                      <td className="py-2.5 pr-3 font-medium text-slate-900">{type.replace(/_/g, " ")}</td>
                      <td className="py-2.5 pr-3 tabular-nums">{v.count}</td>
                      <td className="py-2.5 pr-3 tabular-nums">{v.pax}</td>
                      <td className="py-2.5 pr-3 tabular-nums">{money(round2(v.revenue))}</td>
                      <td className="py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 rounded-full bg-slate-100">
                            <div
                              className="h-2 rounded-full"
                              style={{ width: `${Math.max(2, share)}%`, backgroundColor: PRIMARY }}
                            />
                          </div>
                          <span className="w-10 text-right text-xs font-semibold text-slate-500">{share}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              {!byPartnerType.size ? (
                <tr>
                  <td colSpan={5} className="py-4 text-slate-500">
                    No bookings in this period.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <RankCard
          title="Top 5 sales partners"
          rows={topPartners.map(([n, v]) => `${n} (${v.type}) · ${money(round2(v.revenue))} · ${v.pax.toLocaleString("en-GB")} pax`)}
        />
        <RankCard title="Top 5 hotels" rows={topHotels.map(([n, v]) => `${n} · ${v.pax} pax`)} />
        <RankCard title="Lowest partners (by bookings)" rows={lowPartners.map(([n, v]) => `${n} · ${v.count} bookings`)} />
      </div>

      <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <h3 className="font-semibold">Hotels (everyone)</h3>
        <p className="mt-1 text-sm text-slate-600">Sorted by people booked in this period.</p>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="py-1">Hotel</th>
                <th>Bookings</th>
                <th>Pax</th>
              </tr>
            </thead>
            <tbody>
              {hotelsRanked.map(([name, v]) => (
                <tr key={name} className="border-t">
                  <td className="py-1.5">{name}</td>
                  <td>{v.count}</td>
                  <td>{v.pax}</td>
                </tr>
              ))}
              {!hotelsRanked.length ? (
                <tr>
                  <td colSpan={3} className="py-4 text-slate-500">
                    No hotel names on bookings in this period.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div id="partners-table" className="scroll-mt-24 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <h3 className="font-semibold">Sales by show / partner</h3>
        <ul className="mt-2 divide-y text-sm">
          {[...byShow.entries()]
            .sort((a, b) => b[1].pax - a[1].pax)
            .map(([name, v]) => (
              <li key={name} className="flex justify-between py-1.5">
                <span>{name}</span>
                <span>
                  {v.count} bookings · {v.pax} pax
                </span>
              </li>
            ))}
        </ul>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="py-1">Partner</th>
                <th>Type</th>
                <th>Bookings</th>
                <th>Pax</th>
                <th>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {[...byPartner.entries()]
                .sort((a, b) => b[1].revenue - a[1].revenue)
                .map(([name, v]) => (
                  <tr key={name} className="border-t">
                    <td className="py-1.5">{name}</td>
                    <td>{v.type}</td>
                    <td>{v.count}</td>
                    <td>{v.pax.toLocaleString("en-GB")}</td>
                    <td>{money(round2(v.revenue))}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <h3 className="font-semibold">Bus cost per head</h3>
        <table className="mt-3 w-full text-left text-sm">
          <thead className="text-xs uppercase text-slate-500">
            <tr>
              <th className="py-1">Date</th>
              <th>Island</th>
              <th>Seats ordered</th>
              <th>Cost</th>
              <th>Bus pax</th>
              <th>€ / head</th>
            </tr>
          </thead>
          <tbody>
            {busCostRows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="py-1.5">{r.show_date}</td>
                <td>{r.island}</td>
                <td>{r.seats_ordered}</td>
                <td>{money(Number(r.cost_total))}</td>
                <td>{r.nightPax}</td>
                <td>{r.cph != null ? money(r.cph) : "—"}</td>
              </tr>
            ))}
            {busCostRows.length ? (
              <tr className="border-t-2 font-semibold">
                <td className="py-2" colSpan={3}>
                  Period total
                </td>
                <td>
                  {money(round2(busCostRows.reduce((s, r) => s + Number(r.cost_total || 0), 0)))}
                </td>
                <td>{busCostRows.reduce((s, r) => s + r.nightPax, 0)}</td>
                <td>
                  {(() => {
                    const spend = busCostRows.reduce((s, r) => s + Number(r.cost_total || 0), 0);
                    const pax = busCostRows.reduce((s, r) => s + r.nightPax, 0);
                    return pax > 0 ? money(round2(spend / pax)) : "—";
                  })()}
                </td>
              </tr>
            ) : null}
            {!busCostRows.length ? (
              <tr>
                <td colSpan={6} className="py-4 text-slate-500">
                  No bus orders in this period — set seats and cost on the{" "}
                  <a className="font-semibold underline" href="/dashboard/show-ops/calendar">
                    show calendar
                  </a>{" "}
                  or Bus board.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div id="daily-sales" className="scroll-mt-24 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-900">Daily sales</h3>
            <p className="mt-1 text-sm text-slate-600">
              Bookings taken on {shortDate(salesDate)} (office time{island ? `, ${island}` : ""}). Cancelled ones left out.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <form method="get" className="flex flex-wrap items-end gap-2">
              {currentParams({ sales_date: undefined }).map(([k, v]) => (
                <input key={k} type="hidden" name={k} value={v} />
              ))}
              <label className="text-xs font-medium text-slate-600">
                Day
                <input
                  type="date"
                  name="sales_date"
                  defaultValue={salesDate}
                  max={todayLocal}
                  className="mt-1 block rounded-lg border px-2 py-1.5 text-sm"
                />
              </label>
              <button type="submit" className="rounded-xl bg-[var(--show-ops-primary,#7c3aed)] px-4 py-2 text-sm font-semibold text-white">
                Show day
              </button>
            </form>
            <a href={dailySalesCsvHref(salesDate, island)} className={SHOW_OPS_GHOST_BTN}>
              <Download className="mr-2 h-4 w-4" aria-hidden />
              Download CSV
            </a>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            ["Bookings", String(dailySales.summary.totalBookings)],
            ["Pax", String(dailySales.summary.totalPax)],
            ["Value", money(dailySales.summary.totalValue)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-slate-50 p-3">
              <p className="text-[11px] uppercase text-slate-500">{k}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{v}</p>
            </div>
          ))}
        </div>
        {dailySales.summary.totalBookings ? (
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <CountList title="By island" rows={dailySales.summary.byIsland} />
            <CountList title="By channel" rows={dailySales.summary.byChannel.map(([k, v]) => [k.replace(/_/g, " "), v])} />
            <CountList title="By hour" rows={dailySales.summary.byHour} />
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">No bookings taken that day.</p>
        )}
      </div>

      <div id="year" className="scroll-mt-24 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/80">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-900">Year · {statsMonth.slice(0, 4)}</h3>
            <p className="mt-1 text-sm text-slate-600">
              Sales by month, top partners for the chosen month, average ticket, no-shows, occupancy.
            </p>
          </div>
          <form method="get" className="flex flex-wrap items-end gap-2">
            {currentParams({ stats_month: undefined }).map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
            <label className="text-xs font-medium text-slate-600">
              Month
              <input
                type="month"
                name="stats_month"
                defaultValue={statsMonth}
                className="mt-1 block rounded-lg border px-2 py-1.5 text-sm"
              />
            </label>
            <button type="submit" className="rounded-xl bg-[var(--show-ops-primary,#7c3aed)] px-4 py-2 text-sm font-semibold text-white">
              Go
            </button>
          </form>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <ShowOpsPill href={hrefWith({ stats_island: "all" }, "#year")} on={!statsIsland}>
            All islands
          </ShowOpsPill>
          {ctx.config.islands.map((i) => (
            <ShowOpsPill key={i} href={hrefWith({ stats_island: i }, "#year")} on={statsIsland === i}>
              {i}
            </ShowOpsPill>
          ))}
        </div>
        <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(15rem,1fr)]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Sales by month · <span className="text-slate-900">■</span> gross ·{" "}
              <span style={{ color: PRIMARY }}>■</span> net after write-offs
            </p>
            <div className="mt-3 flex h-36 items-end gap-1.5">
              {analyticsMonths.map((mo) => (
                <div key={mo.m} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex w-full items-end justify-center gap-[2px]" style={{ height: "116px" }}>
                    <div
                      className="w-1/2 max-w-[14px] rounded-t bg-slate-900"
                      style={{ height: `${maxMonthGross ? Math.round((mo.gross / maxMonthGross) * 112) : 0}px` }}
                      title={`${mo.label} gross ${statsMoney(mo.gross)}`}
                    />
                    <div
                      className="w-1/2 max-w-[14px] rounded-t"
                      style={{
                        height: `${maxMonthGross ? Math.round((mo.net / maxMonthGross) * 112) : 0}px`,
                        backgroundColor: PRIMARY,
                      }}
                      title={`${mo.label} net ${statsMoney(mo.net)}`}
                    />
                  </div>
                  <span className="text-[10px] font-semibold uppercase text-slate-400">{mo.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Top partners · {monthLabel(statsMonth)}
            </p>
            <ul className="mt-3 space-y-2">
              {analyticsPartners.map((p, i) => (
                <li key={p.name} className="text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-medium text-slate-900">
                      {String(i + 1).padStart(2, "0")} · {p.name}
                    </span>
                    <span className="tabular-nums text-slate-600">{statsMoney(p.revenue)}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                    <div
                      className="h-1.5 rounded-full"
                      style={{
                        width: `${maxPartnerRevenue ? Math.max(4, Math.round((p.revenue / maxPartnerRevenue) * 100)) : 0}%`,
                        backgroundColor: PRIMARY,
                      }}
                    />
                  </div>
                </li>
              ))}
              {!analyticsPartners.length ? <li className="text-sm text-slate-500">No partner sales this month.</li> : null}
            </ul>
          </div>
        </div>
        <div className="mt-5 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Average ticket</p>
            <p className="mt-0.5 text-2xl font-semibold tabular-nums text-slate-900">
              {analytics?.avg_ticket != null ? statsMoney(Number(analytics.avg_ticket)) : "—"}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">No-show rate</p>
            <p className="mt-0.5 text-2xl font-semibold tabular-nums text-slate-900">
              {analytics?.no_show_rate != null ? `${analytics.no_show_rate}%` : "—"}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Average occupancy</p>
            <p className="mt-0.5 text-2xl font-semibold tabular-nums text-slate-900">
              {analytics?.occupancy != null ? `${analytics.occupancy}%` : "—"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function CountList({ title, rows }: { title: string; rows: Array<[string, number]> }) {
  const max = Math.max(1, ...rows.map(([, n]) => n));
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</p>
      <ul className="mt-2 space-y-1.5">
        {rows.map(([k, n]) => (
          <li key={k} className="flex items-center gap-2 text-sm">
            <span className="w-24 shrink-0 truncate text-slate-700">{k}</span>
            <div className="h-2 flex-1 rounded-full bg-slate-100">
              <div className="h-2 rounded-full" style={{ width: `${Math.max(3, (n / max) * 100)}%`, backgroundColor: PRIMARY }} />
            </div>
            <span className="w-8 text-right font-semibold tabular-nums text-slate-700">{n}</span>
          </li>
        ))}
        {!rows.length ? <li className="text-sm text-slate-500">None</li> : null}
      </ul>
    </div>
  );
}

/** "2026-08-14" → "14 Aug" */
function shortDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

function StatCard({
  label,
  value,
  sub,
  icon,
  tint,
  tone = "flat",
  highlight = false,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  tint: string;
  tone?: "up" | "down" | "flat";
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl p-4 ring-1 ${highlight ? "ring-[#ddd6fe]" : "ring-slate-200"}`}
      style={{ backgroundColor: highlight ? "#faf9ff" : "#fff" }}
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600" style={{ backgroundColor: tint }}>
          {icon}
        </span>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      </div>
      <p
        className={`mt-2 text-2xl font-semibold tabular-nums ${
          tone === "up" ? "text-emerald-600" : tone === "down" ? "text-rose-600" : "text-slate-900"
        }`}
      >
        {value}
      </p>
      <p className="mt-0.5 text-xs text-slate-500">{sub}</p>
    </div>
  );
}

function SummaryRow({ label, value, note, strong }: { label: string; value: string; note?: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-slate-600">{label}</dt>
      <dd className="text-right">
        <span className={`font-semibold tabular-nums ${strong ? "" : "text-slate-900"}`} style={strong ? { color: PRIMARY } : undefined}>
          {value}
        </span>
        {note ? <span className="block text-[11px] text-slate-400">{note}</span> : null}
      </dd>
    </div>
  );
}

function RankCard({ title, rows }: { title: string; rows: string[] }) {
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      <h3 className="text-sm font-semibold">{title}</h3>
      <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm text-slate-700">
        {rows.map((r) => (
          <li key={r}>{r}</li>
        ))}
        {!rows.length ? <li className="list-none text-slate-500">No data</li> : null}
      </ol>
    </div>
  );
}
