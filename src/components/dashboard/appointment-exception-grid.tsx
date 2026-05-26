"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarOff, ChevronLeft, ChevronRight, Loader2, RotateCcw } from "lucide-react";

import { batchSetAppointmentClosedDays } from "@/app/dashboard/bookings/inventory-actions";
import type { AppointmentWeekRow, SlotExceptionRow } from "@/lib/booking-inventory-types";
import { appointmentExceptionKindOptionLabel } from "@/lib/booking-inventory-types";
import { addDaysYmdInVenueZone, calendarYmdInZone, dowSundayZeroInBusinessTZ } from "@/lib/booking-appointment-slots";
import { dowOfMonthFirst, formatCalendarDayLabel, monthMeta } from "@/lib/bookings-calendar-aggregate";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

type RepeatMode = "once" | "weekly" | "monthly";

function closedDatesFromExceptions(exceptions: SlotExceptionRow[]): Set<string> {
  const out = new Set<string>();
  for (const row of exceptions) {
    const d = row.exception_date.trim();
    if (!d) continue;
    out.add(d);
  }
  return out;
}

function hasWeeklyHours(schedules: AppointmentWeekRow[], dateYmd: string, tz: string): boolean {
  const dow = dowSundayZeroInBusinessTZ(dateYmd, tz);
  return schedules.some((s) => s.weekday === dow);
}

function addMonthsYmd(dateYmd: string, months: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateYmd.trim());
  if (!m) return dateYmd;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const next = new Date(y, mo - 1 + months, d);
  const yy = next.getFullYear();
  const mm = String(next.getMonth() + 1).padStart(2, "0");
  const dd = String(next.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function expandClosedDates(anchorYmd: string, repeat: RepeatMode, tz: string): string[] {
  if (repeat === "once") return [anchorYmd];
  if (repeat === "weekly") {
    return Array.from({ length: 12 }, (_, i) => addDaysYmdInVenueZone(anchorYmd, i * 7, tz));
  }
  return Array.from({ length: 6 }, (_, i) => addMonthsYmd(anchorYmd, i));
}

type AppointmentExceptionGridProps = {
  businessId: string;
  schedules: AppointmentWeekRow[];
  exceptions: SlotExceptionRow[];
  venueTimeZone: string;
};

export function AppointmentExceptionGrid({ businessId, schedules, exceptions, venueTimeZone }: AppointmentExceptionGridProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const tz = venueTimeZone.trim() || "UTC";

  const todayYmd = useMemo(() => calendarYmdInZone(Date.now(), tz), [tz]);
  const initialParts = todayYmd.split("-").map((x) => Number(x));
  const [ym, setYm] = useState(() => ({ year: initialParts[0]!, month: initialParts[1]! }));
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [repeat, setRepeat] = useState<RepeatMode>("once");
  const [exKind, setExKind] = useState<"removed" | "cancelled">("removed");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const closedDates = useMemo(() => closedDatesFromExceptions(exceptions), [exceptions]);

  const calendarCells = useMemo(() => {
    const leading = dowOfMonthFirst(ym.year, ym.month, tz);
    const { lastDay } = monthMeta(ym.year, ym.month);
    const cells: { day: number | null; dateYmd?: string }[] = [];
    for (let i = 0; i < leading; i++) cells.push({ day: null });
    for (let d = 1; d <= lastDay; d++) {
      cells.push({
        day: d,
        dateYmd: `${ym.year}-${String(ym.month).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
      });
    }
    while (cells.length % 7 !== 0) cells.push({ day: null });
    return cells;
  }, [ym.year, ym.month, tz]);

  const monthClosedCount = useMemo(() => {
    let n = 0;
    for (const cell of calendarCells) {
      if (cell.dateYmd && closedDates.has(cell.dateYmd)) n += 1;
    }
    return n;
  }, [calendarCells, closedDates]);

  const selectedList = useMemo(() => [...selected].sort(), [selected]);
  const selectedClosedCount = selectedList.filter((d) => closedDates.has(d)).length;
  const selectedOpenCount = selectedList.length - selectedClosedCount;
  const primaryDate = selectedList[0] ?? null;

  function toggleSelect(dateYmd: string, additive: boolean) {
    setSelected((prev) => {
      const next = additive ? new Set(prev) : new Set<string>();
      if (next.has(dateYmd)) next.delete(dateYmd);
      else next.add(dateYmd);
      return next;
    });
  }

  function runBatch(dates: string[], closed: boolean) {
    if (!dates.length) return;
    setError(null);
    startTransition(() => {
      void (async () => {
        try {
          const expanded = closed
            ? [...new Set(dates.flatMap((d) => expandClosedDates(d, repeat, tz)))]
            : dates;
          await batchSetAppointmentClosedDays({
            businessId,
            dates: expanded,
            closed,
            kind: exKind,
            reason: reason.trim() || null,
          });
          setSelected(new Set());
          router.refresh();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not save.");
        }
      })();
    });
  }

  const upcomingClosed = useMemo(() => {
    return [...closedDates]
      .filter((d) => d >= todayYmd)
      .sort()
      .slice(0, 8);
  }, [closedDates, todayYmd]);

  return (
    <section className="overflow-hidden rounded-[28px] border border-[#ebe7f7] bg-gradient-to-b from-[#faf7ff] to-white shadow-sm">
      <header className="border-b border-[#f1eefc] px-5 py-5 md:px-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#94a3b8]">Time off</p>
            <h3 className="mt-1 flex items-center gap-2 text-xl font-semibold text-[#0f172a]">
              <CalendarOff className="h-5 w-5 text-[#7c3aed]" aria-hidden />
              Days you&apos;re closed
            </h3>
            <p className="mt-1 max-w-xl text-sm text-[#64748b]">
              Tap dates on the calendar, then mark them closed. Guests won&apos;t see appointment slots on those days. Times follow{" "}
              <span className="font-semibold text-[#475569]">{tz}</span>.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full border-[#ebe7f7]"
              onClick={() =>
                setYm((prev) => {
                  let y = prev.year;
                  let m = prev.month - 1;
                  if (m < 1) {
                    y -= 1;
                    m = 12;
                  }
                  return { year: y, month: m };
                })
              }
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </Button>
            <span className="min-w-[10rem] text-center text-[15px] font-semibold text-[#0f172a]">
              {new Date(ym.year, ym.month - 1, 1).toLocaleString(undefined, { month: "long", year: "numeric" })}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full border-[#ebe7f7]"
              onClick={() =>
                setYm((prev) => {
                  let y = prev.year;
                  let m = prev.month + 1;
                  if (m > 12) {
                    y += 1;
                    m = 1;
                  }
                  return { year: y, month: m };
                })
              }
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </div>
      </header>

      <div className="grid gap-6 px-5 py-5 md:grid-cols-[1fr_minmax(260px,320px)] md:px-8 md:py-6">
        <div>
          {error ? (
            <p className="mb-4 rounded-xl border border-rose-100 bg-rose-50 px-4 py-2 text-sm text-rose-900">{error}</p>
          ) : null}

          <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-[#64748b]">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-md border border-rose-200 bg-rose-100" aria-hidden />
              Closed day
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-md border border-[#c4b5fd] bg-[#ede9fe] ring-2 ring-[#7c3aed] ring-offset-1" aria-hidden />
              Selected
            </span>
            <span>
              This month: <span className="font-semibold text-rose-700">{monthClosedCount}</span> closed
            </span>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-[#94a3b8] md:gap-1.5">
            {WEEKDAY_SHORT.map((d) => (
              <span key={d} className="py-1">
                {d}
              </span>
            ))}
          </div>

          <div className="mt-1 grid grid-cols-7 gap-1 md:gap-1.5">
            {calendarCells.map((cell, idx) => {
              if (!cell.day || !cell.dateYmd) {
                return <div key={`pad-${idx}`} className="aspect-square min-h-[2.75rem]" />;
              }

              const dateYmd = cell.dateYmd;
              const isClosed = closedDates.has(dateYmd);
              const isSelected = selected.has(dateYmd);
              const isToday = dateYmd === todayYmd;
              const hasHours = hasWeeklyHours(schedules, dateYmd, tz);
              const isPast = dateYmd < todayYmd;

              return (
                <button
                  key={dateYmd}
                  type="button"
                  onClick={(e) => toggleSelect(dateYmd, e.metaKey || e.ctrlKey || e.shiftKey)}
                  aria-pressed={isSelected}
                  aria-label={`${cell.day}${isClosed ? ", closed" : ", open"}${isSelected ? ", selected" : ""}`}
                  className={cn(
                    "relative flex aspect-square min-h-[2.75rem] flex-col items-center justify-center rounded-xl border text-sm font-semibold transition-all",
                    isClosed && !isSelected && "border-rose-200 bg-rose-50 text-rose-900 hover:bg-rose-100",
                    !isClosed && !isSelected && "border-[#ebe7f7] bg-white text-[#0f172a] hover:border-[#c4b5fd] hover:bg-[#faf7ff]",
                    isSelected && "border-[#7c3aed] bg-[#ede9fe] text-[#5b21b6] shadow-sm ring-2 ring-[#7c3aed] ring-offset-1",
                    isPast && !isClosed && "text-[#94a3b8]",
                    !hasHours && !isClosed && "border-dashed opacity-80",
                  )}
                >
                  <span>{cell.day}</span>
                  {isClosed ? (
                    <span className="absolute bottom-1 h-1 w-1 rounded-full bg-rose-500" aria-hidden />
                  ) : isToday ? (
                    <span className="absolute bottom-1 h-1 w-1 rounded-full bg-[#7c3aed]" aria-hidden />
                  ) : null}
                </button>
              );
            })}
          </div>

          <p className="mt-3 text-xs text-[#94a3b8]">
            Tip: hold <kbd className="rounded bg-[#f1f5f9] px-1">⌘</kbd> or <kbd className="rounded bg-[#f1f5f9] px-1">Shift</kbd> to select multiple days.
          </p>
        </div>

        <aside className="flex flex-col gap-4 rounded-2xl border border-[#ede9fe] bg-white/90 p-4 shadow-sm">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#94a3b8]">Selection</p>
            {primaryDate ? (
              <p className="mt-1 text-base font-semibold text-[#0f172a]">
                {selectedList.length === 1
                  ? formatCalendarDayLabel(primaryDate, tz)
                  : `${selectedList.length} days selected`}
              </p>
            ) : (
              <p className="mt-1 text-sm text-[#64748b]">Pick one or more dates on the calendar.</p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">Repeat when closing</label>
            <select
              value={repeat}
              onChange={(e) => setRepeat(e.target.value as RepeatMode)}
              className="h-10 w-full rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-3 text-sm"
            >
              <option value="once">Just selected day(s)</option>
              <option value="weekly">Every week (12 weeks)</option>
              <option value="monthly">Same date each month (6 months)</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">Shown to guests as</label>
            <select
              value={exKind}
              onChange={(e) => setExKind(e.target.value as "removed" | "cancelled")}
              className="h-10 w-full rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-3 text-sm"
            >
              <option value="removed">{appointmentExceptionKindOptionLabel("removed")}</option>
              <option value="cancelled">{appointmentExceptionKindOptionLabel("cancelled")}</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">Reason (optional)</label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Holiday · staff training…"
              className="h-10 w-full rounded-xl border border-[#ebe7f7] px-3 text-sm"
            />
          </div>

          <div className="mt-auto flex flex-col gap-2">
            <Button
              type="button"
              className="h-11 rounded-full font-semibold shadow-md shadow-[#7c3aed]/20"
              disabled={pending || selectedOpenCount === 0}
              onClick={() => runBatch(selectedList.filter((d) => !closedDates.has(d)), true)}
            >
              {pending ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden /> : null}
              Close {selectedOpenCount || ""} day{selectedOpenCount === 1 ? "" : "s"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-full border-rose-200 font-semibold text-rose-800"
              disabled={pending || selectedClosedCount === 0}
              onClick={() => runBatch(selectedList.filter((d) => closedDates.has(d)), false)}
            >
              <RotateCcw className="mr-2 inline h-4 w-4" aria-hidden />
              Reopen {selectedClosedCount || ""} day{selectedClosedCount === 1 ? "" : "s"}
            </Button>
            {selected.size > 0 ? (
              <button
                type="button"
                className="text-xs font-semibold text-[#64748b] underline-offset-2 hover:text-[#475569] hover:underline"
                onClick={() => setSelected(new Set())}
              >
                Clear selection
              </button>
            ) : null}
          </div>
        </aside>
      </div>

      {upcomingClosed.length > 0 ? (
        <footer className="border-t border-[#f1eefc] bg-[#fafbff]/80 px-5 py-4 md:px-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#94a3b8]">Upcoming closed days</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {upcomingClosed.map((d) => (
              <li key={d}>
                <button
                  type="button"
                  onClick={() => setSelected(new Set([d]))}
                  className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-900 hover:bg-rose-100"
                >
                  {formatCalendarDayLabel(d, tz)}
                </button>
              </li>
            ))}
          </ul>
        </footer>
      ) : null}
    </section>
  );
}
