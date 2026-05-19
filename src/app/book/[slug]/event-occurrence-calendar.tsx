"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import type { ExpandedOccurrence } from "@/lib/business-event-occurrences";
import { dowSunday0, formatYmdInTimeZone } from "@/lib/business-event-occurrences";
import { coerceValidIanaTimeZone } from "@/lib/safe-timezone";
import { cn } from "@/lib/utils";

const WEEK_HEAD_LABELS = ["S", "M", "T", "W", "T", "F", "S"] as const;

/** Find a UTC instant whose calendar day in `timeZone` is `year-month-day`. */
function findUtcProbeForVenueLocalCalendarDay(year: number, month1: number, day: number, timeZone: string): Date | null {
  const zone = coerceValidIanaTimeZone(timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  const target = `${year}-${pad(month1)}-${pad(day)}`;
  const anchor = Date.UTC(year, month1 - 1, day, 14, 0, 0);
  for (let h = -36; h <= 36; h++) {
    const probe = new Date(anchor + h * 3_600_000);
    if (formatYmdInTimeZone(probe, zone) === target) return probe;
  }
  return null;
}

function dowOfMonthFirst(year: number, month1Indexed: number, timeZone: string): number {
  const zone = coerceValidIanaTimeZone(timeZone);
  const probe = findUtcProbeForVenueLocalCalendarDay(year, month1Indexed, 1, zone);
  if (!probe) return 0;
  return dowSunday0(probe, zone);
}

function daysInMonth(year: number, month1Indexed: number): number {
  return new Date(year, month1Indexed, 0).getDate();
}

function ymPrefix(year: number, month1Indexed: number): string {
  return `${year}-${String(month1Indexed).padStart(2, "0")}-`;
}

function parseYmFromYmd(ymd: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]) };
}

export type EventOccurrenceMonthCalendarProps = {
  timeZone: string;
  /** Future occurrences for this listing — includes cancelled nights (not tappable). */
  occurrences: ExpandedOccurrence[];
  selected: ExpandedOccurrence | null;
  onSelect: (o: ExpandedOccurrence) => void;
};

/** Guest calendar: only evenings with a real showing are tappable. */
export function EventOccurrenceMonthCalendar({
  timeZone,
  occurrences,
  selected,
  onSelect,
}: EventOccurrenceMonthCalendarProps) {
  const [cursor, setCursor] = useState(() => {
    const first = occurrences[0]?.dateYmd;
    const p = first ? parseYmFromYmd(first) : null;
    if (p?.year && p.month) return p;
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() + 1 };
  });

  useEffect(() => {
    const ymd = occurrences[0]?.dateYmd;
    if (!ymd) return;
    const p = parseYmFromYmd(ymd);
    if (p?.year && p.month) setCursor(p);
  }, [occurrences]);

  const [pendingSameDayChoices, setPendingSameDayChoices] = useState<ExpandedOccurrence[] | null>(null);

  useEffect(() => {
    setPendingSameDayChoices(null);
  }, [cursor.year, cursor.month, occurrences]);

  const occByCalendarDay = useMemo(() => {
    const pref = ymPrefix(cursor.year, cursor.month);
    const map = new Map<number, ExpandedOccurrence[]>();
    for (const o of occurrences) {
      if (!o.dateYmd.startsWith(pref)) continue;
      const dom = Number(o.dateYmd.slice(8, 10));
      if (!Number.isFinite(dom)) continue;
      const arr = map.get(dom) ?? [];
      arr.push(o);
      map.set(dom, arr);
    }
    for (const [k, v] of map) {
      v.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
      map.set(k, v);
    }
    return map;
  }, [occurrences, cursor.year, cursor.month]);

  const cancelledInMonth = useMemo(() => {
    const pref = ymPrefix(cursor.year, cursor.month);
    return occurrences
      .filter((o) => o.skipped && o.dateYmd.startsWith(pref))
      .sort((a, b) => a.dateYmd.localeCompare(b.dateYmd));
  }, [occurrences, cursor.year, cursor.month]);

  const lastDom = daysInMonth(cursor.year, cursor.month);
  const leadingBlanks = dowOfMonthFirst(cursor.year, cursor.month, timeZone);
  const totalCells = Math.ceil((leadingBlanks + lastDom) / 7) * 7;

  function shiftMonth(delta: number) {
    setCursor((c) => {
      let ny = c.year;
      let nm = c.month + delta;
      while (nm < 1) {
        nm += 12;
        ny -= 1;
      }
      while (nm > 12) {
        nm -= 12;
        ny += 1;
      }
      return { year: ny, month: nm };
    });
  }

  const monthTitle = new Date(cursor.year, cursor.month - 1, 1).toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });

  function sameSel(a: ExpandedOccurrence | null, b: ExpandedOccurrence): boolean {
    return Boolean(a && a.dateYmd === b.dateYmd && a.starts_at === b.starts_at);
  }

  function formatSlotTitle(o: ExpandedOccurrence): string {
    const ta = new Date(o.starts_at);
    const tb = new Date(o.ends_at);
    const opts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit", timeZone };
    return `${ta.toLocaleTimeString(undefined, opts)} → ${tb.toLocaleTimeString(undefined, opts)}`;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          aria-label="Previous month"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#ebe7f7] text-[#475569] transition hover:bg-[#f8fafc] hover:text-[#0f172a]"
          onClick={() => shiftMonth(-1)}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <p className="flex-1 text-center text-[15px] font-semibold text-[#0f172a]">{monthTitle}</p>
        <button
          type="button"
          aria-label="Next month"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#ebe7f7] text-[#475569] transition hover:bg-[#f8fafc] hover:text-[#0f172a]"
          onClick={() => shiftMonth(1)}
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">
        {WEEK_HEAD_LABELS.map((d, i) => (
          <div key={`hdr-${i}`} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: totalCells }).map((_, idx) => {
          const domNum = idx - leadingBlanks + 1;
          if (idx < leadingBlanks || domNum > lastDom || domNum < 1) {
            return (
              <div key={`e-${cursor.year}-${cursor.month}-${idx}`} className="aspect-square rounded-lg bg-[#fafafa]/70" aria-hidden />
            );
          }

          const list = occByCalendarDay.get(domNum);
          const hasShow = Boolean(list?.length);
          const bookableList = list?.filter((o) => !o.skipped) ?? [];
          const cancelledList = list?.filter((o) => o.skipped) ?? [];
          const isCancelledOnly = hasShow && bookableList.length === 0;

          const primaryOcc = bookableList[0] ?? cancelledList[0];
          const label = domNum.toString();

          const isSelected = Boolean(
            primaryOcc &&
              !primaryOcc.skipped &&
              selected &&
              (sameSel(selected, primaryOcc) || (bookableList.some((x) => sameSel(selected, x)) ?? false)),
          );
          const isPendingPick = Boolean(
            pendingSameDayChoices?.length && primaryOcc && pendingSameDayChoices[0]?.dateYmd === primaryOcc.dateYmd,
          );

          const cancelReason = cancelledList.find((o) => o.cancellation_reason?.trim())?.cancellation_reason?.trim();

          return (
            <button
              key={`${cursor.year}-${cursor.month}-${domNum}`}
              type="button"
              disabled={!hasShow || !bookableList.length || !primaryOcc || primaryOcc.skipped}
              aria-pressed={isSelected || isPendingPick || undefined}
              title={
                !hasShow
                  ? `${label} — no show this day`
                  : isCancelledOnly
                    ? `${label} — cancelled${cancelReason ? `: ${cancelReason}` : ""}`
                    : bookableList.length > 1
                      ? `${label} — ${bookableList.length} performances · tap to pick a start time`
                      : `${label} · ${primaryOcc ? formatSlotTitle(primaryOcc) : ""} (${timeZone})`
              }
              onClick={() => {
                if (!bookableList.length) return;
                if (bookableList.length === 1) {
                  onSelect(bookableList[0]);
                  setPendingSameDayChoices(null);
                  return;
                }
                setPendingSameDayChoices([...bookableList].sort((a, b) => a.starts_at.localeCompare(b.starts_at)));
              }}
              className={cn(
                "aspect-square rounded-lg border text-[13px] font-semibold transition",
                !hasShow
                  ? "cursor-not-allowed border-transparent bg-[#f1f5f9] text-[#cbd5e1]"
                  : isCancelledOnly
                    ? "cursor-not-allowed border-rose-200 bg-rose-50 text-rose-800 line-through decoration-rose-900/70"
                    : isSelected || isPendingPick
                      ? "border-[#7c3aed] bg-gradient-to-br from-[#ddd6fe] via-[#ede9fe] to-[#f5f3ff] text-[#4c1d95] shadow-inner shadow-[#7c3aed]/35 ring-2 ring-[#a78bfa]"
                      : "border-[#c4b5fd] bg-gradient-to-br from-[#ede9fe] to-[#f5f3ff] text-[#5b21b6] shadow-[0_1px_0_rgba(124,58,237,0.12)] hover:border-[#7c3aed] hover:bg-[#ddd6fe]/90 hover:shadow-md",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
      {pendingSameDayChoices?.length ? (
        <fieldset className="space-y-2 rounded-xl border border-[#ebe7f7] bg-[#fafbff] p-4">
          <legend className="text-[13px] font-semibold text-[#0f172a]">Which showing?</legend>
          <p className="text-[11px] leading-relaxed text-[#64748b]">
            There are two or more performances on this date — choose the start time you want.
          </p>
          <div className="flex flex-col gap-2">
            {pendingSameDayChoices.map((opt) => {
              const same = selected && sameSel(selected, opt);
              return (
                <button
                  key={`${opt.dateYmd}-${opt.starts_at}`}
                  type="button"
                  onClick={() => {
                    onSelect(opt);
                    setPendingSameDayChoices(null);
                  }}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left text-[13px] font-semibold transition",
                    same
                      ? "border-[#a78bfa] bg-[#f5f3ff] text-[#5b21b6]"
                      : "border-[#ebe7f7] bg-white text-[#475569] hover:border-[#c4b5fd]",
                  )}
                >
                  <span>{formatSlotTitle(opt)}</span>
                  <span className="mt-1 block text-[11px] font-normal text-[#94a3b8]">{timeZone}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}
      {cancelledInMonth.length > 0 ? (
        <ul className="space-y-2 rounded-xl border border-rose-100 bg-rose-50/80 px-4 py-3 text-[12px] leading-relaxed text-rose-950">
          {cancelledInMonth.map((o) => (
            <li key={`${o.dateYmd}-${o.starts_at}`}>
              <span className="font-semibold">
                {new Date(`${o.dateYmd}T12:00:00`).toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  timeZone,
                })}
              </span>
              {" — "}
              Cancelled
              {o.cancellation_reason?.trim() ? `: ${o.cancellation_reason.trim()}` : " (no reason provided)"}
            </li>
          ))}
        </ul>
      ) : null}
      {selected ? (
        <p className="text-[13px] leading-relaxed text-[#64748b]">
          Showing on{" "}
          <span className="font-semibold text-[#0f172a]">
            {new Date(`${selected.dateYmd}T12:00:00`).toLocaleDateString(undefined, {
              weekday: "long",
              month: "short",
              day: "numeric",
              timeZone,
            })}
          </span>
          · {formatSlotTitle(selected)}
          <span className="text-[#94a3b8]"> ({timeZone})</span>
        </p>
      ) : null}
      <p className="text-[11px] leading-relaxed text-[#94a3b8]">
        Grey days do not run this listing —{" "}
        <span className="font-semibold text-[#5b21b6]">purple dates</span> are bookable show nights.{" "}
        <span className="font-semibold text-rose-700">Struck-through rose dates</span> were cancelled by the venue.
      </p>
    </div>
  );
}
