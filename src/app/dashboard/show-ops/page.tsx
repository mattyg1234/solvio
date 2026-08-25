import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart3, CalendarPlus, FileText, Star } from "lucide-react";

import {
  AreaChart,
  Donut,
  FillPill,
  KpiCard,
  QuickAction,
  SHOW_OPS_DONUT_COLORS,
  SHOW_OPS_PRIMARY,
} from "@/components/show-ops/ops-home-widgets";
import { ShowOpsNewBookingButton, ShowOpsPageHeader, ShowOpsPill } from "@/components/show-ops/show-ops-page-header";
import { requireShowOpsContext } from "@/lib/show-ops/access";
import { formatShowOpsMoney } from "@/lib/show-ops/calc";
import { effectiveModules } from "@/lib/show-ops/config";
import { buildShowOpsDashboard } from "@/lib/show-ops/dashboard";

function isoOffset(days: number): string {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function monthBounds(ym: string): { start: string; end: string } {
  const start = `${ym}-01`;
  const endDate = new Date(`${start}T12:00:00Z`);
  endDate.setUTCMonth(endDate.getUTCMonth() + 1);
  endDate.setUTCDate(0);
  return { start, end: endDate.toISOString().slice(0, 10) };
}

function showOpsMonthLabel(ym: string): string {
  const d = new Date(`${ym}-01T12:00:00Z`);
  return Number.isNaN(d.getTime())
    ? ym
    : d.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

function invoiceFortnight(today: string): { start: string; end: string; label: string } {
  const ym = today.slice(0, 7);
  const day = Number(today.slice(8, 10));
  const { end: monthEnd } = monthBounds(ym);
  if (day <= 15) {
    return { start: `${ym}-01`, end: `${ym}-15`, label: `Period 01–15/${today.slice(5, 7)}` };
  }
  return { start: `${ym}-16`, end: monthEnd, label: `Period 16–${monthEnd.slice(8)}/${today.slice(5, 7)}` };
}

export default async function ShowOpsHomePage({
  searchParams,
}: {
  searchParams: Promise<{ island?: string; month?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await requireShowOpsContext();
  if (!ctx.business.show_ops_enabled) redirect("/dashboard/show-ops/setup");

  const today = new Date().toISOString().slice(0, 10);
  const month = sp.month || today.slice(0, 7);
  const island = sp.island || "";
  const { start: monthStart, end: monthEnd } = monthBounds(month);
  const weekStart = isoOffset(-6);
  const weekEnd = isoOffset(14);
  const period = invoiceFortnight(today);
  const modules = effectiveModules(ctx.config, ctx.tier);
  const stripeReady = Boolean(
    ctx.business.stripe_connect_account_id?.trim() && ctx.business.stripe_connect_charges_enabled,
  );

  let monthQuery = ctx.supabase
    .from("show_bookings")
    .select(
      "show_date,island,adults,children,infants,transport_required,billing_mode,payment_status,balance_remaining,total_cost,nett_total,supplier_name,product_id,show_name,pickup_stop_id,no_show",
    )
    .eq("business_id", ctx.business.id)
    .gte("show_date", monthStart)
    .lte("show_date", monthEnd)
    .is("cancelled_at", null);
  if (island) monthQuery = monthQuery.eq("island", island);

  let weekQuery = ctx.supabase
    .from("show_bookings")
    .select(
      "show_date,island,adults,children,infants,transport_required,billing_mode,payment_status,balance_remaining,total_cost,nett_total,supplier_name,product_id,show_name,pickup_stop_id,no_show",
    )
    .eq("business_id", ctx.business.id)
    .gte("show_date", weekStart)
    .lte("show_date", weekEnd)
    .is("cancelled_at", null);
  if (island) weekQuery = weekQuery.eq("island", island);

  let uninvoicedQuery = ctx.supabase
    .from("show_bookings")
    .select("id", { count: "exact", head: true })
    .eq("business_id", ctx.business.id)
    .eq("billing_mode", "invoice")
    .is("invoice_id", null)
    .is("cancelled_at", null)
    .gte("show_date", period.start)
    .lte("show_date", period.end);
  if (island) uninvoicedQuery = uninvoicedQuery.eq("island", island);

  const [{ data: bookings }, { data: monthBookings }, { data: unpaidDeposits }, { data: busOrders }, { data: invoices }, { data: products }, { data: stops }, uninvoiced] =
    await Promise.all([
      weekQuery,
      monthQuery,
      ctx.supabase
        .from("show_bookings")
        .select("balance_remaining,deposit_amount,payment_status")
        .eq("business_id", ctx.business.id)
        .eq("billing_mode", "deposit")
        .neq("payment_status", "paid")
        .neq("payment_status", "n_a")
        .is("cancelled_at", null),
      ctx.supabase
        .from("show_bus_orders")
        .select("show_date,island,seats_ordered")
        .eq("business_id", ctx.business.id)
        .eq("show_date", today),
      modules.includes("invoices")
        ? ctx.supabase
            .from("show_invoices")
            .select("total_amount,due_date,paid,supplier_name")
            .eq("business_id", ctx.business.id)
            .eq("paid", false)
            .eq("voided", false)
        : Promise.resolve({ data: [] as { total_amount: number; due_date: string | null; paid: boolean; supplier_name?: string | null }[] }),
      ctx.supabase.from("show_products").select("id,name,island,capacity,active").eq("business_id", ctx.business.id),
      ctx.supabase.from("show_bus_stops").select("id,island,resort").eq("business_id", ctx.business.id),
      uninvoicedQuery,
    ]);

  const { data: myProfile } = await ctx.supabase
    .from("profiles")
    .select("full_name")
    .eq("id", ctx.user.id)
    .maybeSingle();
  const firstName = ((myProfile?.full_name as string | null) ?? "").trim().split(/\s+/)[0] || "";

  const productsForView = island ? (products ?? []).filter((p) => p.island === island) : (products ?? []);

  const dash = buildShowOpsDashboard({
    today,
    weekStart,
    weekEnd,
    currency: ctx.config.currency,
    bookings: bookings ?? [],
    unpaidDeposits: unpaidDeposits ?? [],
    busOrders: busOrders ?? [],
    invoices: invoices ?? [],
    products: productsForView,
    stops: stops ?? [],
    stripeReady,
    guestStripeEnabled: ctx.config.guest_stripe_enabled,
    monthBookings: monthBookings ?? [],
    uninvoicedCount: uninvoiced.count ?? 0,
    invoicePeriodLabel: period.label,
  });

  // Year-wide sales analytics, aggregated in SQL (8k+ bookings — never row-fetched).
  const { data: analyticsRaw } = await ctx.supabase.rpc("show_ops_sales_analytics", {
    p_business: ctx.business.id,
    p_year: Number(month.slice(0, 4)) || new Date().getUTCFullYear(),
    p_island: island || null,
    p_month: month,
  });
  const analytics = (analyticsRaw ?? null) as {
    monthly?: Array<{ m: string; gross: number; net: number; pax: number }>;
    partners?: Array<{ name: string; revenue: number; pax: number }>;
    daily?: Array<{ d: string; net: number }>;
    islands?: Array<{ island: string; bookings: number; pax: number }>;
    avg_ticket?: number | null;
    no_show_rate?: number | null;
    occupancy?: number | null;
  } | null;
  const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
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

  const curIdx = Number(month.slice(5, 7)) - 1;
  const prevIdx = curIdx - 1;
  const cur = analyticsMonths[curIdx] ?? { gross: 0, net: 0, pax: 0 };
  const prev = prevIdx >= 0 ? analyticsMonths[prevIdx] : null;
  const pct = (now: number, before: number | null | undefined) =>
    before && before > 0 ? Math.round(((now - before) / before) * 100) : null;
  const ticketsPct = pct(cur.pax, prev?.pax);
  const netPct = pct(cur.net, prev?.net);

  const dayCount = Number(monthEnd.slice(8, 10));
  const dailyByD = new Map((analytics?.daily ?? []).map((x) => [Number(x.d), Number(x.net || 0)]));
  const dailySeries = Array.from({ length: dayCount }, (_, i) => dailyByD.get(i + 1) ?? 0);
  const islandsSplit = (analytics?.islands ?? []).map((x) => ({
    island: x.island,
    bookings: Number(x.bookings || 0),
    pax: Number(x.pax || 0),
  }));
  const islandTotal = islandsSplit.reduce((s, x) => s + x.bookings, 0);

  const money = (n: number) => formatShowOpsMoney(n, ctx.config.currency);
  const tonightHref = (extra?: Record<string, string>) => {
    const p = new URLSearchParams();
    p.set("date", today);
    if (island) p.set("island", island);
    if (extra) {
      for (const [k, v] of Object.entries(extra)) p.set(k, v);
    }
    return `/dashboard/show-ops/bookings?${p.toString()}`;
  };
  const homeHref = (nextIsland: string) => {
    const p = new URLSearchParams();
    if (nextIsland) p.set("island", nextIsland);
    if (month !== today.slice(0, 7)) p.set("month", month);
    const q = p.toString();
    return q ? `/dashboard/show-ops?${q}` : "/dashboard/show-ops";
  };

  const tonightShows = [...(island ? dash.shows.filter((s) => s.island === island) : dash.shows)].sort(
    (a, b) => b.pax - a.pax || a.name.localeCompare(b.name),
  );
  const paxSeries = analyticsMonths.map((x) => x.pax);
  const netSeries = analyticsMonths.map((x) => x.net);
  const grossSeries = analyticsMonths.map((x) => x.gross);

  return (
    <div className="space-y-6">
      <ShowOpsPageHeader
        eyebrow={`Welcome back${firstName ? `, ${firstName}` : ""} 👋`}
        title="Admin dashboard"
        actions={
          <>
            <form method="get" className="flex items-center gap-2">
              {island ? <input type="hidden" name="island" value={island} /> : null}
              <label className="sr-only" htmlFor="ops-month">
                Month
              </label>
              <input
                id="ops-month"
                type="month"
                name="month"
                defaultValue={month}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
              />
              <button type="submit" className="rounded-xl bg-white px-3 py-2 text-sm shadow-sm ring-1 ring-slate-200">
                Go
              </button>
            </form>
            <ShowOpsNewBookingButton />
          </>
        }
      />

      <div className="flex flex-wrap gap-2">
        <ShowOpsPill href={homeHref("")} on={!island}>
          All islands
        </ShowOpsPill>
        {ctx.config.islands.map((i) => (
          <ShowOpsPill key={i} href={homeHref(i)} on={island === i}>
            {i}
          </ShowOpsPill>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Tickets this month"
          value={dash.month.tickets.toLocaleString("en-GB")}
          delta={ticketsPct != null ? `${ticketsPct >= 0 ? "↑" : "↓"} ${Math.abs(ticketsPct)}% vs last month` : "—"}
          deltaTone={ticketsPct == null ? "flat" : ticketsPct >= 0 ? "up" : "down"}
          tint="#ecfdf5"
          icon="🎟"
          series={paxSeries}
          stroke="#10b981"
          href="/dashboard/show-ops/bookings"
        />
        <KpiCard
          label="Net sales"
          value={money(dash.month.netSales)}
          delta={netPct != null ? `${netPct >= 0 ? "↑" : "↓"} ${Math.abs(netPct)}% vs last month` : "—"}
          deltaTone={netPct == null ? "flat" : netPct >= 0 ? "up" : "down"}
          tint="#f5f3ff"
          icon="€"
          series={netSeries}
          stroke="#7c3aed"
        />
        <KpiCard
          label="No-shows"
          value={String(dash.month.noShows)}
          delta="— No change"
          deltaTone="flat"
          tint="#eff6ff"
          icon="📅"
          series={[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]}
          stroke="#38bdf8"
        />
        <KpiCard
          label="Outstanding"
          value={money(dash.month.outstanding)}
          delta={`Due from ${(unpaidDeposits ?? []).length} bookings`}
          deltaTone="flat"
          tint="#fffbeb"
          icon="💳"
          series={grossSeries}
          stroke="#f59e0b"
          warn={dash.month.outstanding > 0}
          href="/dashboard/show-ops/payments"
        />
      </div>

      <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(20rem,1fr)]">
        <div className="relative min-h-[22rem] xl:min-h-0">
          <section className="flex flex-col overflow-hidden rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/80 xl:absolute xl:inset-0">
            <div className="flex shrink-0 items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 font-semibold text-slate-900">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg text-base" style={{ backgroundColor: "#f5f3ff" }}>
                  🎫
                </span>
                Tonight&apos;s shows
              </h3>
              <Link href={tonightHref()} className="text-sm font-semibold" style={{ color: SHOW_OPS_PRIMARY }}>
                View all{tonightShows.length ? ` ${tonightShows.length}` : ""} →
              </Link>
            </div>
            <div className="mt-3 min-h-0 flex-1 overflow-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 bg-white text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="py-2 pr-3">Show</th>
                    <th className="py-2 pr-3">{ctx.config.location_label}</th>
                    <th className="py-2 pr-3">People</th>
                    <th className="py-2 pr-3">Capacity</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {tonightShows.map((row) => (
                    <tr key={`${row.island}-${row.productId || row.name}`} className="border-t border-slate-100">
                      <td className="py-2 pr-3 font-medium text-slate-900">{row.name}</td>
                      <td className="py-2 pr-3 text-slate-600">{row.island}</td>
                      <td className="py-2 pr-3 tabular-nums text-slate-700">
                        {row.pax}
                        <span className="text-xs font-normal text-slate-500">
                          {" "}
                          ({row.adults} ad · {row.children} ch · {row.infants} inf)
                        </span>
                      </td>
                      <td className="py-2 pr-3 tabular-nums">{row.capacity ?? "—"}</td>
                      <td className="py-2">
                        <Link href={tonightHref({ show: row.name })}>
                          <FillPill fill={row.fill} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {!tonightShows.length ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-slate-500">
                        No shows set up yet — add them under Shows.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div className="space-y-4">
          <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
            <h3 className="flex items-center gap-2 font-semibold text-slate-900">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-base">🔔</span>
              Needs your attention
            </h3>
            <ul className="mt-3 space-y-2">
              {dash.attention.map((item) => (
                <li key={item.title}>
                  <Link
                    href={item.href}
                    className="flex items-center justify-between gap-2 rounded-xl bg-rose-50/60 px-3 py-3 ring-1 ring-rose-100 hover:bg-rose-50"
                  >
                    <span>
                      <span className="block text-sm font-semibold text-slate-900">{item.title}</span>
                      <span className="block text-sm text-slate-500">{item.detail}</span>
                    </span>
                    <span className="text-slate-400">›</span>
                  </Link>
                </li>
              ))}
              {dash.alerts
                .filter((a) => a.tone === "danger")
                .map((a) => (
                  <li key={a.title}>
                    <Link
                      href={a.href || "/dashboard/show-ops"}
                      className="flex items-center justify-between gap-2 rounded-xl bg-rose-50 px-3 py-3 ring-1 ring-rose-200 hover:bg-rose-100"
                    >
                      <span className="text-sm font-semibold text-rose-900">{a.title}</span>
                      <span className="text-rose-400">›</span>
                    </Link>
                  </li>
                ))}
              {!dash.attention.length && !dash.alerts.some((a) => a.tone === "danger") ? (
                <li className="text-sm text-emerald-800">Nothing waiting. Lists and invoices are clear.</li>
              ) : null}
            </ul>
          </section>

          <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold text-slate-900">Sales overview</h3>
              <span className="rounded-lg bg-slate-50 px-2 py-1 text-xs font-medium text-slate-500 ring-1 ring-slate-200">
                {showOpsMonthLabel(month)}
              </span>
            </div>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">
              {money(cur.net)}
              {netPct != null ? (
                <span className={`ml-2 text-sm font-semibold ${netPct >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {netPct >= 0 ? "↗" : "↘"} {Math.abs(netPct)}% vs last month
                </span>
              ) : null}
            </p>
            <AreaChart series={dailySeries} />
            <div className="mt-1 flex justify-between text-[10px] font-semibold uppercase text-slate-400">
              <span>1 {showOpsMonthLabel(month).slice(0, 3)}</span>
              <span>8</span>
              <span>15</span>
              <span>22</span>
              <span>{dayCount}</span>
            </div>
          </section>

          {!island ? (
          <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold text-slate-900">Bookings by island</h3>
              <span className="rounded-lg bg-slate-50 px-2 py-1 text-xs font-medium text-slate-500 ring-1 ring-slate-200">
                {showOpsMonthLabel(month)}
              </span>
            </div>
            <div className="mt-3 flex items-center gap-5">
              <Donut
                total={islandTotal}
                segments={islandsSplit.map((x, i) => ({ value: x.bookings, color: SHOW_OPS_DONUT_COLORS[i % SHOW_OPS_DONUT_COLORS.length] }))}
              />
              <ul className="flex-1 space-y-1.5 text-sm">
                {islandsSplit.map((x, i) => (
                  <li key={x.island} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-slate-700">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SHOW_OPS_DONUT_COLORS[i % SHOW_OPS_DONUT_COLORS.length] }} />
                      {x.island}
                    </span>
                    <span className="tabular-nums text-slate-500">
                      <span className="font-semibold text-slate-900">
                        {islandTotal ? Math.round((x.bookings / islandTotal) * 100) : 0}%
                      </span>{" "}
                      ({x.bookings})
                    </span>
                  </li>
                ))}
                {!islandsSplit.length ? <li className="text-slate-500">No bookings this month.</li> : null}
              </ul>
            </div>
          </section>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <QuickAction href="/dashboard/show-ops/bookings/new" title="New booking" sub="Create a booking" icon={<CalendarPlus className="h-5 w-5" />} tint="#ecfdf5" />
        <QuickAction href="/dashboard/show-ops/invoices" title="Create invoice" sub="Invoice bookings" icon={<FileText className="h-5 w-5" />} tint="#f5f3ff" />
        <QuickAction href="/dashboard/show-ops/reports" title="View reports" sub="See analytics" icon={<BarChart3 className="h-5 w-5" />} tint="#eff6ff" />
        <QuickAction href="/dashboard/show-ops/lists" title="Night list" sub="View night lists" icon={<Star className="h-5 w-5" />} tint="#fffbeb" />
      </div>

      {analytics ? (
        <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold text-slate-900">Sales analytics &amp; ranking · {month.slice(0, 4)}</h3>
            <Link href="/dashboard/show-ops/reports" className="text-sm font-semibold" style={{ color: SHOW_OPS_PRIMARY }}>
              Full reports →
            </Link>
          </div>
          <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(15rem,1fr)]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Sales by month · <span className="text-slate-900">■</span> gross ·{" "}
                <span style={{ color: SHOW_OPS_PRIMARY }}>■</span> net after write-offs
              </p>
              <div className="mt-3 flex h-36 items-end gap-1.5">
                {analyticsMonths.map((mo) => (
                  <div key={mo.m} className="flex flex-1 flex-col items-center gap-1">
                    <div className="flex w-full items-end justify-center gap-[2px]" style={{ height: "116px" }}>
                      <div
                        className="w-1/2 max-w-[14px] rounded-t bg-slate-900"
                        style={{ height: `${maxMonthGross ? Math.round((mo.gross / maxMonthGross) * 112) : 0}px` }}
                        title={`${mo.label} gross ${money(mo.gross)}`}
                      />
                      <div
                        className="w-1/2 max-w-[14px] rounded-t"
                        style={{
                          height: `${maxMonthGross ? Math.round((mo.net / maxMonthGross) * 112) : 0}px`,
                          backgroundColor: SHOW_OPS_PRIMARY,
                        }}
                        title={`${mo.label} net ${money(mo.net)}`}
                      />
                    </div>
                    <span className="text-[10px] font-semibold uppercase text-slate-400">{mo.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Top partners · {showOpsMonthLabel(month)}
              </p>
              <ul className="mt-3 space-y-2">
                {analyticsPartners.map((p, i) => (
                  <li key={p.name} className="text-sm">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-medium text-slate-900">
                        {String(i + 1).padStart(2, "0")} · {p.name}
                      </span>
                      <span className="tabular-nums text-slate-600">{money(p.revenue)}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                      <div
                        className="h-1.5 rounded-full"
                        style={{
                          width: `${maxPartnerRevenue ? Math.max(4, Math.round((p.revenue / maxPartnerRevenue) * 100)) : 0}%`,
                          backgroundColor: SHOW_OPS_PRIMARY,
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
                {analytics.avg_ticket != null ? money(Number(analytics.avg_ticket)) : "—"}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">No-show rate</p>
              <p className="mt-0.5 text-2xl font-semibold tabular-nums text-slate-900">
                {analytics.no_show_rate != null ? `${analytics.no_show_rate}%` : "—"}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Average occupancy</p>
              <p className="mt-0.5 text-2xl font-semibold tabular-nums text-slate-900">
                {analytics.occupancy != null ? `${analytics.occupancy}%` : "—"}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {dash.areas.length ? (
        <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <h3 className="font-semibold text-slate-900">Bus by area tonight</h3>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-400">
                <tr>
                  <th className="py-1.5 pr-3">{ctx.config.location_label}</th>
                  <th className="py-1.5 pr-3">Area</th>
                  <th className="py-1.5 pr-3">On bus</th>
                  <th className="py-1.5">Island seats left</th>
                </tr>
              </thead>
              <tbody>
                {dash.areas.map((row) => (
                  <tr key={`${row.island}-${row.resort}`} className="border-t border-slate-100">
                    <td className="py-2 pr-3">{row.island}</td>
                    <td className="py-2 pr-3 font-medium">{row.resort}</td>
                    <td className="py-2 pr-3">{row.busPax}</td>
                    <td className="py-2">{row.seatsLeft == null ? "Order a bus" : row.seatsLeft}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
