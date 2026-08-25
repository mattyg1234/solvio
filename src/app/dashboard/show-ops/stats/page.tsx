import Link from "next/link";
import { redirect } from "next/navigation";

import { SHOW_OPS_PRIMARY } from "@/components/show-ops/ops-home-widgets";
import { ShowOpsPageHeader, ShowOpsPill } from "@/components/show-ops/show-ops-page-header";
import { requireShowOpsPage } from "@/lib/show-ops/access";
import { formatShowOpsMoney } from "@/lib/show-ops/calc";

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

export default async function ShowOpsStatsPage({
  searchParams,
}: {
  searchParams: Promise<{ island?: string; month?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await requireShowOpsPage("stats");
  if (!ctx.business.show_ops_enabled) redirect("/dashboard/show-ops/setup");

  const today = new Date().toISOString().slice(0, 10);
  const month = sp.month || today.slice(0, 7);
  const island = sp.island || "";
  const money = (n: number) => formatShowOpsMoney(n, ctx.config.currency);

  const { data: analyticsRaw } = await ctx.supabase.rpc("show_ops_sales_analytics", {
    p_business: ctx.business.id,
    p_year: Number(month.slice(0, 4)) || new Date().getUTCFullYear(),
    p_island: island || null,
    p_month: month,
  });
  const analytics = (analyticsRaw ?? null) as {
    monthly?: Array<{ m: string; gross: number; net: number; pax: number }>;
    partners?: Array<{ name: string; revenue: number; pax: number }>;
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

  const hrefFor = (nextIsland: string) => {
    const p = new URLSearchParams();
    if (nextIsland) p.set("island", nextIsland);
    if (month !== today.slice(0, 7)) p.set("month", month);
    const q = p.toString();
    return q ? `/dashboard/show-ops/stats?${q}` : "/dashboard/show-ops/stats";
  };

  return (
    <div className="space-y-6">
      <ShowOpsPageHeader
        eyebrow="Analytics"
        title="Stats & insights"
        subtitle="Year ranking, partner mix, occupancy. Operational lists stay on the dashboard."
        actions={
          <form method="get" className="flex flex-wrap items-center gap-2">
            {island ? <input type="hidden" name="island" value={island} /> : null}
            <label className="sr-only" htmlFor="stats-month">
              Month
            </label>
            <input
              id="stats-month"
              type="month"
              name="month"
              defaultValue={month}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
            />
            <button type="submit" className="rounded-xl bg-white px-3 py-2 text-sm shadow-sm ring-1 ring-slate-200">
              Go
            </button>
          </form>
        }
      />

      <div className="flex flex-wrap gap-2">
        <ShowOpsPill href={hrefFor("")} on={!island}>
          All islands
        </ShowOpsPill>
        {ctx.config.islands.map((i) => (
          <ShowOpsPill key={i} href={hrefFor(i)} on={island === i}>
            {i}
          </ShowOpsPill>
        ))}
      </div>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/80">
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
              {analytics?.avg_ticket != null ? money(Number(analytics.avg_ticket)) : "—"}
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
      </section>
    </div>
  );
}
