"use client";

import { useState, useTransition, useMemo } from "react";
import { Plus, Trash2, Clock, Coffee, UtensilsCrossed } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { upsertAppointmentBreak, deleteAppointmentBreak } from "@/app/dashboard/bookings/inventory-actions";
import { cn } from "@/lib/utils";

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export type WeekGridScheduleRow = {
  id: string;
  weekday: number;
  open_time: string;
  close_time: string;
  slot_minutes: number;
};

export type AppointmentBreakRow = {
  id: string;
  weekdays: number[];
  start_time: string;
  end_time: string;
  label: string;
};

function clockToMins(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function minsToLabel(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  const ampm = h < 12 ? "am" : "pm";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return min === 0 ? `${h12}${ampm}` : `${h12}:${String(min).padStart(2, "0")}${ampm}`;
}

function minsTo24(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

const QUICK_BREAKS = [
  { label: "Lunch break", start: "12:00", end: "13:00", icon: UtensilsCrossed, weekdays: [1,2,3,4,5] },
  { label: "Dinner prep",  start: "17:00", end: "18:00", icon: UtensilsCrossed, weekdays: [1,2,3,4,5,6] },
  { label: "Morning break", start: "10:30", end: "11:00", icon: Coffee,          weekdays: [1,2,3,4,5] },
  { label: "Afternoon break", start: "15:00", end: "15:30", icon: Coffee,        weekdays: [1,2,3,4,5] },
] as const;

export function AppointmentWeekGrid({
  businessId,
  schedules,
  breaks: initialBreaks,
}: {
  businessId: string;
  schedules: WeekGridScheduleRow[];
  breaks: AppointmentBreakRow[];
}) {
  const [breaks, setBreaks] = useState<AppointmentBreakRow[]>(initialBreaks);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Custom break form state
  const [showForm, setShowForm] = useState(false);
  const [breakLabel, setBreakLabel] = useState("Break");
  const [breakStart, setBreakStart] = useState("12:00");
  const [breakEnd, setBreakEnd] = useState("13:00");
  const [breakDays, setBreakDays] = useState<number[]>([1, 2, 3, 4, 5]);

  function run(fn: () => Promise<void>) {
    setError(null);
    startTransition(() => {
      void (async () => {
        try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Could not save."); }
      })();
    });
  }

  function addBreak(label: string, start: string, end: string, weekdays: number[]) {
    run(async () => {
      await upsertAppointmentBreak({ businessId, weekdays, startTime: start, endTime: end, label });
      // Optimistic update — page will revalidate
      const tmp = { id: crypto.randomUUID(), weekdays, start_time: start, end_time: end, label };
      setBreaks((prev) => [...prev, tmp]);
    });
  }

  function removeBreak(id: string) {
    run(async () => {
      await deleteAppointmentBreak(businessId, id);
      setBreaks((prev) => prev.filter((b) => b.id !== id));
    });
  }

  // ── Grid generation ──────────────────────────────────────────────────────────
  const STEP = 30; // 30-min grid rows regardless of slot_minutes

  const { rows, columns } = useMemo(() => {
    if (!schedules.length) return { rows: [], columns: [] as Array<{ open: number; close: number } | null> };

    // Overall time range
    const rawMin = Math.min(...schedules.map((s) => clockToMins(s.open_time)));
    const rawMax = Math.max(...schedules.map((s) => clockToMins(s.close_time)));
    // Round to nearest 30
    const minM = Math.floor(rawMin / STEP) * STEP;
    const maxM = Math.ceil(rawMax / STEP) * STEP;

    const rowTimes: number[] = [];
    for (let m = minM; m < maxM; m += STEP) rowTimes.push(m);

    // Per-weekday open/close mins (null = closed)
    const cols = WEEKDAY_SHORT.map((_, wd) => {
      const s = schedules.find((r) => r.weekday === wd);
      return s ? { open: clockToMins(s.open_time), close: clockToMins(s.close_time) } : null;
    });

    return { rows: rowTimes, columns: cols };
  }, [schedules]);

  // For each (row, col): determine cell state
  function cellState(rowMins: number, wd: number): "closed" | "open" | "break" {
    const col = columns[wd];
    if (!col) return "closed";
    if (rowMins < col.open || rowMins >= col.close) return "closed";
    // Check if any break covers this slot
    for (const b of breaks) {
      if (!b.weekdays.includes(wd)) continue;
      const bStart = clockToMins(b.start_time);
      const bEnd   = clockToMins(b.end_time);
      if (rowMins >= bStart && rowMins < bEnd) return "break";
    }
    return "open";
  }

  const hasSchedule = schedules.length > 0;

  // Only show weekday columns that have data or any schedule
  const visibleDays = hasSchedule
    ? WEEKDAY_SHORT.map((_, i) => i).filter((wd) => columns[wd] !== null)
    : [1, 2, 3, 4, 5]; // Mon-Fri default when nothing saved

  return (
    <div className="space-y-6">
      {/* ── Visual grid ──────────────────────────────────────────────────────── */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-[#0f172a]">Weekly schedule</h3>
            <p className="mt-0.5 text-[13px] text-[#64748b]">
              <span className="inline-block h-3 w-3 rounded-sm bg-[#7c3aed] align-middle" /> bookable&nbsp;&nbsp;
              <span className="inline-block h-3 w-3 rounded-sm bg-amber-400 align-middle" /> break&nbsp;&nbsp;
              <span className="inline-block h-3 w-3 rounded-sm bg-[#f1f5f9] border border-[#e2e8f0] align-middle" /> closed
            </p>
          </div>
        </div>

        {!hasSchedule ? (
          <p className="rounded-2xl border border-dashed border-[#ebe7f7] bg-[#fafbff] px-4 py-6 text-center text-sm text-[#94a3b8]">
            Add weekday hours above to see the visual schedule grid.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-[#f1eefc] bg-white shadow-sm">
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr>
                  <th className="w-14 border-b border-r border-[#f1f5f9] bg-[#fafbff] px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-widest text-[#94a3b8]" />
                  {visibleDays.map((wd) => (
                    <th key={wd} className="border-b border-r border-[#f1f5f9] bg-[#fafbff] px-3 py-2 text-center font-semibold text-[#0f172a]">
                      {WEEKDAY_SHORT[wd]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((rowMins, ri) => (
                  <tr key={rowMins}>
                    {/* Time label — only show on even rows (hourly) */}
                    <td className="border-b border-r border-[#f1f5f9] bg-[#fafbff] px-2 text-right font-mono text-[10px] text-[#94a3b8]">
                      {rowMins % 60 === 0 ? minsToLabel(rowMins) : ""}
                    </td>
                    {visibleDays.map((wd) => {
                      const state = cellState(rowMins, wd);
                      return (
                        <td
                          key={wd}
                          title={state === "break" ? "Break" : state === "open" ? `${minsTo24(rowMins)}` : "Closed"}
                          className={cn(
                            "h-5 border-b border-r border-[#f1f5f9] transition-colors",
                            state === "open"   && "bg-[#7c3aed]/20",
                            state === "break"  && "bg-amber-400/60",
                            state === "closed" && "bg-[#f8fafc]",
                            // Slightly darker line at each full hour
                            ri > 0 && rowMins % 60 === 0 && "border-t border-t-[#e2e8f0]",
                          )}
                        />
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Breaks panel ─────────────────────────────────────────────────────── */}
      <div className="space-y-4 rounded-2xl border border-[#ede9fe] bg-[#fafbff]/90 p-5">
        <header>
          <h3 className="flex items-center gap-2 text-base font-semibold text-[#0f172a]">
            <Clock className="h-4 w-4 text-[#7c3aed]" aria-hidden />
            Break windows
          </h3>
          <p className="mt-1 text-sm text-[#64748b]">
            Recurring blocks hidden from your booking page every week — lunch, dinner prep, staff meetings.
          </p>
        </header>

        {error ? (
          <p className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-2 text-sm text-rose-900">{error}</p>
        ) : null}

        {/* Quick-add buttons */}
        <div className="flex flex-wrap gap-2">
          {QUICK_BREAKS.map((qb) => {
            const Icon = qb.icon;
            const already = breaks.some(
              (b) => b.label === qb.label && b.start_time.startsWith(qb.start) && b.end_time.startsWith(qb.end),
            );
            return (
              <button
                key={qb.label}
                type="button"
                disabled={pending || already}
                onClick={() => addBreak(qb.label, qb.start, qb.end, [...qb.weekdays])}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors",
                  already
                    ? "border-amber-200 bg-amber-50 text-amber-700 opacity-60 cursor-not-allowed"
                    : "border-[#ebe7f7] bg-white text-[#0f172a] hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800",
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {qb.label}
                <span className="text-[11px] font-normal text-[#94a3b8]">{qb.start}–{qb.end}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors",
              "border-[#ebe7f7] bg-white text-[#7c3aed] hover:bg-[#f5f3ff]",
            )}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Custom break
          </button>
        </div>

        {/* Custom break form */}
        {showForm && (
          <div className="grid gap-3 rounded-2xl border border-[#ede9fe] bg-white p-4 md:grid-cols-2">
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">Label</label>
              <input
                type="text"
                value={breakLabel}
                onChange={(e) => setBreakLabel(e.target.value)}
                placeholder="e.g. Lunch break"
                maxLength={60}
                className="h-10 w-full rounded-xl border border-[#ebe7f7] px-3 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">From</label>
              <input type="time" value={breakStart} onChange={(e) => setBreakStart(e.target.value)} className="h-10 w-full rounded-xl border border-[#ebe7f7] px-3 text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">Until</label>
              <input type="time" value={breakEnd} onChange={(e) => setBreakEnd(e.target.value)} className="h-10 w-full rounded-xl border border-[#ebe7f7] px-3 text-sm" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">Days</label>
              <div className="flex flex-wrap gap-2">
                {WEEKDAY_SHORT.map((label, wd) => (
                  <button
                    key={wd}
                    type="button"
                    onClick={() =>
                      setBreakDays((prev) =>
                        prev.includes(wd) ? prev.filter((d) => d !== wd) : [...prev, wd],
                      )
                    }
                    className={cn(
                      "h-9 w-12 rounded-xl border text-[13px] font-semibold transition-colors",
                      breakDays.includes(wd)
                        ? "border-[#7c3aed] bg-[#7c3aed] text-white"
                        : "border-[#ebe7f7] bg-white text-[#64748b] hover:border-[#c4b5fd]",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 md:col-span-2">
              <Button
                type="button"
                disabled={pending || breakDays.length === 0}
                className="h-10 rounded-full font-semibold"
                onClick={() => {
                  addBreak(breakLabel, breakStart, breakEnd, breakDays);
                  setShowForm(false);
                  setBreakLabel("Break");
                  setBreakStart("12:00");
                  setBreakEnd("13:00");
                  setBreakDays([1, 2, 3, 4, 5]);
                }}
              >
                Save break
              </Button>
              <button type="button" onClick={() => setShowForm(false)} className={cn(buttonVariants({ variant: "ghost" }), "h-10 rounded-full")}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Break list */}
        {breaks.length > 0 ? (
          <ul className="space-y-2">
            {breaks.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#f1eefc] bg-white px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <span className="h-3 w-3 shrink-0 rounded-full bg-amber-400" aria-hidden />
                  <div>
                    <p className="text-sm font-semibold text-[#0f172a]">{b.label}</p>
                    <p className="text-[12px] text-[#64748b]">
                      {b.start_time.slice(0, 5)}–{b.end_time.slice(0, 5)}
                      {" · "}
                      {b.weekdays
                        .sort((a, c) => a - c)
                        .map((d) => WEEKDAY_SHORT[d])
                        .join(", ")}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => removeBreak(b.id)}
                  className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-rose-700")}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[#94a3b8]">No recurring breaks yet — tap a quick-add above.</p>
        )}
      </div>
    </div>
  );
}
