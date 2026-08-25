import Link from "next/link";
import type { ReactNode } from "react";

import type { ShowOpsShowFill } from "@/lib/show-ops/dashboard";

export const SHOW_OPS_PRIMARY = "var(--show-ops-primary,#7c3aed)";
export const SHOW_OPS_DONUT_COLORS = ["#7c3aed", "#14b8a6", "#38bdf8", "#fbbf24", "#f472b6", "#94a3b8"];

export function Sparkline({ series, stroke }: { series: number[]; stroke: string }) {
  const max = Math.max(...series, 1);
  const pts = series
    .map((v, i) => `${(i / Math.max(series.length - 1, 1)) * 100},${28 - (v / max) * 24}`)
    .join(" ");
  return (
    <svg viewBox="0 0 100 30" className="h-8 w-24" preserveAspectRatio="none" aria-hidden>
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function KpiCard({
  label,
  value,
  delta,
  deltaTone,
  tint,
  icon,
  series,
  stroke,
  warn,
  href,
}: {
  label: string;
  value: string;
  delta: string;
  deltaTone: "up" | "down" | "flat";
  tint: string;
  icon: string;
  series: number[];
  stroke: string;
  warn?: boolean;
  href?: string;
}) {
  const inner = (
    <>
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl text-lg" style={{ backgroundColor: tint }}>
          {icon}
        </span>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      </div>
      <p className="mt-2 text-3xl font-semibold tabular-nums text-slate-900">{value}</p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <p
          className={`text-xs font-semibold ${
            deltaTone === "up" ? "text-[#7c3aed]" : deltaTone === "down" ? "text-rose-600" : "text-slate-400"
          }`}
        >
          {delta}
        </p>
        <Sparkline series={series} stroke={stroke} />
      </div>
    </>
  );
  const cls = `rounded-2xl bg-white px-5 py-4 shadow-sm ring-1 ${warn ? "ring-amber-300" : "ring-slate-200/80"}`;
  if (href) {
    return (
      <Link href={href} className={`${cls} transition hover:shadow-md`}>
        {inner}
      </Link>
    );
  }
  return <div className={cls}>{inner}</div>;
}

export function AreaChart({ series }: { series: number[] }) {
  const max = Math.max(...series, 1);
  const n = Math.max(series.length - 1, 1);
  const pts = series.map((v, i) => [Math.round((i / n) * 300), Math.round(84 - (v / max) * 76)] as const);
  const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ");
  const area = `${line} L300,88 L0,88 Z`;
  return (
    <svg viewBox="0 0 300 90" className="mt-3 h-28 w-full" preserveAspectRatio="none" aria-hidden>
      <path d={area} fill="#7c3aed" opacity="0.14" />
      <path d={line} fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

export function Donut({ total, segments }: { total: number; segments: Array<{ value: number; color: string }> }) {
  const sum = segments.reduce((s, x) => s + x.value, 0) || 1;
  let offset = 25;
  return (
    <div className="relative h-32 w-32 shrink-0">
      <svg viewBox="0 0 42 42" className="h-32 w-32" aria-hidden>
        <circle cx="21" cy="21" r="15.9155" fill="none" stroke="#f1f5f9" strokeWidth="6" />
        {segments.map((s, i) => {
          const frac = (s.value / sum) * 100;
          const el = (
            <circle
              key={i}
              cx="21"
              cy="21"
              r="15.9155"
              fill="none"
              stroke={s.color}
              strokeWidth="6"
              strokeDasharray={`${frac} ${100 - frac}`}
              strokeDashoffset={offset}
              strokeLinecap="butt"
            />
          );
          offset -= frac;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold tabular-nums text-slate-900">{total.toLocaleString("en-GB")}</span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Total</span>
      </div>
    </div>
  );
}

export function QuickAction({
  href,
  title,
  sub,
  icon,
  tint,
}: {
  href: string;
  title: string;
  sub: string;
  icon: ReactNode;
  tint: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-4 shadow-sm ring-1 ring-slate-200/80 transition-shadow hover:shadow-md"
    >
      <span>
        <span className="block text-sm font-semibold" style={{ color: SHOW_OPS_PRIMARY }}>
          {title}
        </span>
        <span className="block text-xs text-slate-500">{sub}</span>
      </span>
      <span className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-700" style={{ backgroundColor: tint }}>
        {icon}
      </span>
    </Link>
  );
}

export function FillPill({ fill }: { fill: ShowOpsShowFill }) {
  if (fill === "full") {
    return <span className="inline-block rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-800">Full</span>;
  }
  if (fill === "almost") {
    return (
      <span className="inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold text-white" style={{ backgroundColor: SHOW_OPS_PRIMARY }}>
        Almost full
      </span>
    );
  }
  return (
    <span className="inline-block rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
      Open
    </span>
  );
}
