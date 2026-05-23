"use client";

import { useState, useMemo, useTransition } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { assignBookingToStaff } from "@/app/dashboard/bookings/calendar-actions";
import type { VenueCalendarBookingRow } from "@/components/dashboard/booking-operations-hub";
import type { StaffMember } from "@/lib/staff-members";
import type { AppointmentWeekRow } from "@/lib/booking-inventory-types";
import type { AppointmentBreakRow } from "@/components/dashboard/appointment-week-grid";
import { cn } from "@/lib/utils";

const ROW_H = 44;
const GUTTER_W = 52;

const STAFF_PALETTE = [
  { dot: "bg-violet-500", card: "bg-violet-50 border-violet-200", text: "text-violet-800" },
  { dot: "bg-blue-500",   card: "bg-blue-50 border-blue-200",     text: "text-blue-800"   },
  { dot: "bg-emerald-500",card: "bg-emerald-50 border-emerald-200",text: "text-emerald-800"},
  { dot: "bg-amber-500",  card: "bg-amber-50 border-amber-200",   text: "text-amber-800"  },
  { dot: "bg-rose-500",   card: "bg-rose-50 border-rose-200",     text: "text-rose-800"   },
  { dot: "bg-sky-500",    card: "bg-sky-50 border-sky-200",       text: "text-sky-800"    },
  { dot: "bg-indigo-500", card: "bg-indigo-50 border-indigo-200", text: "text-indigo-800" },
  { dot: "bg-orange-500", card: "bg-orange-50 border-orange-200", text: "text-orange-800" },
];
const UNASSIGNED = { dot: "bg-slate-300", card: "bg-slate-50 border-slate-200", text: "text-slate-600" };

const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

function clockToMins(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function minsToLabel(m: number): string {
  const h = Math.floor(m / 60) % 24;
  const min = m % 60;
  const ampm = h < 12 ? "am" : "pm";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return min === 0 ? `${h12}${ampm}` : `${h12}:${String(min).padStart(2, "0")}${ampm}`;
}

function dateToYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isoToVenueDateYmd(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(iso));
}

function isoToVenueMins(iso: string, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(iso));
  const h = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10) % 24;
  const m = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
  return h * 60 + m;
}

function weekDatesFromAnchor(anchor: Date): Date[] {
  const day = anchor.getDay();
  const daysFromMon = day === 0 ? 6 : day - 1;
  const mon = new Date(anchor);
  mon.setDate(anchor.getDate() - daysFromMon);
  mon.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return d;
  });
}

function weekLabel(dates: Date[]): string {
  const first = dates[0]!;
  const last = dates[6]!;
  const mo2 = new Intl.DateTimeFormat("en-GB", { month: "short" }).format(last);
  const yr = last.getFullYear();
  const mo1 = new Intl.DateTimeFormat("en-GB", { month: "short" }).format(first);
  const d1 = first.getDate();
  const d2 = last.getDate();
  return mo1 === mo2 ? `${d1}–${d2} ${mo2} ${yr}` : `${d1} ${mo1} – ${d2} ${mo2} ${yr}`;
}

export function StaffWeekPlanner({
  bookings,
  staffMembers,
  schedules,
  breaks,
  venueTimeZone,
}: {
  bookings: VenueCalendarBookingRow[];
  staffMembers: StaffMember[];
  schedules: AppointmentWeekRow[];
  breaks: AppointmentBreakRow[];
  venueTimeZone: string;
}) {
  const [anchor, setAnchor] = useState(() => new Date());
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);

  const weekDates = useMemo(() => weekDatesFromAnchor(anchor), [anchor]);
  const weekYmds  = useMemo(() => weekDates.map(dateToYmd), [weekDates]);
  const todayYmd  = dateToYmd(new Date());

  // Build time row range from schedule hours (fallback 9am–8pm)
  const { openMins, timeRows } = useMemo(() => {
    const opens  = schedules.map((s) => clockToMins(s.open_time));
    const closes = schedules.map((s) => clockToMins(s.close_time));
    const open  = opens.length  ? Math.min(...opens)  : 9 * 60;
    const close = closes.length ? Math.max(...closes) : 20 * 60;
    const rows: number[] = [];
    for (let m = open; m < close; m += 30) rows.push(m);
    return { openMins: open, timeRows: rows };
  }, [schedules]);

  // Map DOW (0=Sun) → schedule row exists
  const scheduledDows = useMemo(() => new Set(schedules.map((s) => s.weekday)), [schedules]);

  // Confirmed bookings grouped by venue-local date
  const byDate = useMemo(() => {
    const map = new Map<string, VenueCalendarBookingRow[]>();
    for (const b of bookings) {
      if (b.status === "cancelled") continue;
      const ymd = isoToVenueDateYmd(b.starts_at, venueTimeZone);
      if (!weekYmds.includes(ymd)) continue;
      const arr = map.get(ymd) ?? [];
      arr.push(b);
      map.set(ymd, arr);
    }
    return map;
  }, [bookings, weekYmds, venueTimeZone]);

  function staffColor(name: string | null | undefined) {
    if (!name) return UNASSIGNED;
    const idx = staffMembers.findIndex((s) => s.name === name);
    return idx >= 0 ? (STAFF_PALETTE[idx % STAFF_PALETTE.length] ?? UNASSIGNED) : UNASSIGNED;
  }

  function doAssign(bookingId: string, staffMember: string) {
    setAssigningId(null);
    setError(null);
    startTransition(() => {
      void (async () => {
        try {
          await assignBookingToStaff(bookingId, staffMember);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not assign.");
        }
      })();
    });
  }

  const totalH = timeRows.length * ROW_H;

  return (
    <div className="space-y-4">
      {/* ── Navigation ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setAnchor((d) => { const n = new Date(d); n.setDate(d.getDate() - 7); return n; })}
            className="rounded-xl border border-[#ebe7f7] bg-white p-2 transition-colors hover:border-[#c4b5fd]"
          >
            <ChevronLeft className="h-4 w-4 text-[#64748b]" aria-hidden />
          </button>
          <span className="min-w-[186px] text-center text-[15px] font-semibold text-[#0f172a]">
            {weekLabel(weekDates)}
          </span>
          <button
            type="button"
            onClick={() => setAnchor((d) => { const n = new Date(d); n.setDate(d.getDate() + 7); return n; })}
            className="rounded-xl border border-[#ebe7f7] bg-white p-2 transition-colors hover:border-[#c4b5fd]"
          >
            <ChevronRight className="h-4 w-4 text-[#64748b]" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setAnchor(new Date())}
            className="rounded-xl border border-[#ebe7f7] bg-white px-3 py-2 text-[13px] font-semibold text-[#7c3aed] transition-colors hover:bg-[#f5f3ff]"
          >
            Today
          </button>
        </div>

        {/* Staff legend */}
        {staffMembers.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {staffMembers.map((s, i) => {
              const col = STAFF_PALETTE[i % STAFF_PALETTE.length] ?? UNASSIGNED;
              return (
                <span key={s.id} className="flex items-center gap-1.5 rounded-full border border-[#ebe7f7] bg-white px-2.5 py-1 text-[12px] font-semibold text-[#0f172a]">
                  <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", col.dot)} />
                  {s.name}
                </span>
              );
            })}
            <span className="flex items-center gap-1.5 rounded-full border border-[#ebe7f7] bg-white px-2.5 py-1 text-[12px] text-[#94a3b8]">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-slate-300" />
              Unassigned
            </span>
          </div>
        )}
      </div>

      {error && (
        <p className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-2 text-sm text-rose-900">{error}</p>
      )}

      {/* ── Grid ───────────────────────────────────────────────────── */}
      <div className="overflow-x-auto rounded-2xl border border-[#f1eefc] bg-white shadow-sm">
        <div style={{ minWidth: GUTTER_W + weekDates.length * 130 }}>

          {/* Day header */}
          <div className="flex border-b border-[#f1eefc] bg-[#fafbff]">
            <div style={{ width: GUTTER_W, minWidth: GUTTER_W }} className="shrink-0 border-r border-[#f1eefc]" />
            {weekDates.map((d, i) => {
              const ymd = weekYmds[i]!;
              const isToday = ymd === todayYmd;
              const jsDay = d.getDay(); // 0=Sun
              const open = scheduledDows.has(jsDay);
              const bookingCount = (byDate.get(ymd) ?? []).length;
              return (
                <div key={ymd} className="flex-1 border-r border-[#f1eefc] px-2 py-2 text-center last:border-r-0">
                  <div className={cn("text-[10px] font-semibold uppercase tracking-widest", isToday ? "text-[#7c3aed]" : "text-[#94a3b8]")}>
                    {DAY_SHORT[i]}
                  </div>
                  <div className={cn(
                    "mx-auto mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-[13px] font-bold",
                    isToday ? "bg-[#7c3aed] text-white" : open ? "text-[#0f172a]" : "text-[#cbd5e1]",
                  )}>
                    {d.getDate()}
                  </div>
                  {bookingCount > 0 && (
                    <div className="mx-auto mt-0.5 w-fit rounded-full bg-[#ede9fe] px-1.5 py-px text-[9px] font-bold text-[#7c3aed]">
                      {bookingCount}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Body */}
          <div className="flex overflow-y-auto" style={{ height: Math.min(600, totalH) }}>

            {/* Time gutter */}
            <div style={{ width: GUTTER_W, minWidth: GUTTER_W, height: totalH }} className="relative shrink-0 border-r border-[#f1eefc]">
              {timeRows.map((m, ri) => (
                <div
                  key={m}
                  style={{ top: ri * ROW_H, height: ROW_H }}
                  className="absolute right-0 left-0 flex items-start justify-end pr-1.5 pt-0.5"
                >
                  {m % 60 === 0 && (
                    <span className="text-[9px] font-semibold text-[#94a3b8]">{minsToLabel(m)}</span>
                  )}
                </div>
              ))}
              <div style={{ height: totalH }} />
            </div>

            {/* Day columns */}
            {weekDates.map((d, di) => {
              const ymd = weekYmds[di]!;
              const jsDay = d.getDay();
              const isOpen = scheduledDows.has(jsDay);
              const dayBookings = byDate.get(ymd) ?? [];
              const dayBreaks  = breaks.filter((b) => b.weekdays.includes(jsDay));

              return (
                <div key={ymd} className="relative flex-1 border-r border-[#f1eefc] last:border-r-0" style={{ height: totalH }}>
                  {/* Background rows */}
                  {timeRows.map((m, ri) => {
                    const isBreak = dayBreaks.some((b) => {
                      const bs = clockToMins(b.start_time);
                      const be = clockToMins(b.end_time);
                      return m >= bs && m < be;
                    });
                    return (
                      <div
                        key={m}
                        style={{ top: ri * ROW_H, height: ROW_H }}
                        className={cn(
                          "absolute inset-x-0",
                          isBreak ? "bg-amber-50/70" : !isOpen ? "bg-[#f8fafc]" : "",
                          ri > 0 && m % 60 === 0 && "border-t border-[#f1f5f9]",
                        )}
                      />
                    );
                  })}

                  {/* Booking cards */}
                  {dayBookings.map((b) => {
                    const startM = isoToVenueMins(b.starts_at, venueTimeZone);
                    const endM   = isoToVenueMins(b.ends_at,   venueTimeZone);
                    const topPx  = ((startM - openMins) / 30) * ROW_H;
                    const hPx    = Math.max(ROW_H, ((endM - startM) / 30) * ROW_H);
                    const col    = staffColor(b.staff_member ?? null);
                    const isAssigning = assigningId === b.id;

                    return (
                      <div
                        key={b.id}
                        style={{ top: Math.max(0, topPx), height: hPx, left: 2, right: 2 }}
                        className={cn("absolute z-10 overflow-hidden rounded-lg border px-1.5 py-1 shadow-sm", col.card)}
                      >
                        <p className={cn("truncate text-[11px] font-bold leading-tight", col.text)}>
                          {b.guest_name}
                        </p>
                        <p className="text-[9px] text-[#64748b]">
                          {minsToLabel(startM)}–{minsToLabel(endM)}
                        </p>
                        {isAssigning ? (
                          <select
                            autoFocus
                            className="mt-0.5 w-full rounded border border-[#c4b5fd] bg-white px-0.5 py-0.5 text-[9px]"
                            defaultValue={b.staff_member ?? ""}
                            onBlur={() => setAssigningId(null)}
                            onChange={(e) => doAssign(b.id, e.target.value)}
                          >
                            <option value="">Unassigned</option>
                            {staffMembers.map((s) => (
                              <option key={s.id} value={s.name}>{s.name}</option>
                            ))}
                          </select>
                        ) : staffMembers.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => setAssigningId(b.id)}
                            className={cn("mt-0.5 truncate text-[9px] hover:underline", col.text)}
                          >
                            {b.staff_member ?? "Assign →"}
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Empty state */}
      {byDate.size === 0 && (
        <p className="py-2 text-center text-sm text-[#94a3b8]">No confirmed bookings this week.</p>
      )}
    </div>
  );
}
