import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Lock, LockOpen } from "lucide-react";

import { requireShowOpsEnabled } from "@/lib/show-ops/access";
import { formatShowOpsMoney } from "@/lib/show-ops/calc";
import { TIPSI_GATE_COOKIE, verifyTipsiUnlockToken } from "@/lib/show-ops/tipsi-gate";
import {
  isTipsiStatsConfigured,
  loadTipsiOrders,
  summariseTipsiOrders,
  TIPSI_PERIODS,
  tipsiPeriodRange,
  type TipsiSummary,
} from "@/lib/show-ops/tipsi-stats";
import { cn } from "@/lib/utils";

import { lockTipsiTab, unlockTipsiTab } from "./actions";

export const dynamic = "force-dynamic";

const PAGE = "/dashboard/show-ops/tipsi";
/** Tipsi look: dark band, warm gradient wordmark. Kept in one place so it is easy to swap for the real brand kit. */
const TIPSI_DARK = "#140b24";
const TIPSI_FROM = "#ff4d8d";
const TIPSI_TO = "#ffb347";
const TIPSI_GRADIENT = `linear-gradient(90deg, ${TIPSI_FROM}, ${TIPSI_TO})`;

const eur = (n: number) => formatShowOpsMoney(n, "eur");

function TipsiBand({ children }: { children?: React.ReactNode }) {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl px-5 py-4 text-white shadow-sm"
      style={{ background: TIPSI_DARK }}
    >
      <div className="flex items-baseline gap-3">
        <span
          className="bg-clip-text text-3xl font-black tracking-tight text-transparent"
          style={{ backgroundImage: TIPSI_GRADIENT }}
        >
          Tipsi
        </span>
        <span className="text-sm text-white/70">Bar ordering at MHT</span>
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function Bars({ rows, max }: { rows: Array<{ label: string; value: number; display: string }>; max: number }) {
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[4.5rem_1fr_5.5rem] items-center gap-2 text-sm">
          <span className="truncate text-slate-600">{r.label}</span>
          <span className="h-3 rounded-full bg-slate-100">
            <span
              className="block h-3 rounded-full"
              style={{ width: `${max > 0 ? Math.max(2, (r.value / max) * 100) : 0}%`, backgroundImage: TIPSI_GRADIENT }}
            />
          </span>
          <span className="text-right font-semibold text-slate-900 tabular-nums">{r.display}</span>
        </li>
      ))}
    </ul>
  );
}

function Card({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border border-slate-200 bg-white p-5", className)}>
      <h3 className="mb-3 text-base font-bold text-slate-900">{title}</h3>
      {children}
    </section>
  );
}

function monthName(ym: string): string {
  const d = new Date(`${ym}-01T12:00:00Z`);
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

function dayName(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

function Dashboard({ s }: { s: TipsiSummary }) {
  if (!s.orders) {
    return <p className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-600">No Tipsi orders in this period.</p>;
  }
  const hourMax = Math.max(...s.byHour.map((h) => h.gross), 0);
  const wdMax = Math.max(...s.byWeekday.map((w) => w.gross), 0);
  const recentNights = [...s.byDay].reverse().slice(0, 14);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Sales (gross)" value={eur(s.gross)} hint={`${s.orders.toLocaleString("en-GB")} orders`} />
        <Stat label="Tipsi commission" value={eur(s.fee)} hint={s.gross ? `${((s.fee / s.gross) * 100).toFixed(1)}% of sales` : undefined} />
        <Stat label="MHT keeps" value={eur(s.venueNet)} hint={s.refundCount ? `after ${s.refundCount} refund${s.refundCount === 1 ? "" : "s"} (${eur(s.refunds)})` : "after commission"} />
        <Stat label="Average order" value={eur(s.avgOrder)} hint={`${s.itemsSold.toLocaleString("en-GB")} drinks sold`} />
        <Stat label="Nights trading" value={String(s.activeNights)} hint={s.activeNights ? `${eur(s.gross / s.activeNights)} a night` : undefined} />
        <Stat
          label="Best night"
          value={s.bestNight ? eur(s.bestNight.gross) : "–"}
          hint={s.bestNight ? `${dayName(s.bestNight.day)} · ${s.bestNight.orders} orders` : undefined}
        />
        <Stat
          label="Orders a night"
          value={s.activeNights ? (s.orders / s.activeNights).toFixed(1) : "–"}
        />
        <Stat
          label="Time to accept"
          value={s.avgAcceptanceSeconds != null ? `${Math.round(s.avgAcceptanceSeconds / 6) / 10} min` : "–"}
          hint="average, bar staff"
        />
      </div>

      <Card title="By month">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-1.5 pr-3">Month</th>
                <th className="py-1.5 pr-3 text-right">Orders</th>
                <th className="py-1.5 pr-3 text-right">Sales</th>
                <th className="py-1.5 pr-3 text-right">Tipsi commission</th>
                <th className="py-1.5 text-right">MHT keeps</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {s.byMonth.map((m) => (
                <tr key={m.month}>
                  <td className="py-2 pr-3 font-semibold text-slate-900">{monthName(m.month)}</td>
                  <td className="py-2 pr-3 text-right">{m.orders}</td>
                  <td className="py-2 pr-3 text-right">{eur(m.gross)}</td>
                  <td className="py-2 pr-3 text-right">{eur(m.fee)}</td>
                  <td className="py-2 text-right font-semibold">{eur(m.gross - m.fee)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Top drinks">
          <ol className="divide-y divide-slate-100 text-sm">
            {s.topItems.map((it, i) => (
              <li key={it.name} className="flex items-center justify-between gap-3 py-1.5">
                <span className="min-w-0 truncate text-slate-800">
                  <span className="mr-2 text-slate-400 tabular-nums">{i + 1}.</span>
                  {it.name}
                </span>
                <span className="shrink-0 tabular-nums text-slate-600">
                  {it.quantity} · <span className="font-semibold text-slate-900">{eur(it.revenue)}</span>
                </span>
              </li>
            ))}
          </ol>
        </Card>
        <div className="space-y-5">
          <Card title="Busiest hours">
            <Bars
              max={hourMax}
              rows={s.byHour.map((h) => ({ label: `${String(h.hour).padStart(2, "0")}:00`, value: h.gross, display: eur(h.gross) }))}
            />
          </Card>
          <Card title="By night of the week">
            <Bars max={wdMax} rows={s.byWeekday.map((w) => ({ label: w.weekday, value: w.gross, display: eur(w.gross) }))} />
          </Card>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Recent nights">
          <table className="w-full text-sm tabular-nums">
            <tbody className="divide-y divide-slate-100">
              {recentNights.map((d) => (
                <tr key={d.day}>
                  <td className="py-1.5 pr-3 text-slate-800">{dayName(d.day)}</td>
                  <td className="py-1.5 pr-3 text-right text-slate-600">{d.orders} orders</td>
                  <td className="py-1.5 text-right font-semibold text-slate-900">{eur(d.gross)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        {s.topTables.length ? (
          <Card title="Top tables">
            <table className="w-full text-sm tabular-nums">
              <tbody className="divide-y divide-slate-100">
                {s.topTables.map((t) => (
                  <tr key={t.table}>
                    <td className="py-1.5 pr-3 text-slate-800">Table {t.table}</td>
                    <td className="py-1.5 pr-3 text-right text-slate-600">{t.orders} orders</td>
                    <td className="py-1.5 text-right font-semibold text-slate-900">{eur(t.gross)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

export default async function TipsiStatsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; wrong?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await requireShowOpsEnabled();
  // Directors only (Joel's account).
  if (ctx.role !== "owner") redirect("/dashboard/show-ops");

  const jar = await cookies();
  const unlocked = verifyTipsiUnlockToken(jar.get(TIPSI_GATE_COOKIE)?.value, ctx.user.id);

  if (!unlocked) {
    return (
      <div className="mx-auto max-w-md space-y-5 py-6">
        <TipsiBand />
        <form action={unlockTipsiTab} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex items-center gap-2 text-slate-900">
            <Lock className="size-5" aria-hidden />
            <h2 className="text-lg font-bold">Enter the Tipsi password</h2>
          </div>
          <input type="hidden" name="period" value={sp.period ?? ""} />
          <input
            name="password"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            required
            aria-label="Tipsi password"
            className="h-12 w-full rounded-xl border border-slate-300 px-4 text-center text-2xl tracking-[0.5em] text-slate-900 outline-none focus:border-slate-900"
          />
          {sp.wrong ? <p className="text-sm font-semibold text-red-600">That password is not right.</p> : null}
          <button
            type="submit"
            className="h-11 w-full rounded-xl font-bold text-white shadow-sm"
            style={{ backgroundImage: TIPSI_GRADIENT }}
          >
            Open Tipsi stats
          </button>
        </form>
      </div>
    );
  }

  const range = tipsiPeriodRange(sp.period);
  let summary: TipsiSummary | null = null;
  let error: string | null = null;
  if (!isTipsiStatsConfigured()) {
    error = "The Tipsi connection is not set up yet (TIPSI_SUPABASE_SERVICE_ROLE_KEY is missing in Vercel).";
  } else {
    try {
      summary = summariseTipsiOrders(await loadTipsiOrders({ fromIso: range.fromIso, toIso: range.toIso }));
    } catch (e) {
      console.error("[tipsi-stats]", e);
      error = "Could not load Tipsi numbers just now. Try again in a minute.";
    }
  }

  return (
    <div className="space-y-5">
      <TipsiBand>
        <form action={lockTipsiTab}>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 px-3 py-1.5 text-sm font-semibold text-white/90 hover:bg-white/10"
          >
            <LockOpen className="size-4" aria-hidden /> Lock
          </button>
        </form>
      </TipsiBand>

      <nav className="flex flex-wrap gap-2" aria-label="Period">
        {TIPSI_PERIODS.map((p) => (
          <Link
            key={p.key}
            href={p.key === "all" ? PAGE : `${PAGE}?period=${p.key}`}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm font-semibold",
              range.key === p.key ? "border-transparent text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
            )}
            style={range.key === p.key ? { backgroundImage: TIPSI_GRADIENT } : undefined}
          >
            {p.label}
          </Link>
        ))}
      </nav>

      {error ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">{error}</p>
      ) : summary ? (
        <Dashboard s={summary} />
      ) : null}

      <p className="text-xs text-slate-500">
        Live from Tipsi. Nights run 06:00 to 06:00 Canary time, so after-midnight orders count to the night before.
        Amounts in euros, as guests paid them.
      </p>
    </div>
  );
}
