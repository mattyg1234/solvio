"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  parseIsoYearMonth,
  shiftYearMonth,
  showOpsMonthCells,
  showOpsNightMonth,
} from "@/lib/show-ops/nights";
import { cn } from "@/lib/utils";

const WEEK_HEAD = ["S", "M", "T", "W", "T", "F", "S"] as const;

export function ShowOpsNightCalendar({
  nights,
  selected,
  onSelect,
}: {
  nights: string[];
  selected: string;
  onSelect: (iso: string) => void;
}) {
  const nightSet = useMemo(() => new Set(nights), [nights]);
  const [cursor, setCursor] = useState(() => {
    const fromSel = parseIsoYearMonth(selected);
    if (fromSel) return fromSel;
    const fromFirst = parseIsoYearMonth(nights[0] ?? "");
    if (fromFirst) return fromFirst;
    const n = new Date();
    return { year: n.getUTCFullYear(), month: n.getUTCMonth() + 1 };
  });

  useEffect(() => {
    const p = parseIsoYearMonth(selected) ?? parseIsoYearMonth(nights[0] ?? "");
    if (p) setCursor(p);
  }, [selected, nights]);

  const cells = useMemo(() => showOpsMonthCells(cursor.year, cursor.month), [cursor.year, cursor.month]);
  const titleIso = `${cursor.year}-${String(cursor.month).padStart(2, "0")}-01`;

  return (
    <div className="mt-3 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200/80">
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Previous month"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"
          onClick={() => setCursor((c) => shiftYearMonth(c.year, c.month, -1))}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <p className="text-sm font-semibold text-slate-900">{showOpsNightMonth(titleIso)}</p>
        <button
          type="button"
          aria-label="Next month"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"
          onClick={() => setCursor((c) => shiftYearMonth(c.year, c.month, 1))}
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {WEEK_HEAD.map((d, i) => (
          <div key={`${d}-${i}`} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((iso, idx) => {
          if (!iso) {
            return <div key={`e-${idx}`} className="aspect-square" aria-hidden />;
          }
          const on = nightSet.has(iso);
          const isSel = selected === iso;
          const day = Number(iso.slice(8, 10));
          return (
            <button
              key={iso}
              type="button"
              disabled={!on}
              aria-pressed={isSel || undefined}
              title={on ? iso : `${iso} — no show`}
              onClick={() => on && onSelect(iso)}
              className={cn(
                "aspect-square rounded-lg text-[13px] font-semibold transition",
                !on
                  ? "cursor-not-allowed text-slate-300"
                  : isSel
                    ? "bg-[var(--show-ops-primary,#7c3aed)] text-white shadow-sm shadow-[#7c3aed]/25"
                    : "bg-white text-violet-800 ring-1 ring-violet-200 hover:bg-violet-50 hover:ring-violet-400",
              )}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
