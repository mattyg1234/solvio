"use client";

import { useState, useMemo, useTransition, useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  addManualVenueCalendarBooking,
  assignBookingToStaff,
} from "@/app/dashboard/bookings/calendar-actions";
import type { VenueCalendarBookingRow } from "@/components/dashboard/booking-operations-hub";
import type { StaffMember } from "@/lib/staff-members";
import type { AppointmentWeekRow } from "@/lib/booking-inventory-types";
import type { AppointmentBreakRow } from "@/components/dashboard/appointment-week-grid";
import { cn } from "@/lib/utils";

// ── Constants ──────────────────────────────────────────────────────────────

const ROW_H    = 48;   // px per 30-min row
const GUTTER_W = 56;   // px for time labels
const COL_MIN  = 140;  // px min per staff column

const PALETTE = [
  { dot: "bg-violet-500", card: "bg-violet-50 border-violet-200 shadow-violet-100",  name: "text-violet-800" },
  { dot: "bg-blue-500",   card: "bg-blue-50 border-blue-200 shadow-blue-100",        name: "text-blue-800"   },
  { dot: "bg-emerald-500",card: "bg-emerald-50 border-emerald-200 shadow-emerald-100",name:"text-emerald-800" },
  { dot: "bg-amber-500",  card: "bg-amber-50 border-amber-200 shadow-amber-100",     name: "text-amber-800"  },
  { dot: "bg-rose-500",   card: "bg-rose-50 border-rose-200 shadow-rose-100",        name: "text-rose-800"   },
  { dot: "bg-sky-500",    card: "bg-sky-50 border-sky-200 shadow-sky-100",           name: "text-sky-800"    },
  { dot: "bg-indigo-500", card: "bg-indigo-50 border-indigo-200 shadow-indigo-100",  name: "text-indigo-800" },
  { dot: "bg-orange-500", card: "bg-orange-50 border-orange-200 shadow-orange-100",  name: "text-orange-800" },
] as const;

const UNASSIGNED = {
  dot: "bg-slate-300",
  card: "bg-slate-50 border-slate-200 shadow-slate-100",
  name: "text-slate-600",
};

const WEEK_SHORT = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"] as const;

// ── Utility functions ──────────────────────────────────────────────────────

function clockToMins(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function minsToLabel(m: number): string {
  const h   = Math.floor(m / 60) % 24;
  const min = m % 60;
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return min === 0
    ? `${h12}${h < 12 ? "am" : "pm"}`
    : `${h12}:${String(min).padStart(2, "0")}${h < 12 ? "am" : "pm"}`;
}

function minsToHhMm(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
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

/** Convert a venue-local date+time to a UTC ISO string. One-pass offset approach. */
function venueSlotToUtcIso(dateYmd: string, slotMins: number, tz: string): string {
  const [y, mo, d] = dateYmd.split("-").map(Number);
  const h = Math.floor(slotMins / 60);
  const m = slotMins % 60;
  const guessMs = Date.UTC(y!, mo! - 1, d!, h, m, 0);
  const guessParts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(guessMs));
  const gH = parseInt(guessParts.find((p) => p.type === "hour")?.value ?? "0", 10) % 24;
  const gM = parseInt(guessParts.find((p) => p.type === "minute")?.value ?? "0", 10);
  const offsetMs = (gH * 60 + gM - slotMins) * 60_000;
  return new Date(guessMs - offsetMs).toISOString();
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

function formatDayFull(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d);
}

function weekRangeLabel(dates: Date[]): string {
  const first = dates[0]!;
  const last  = dates[6]!;
  const mo1   = new Intl.DateTimeFormat("en-GB", { month: "short" }).format(first);
  const mo2   = new Intl.DateTimeFormat("en-GB", { month: "short" }).format(last);
  const yr    = last.getFullYear();
  return mo1 === mo2
    ? `${first.getDate()}–${last.getDate()} ${mo2} ${yr}`
    : `${first.getDate()} ${mo1} – ${last.getDate()} ${mo2} ${yr}`;
}

function leastBookedStaff(
  staffMembers: StaffMember[],
  slotMins: number,
  slotEndMins: number,
  dayBookings: VenueCalendarBookingRow[],
  tz: string,
): string | null {
  if (!staffMembers.length) return null;
  let best = staffMembers[0]!;
  let bestCount = Infinity;
  for (const s of staffMembers) {
    const count = dayBookings.filter((b) => {
      if (b.staff_member !== s.name) return false;
      const bStart = isoToVenueMins(b.starts_at, tz);
      const bEnd   = isoToVenueMins(b.ends_at,   tz);
      return bStart < slotEndMins && bEnd > slotMins;
    }).length;
    if (count < bestCount) { bestCount = count; best = s; }
  }
  return best.name;
}

// ── Types ──────────────────────────────────────────────────────────────────

type QuickBookState = {
  staffName: string;
  dateYmd:   string;
  slotMins:  number;
  anchorTop: number; // px within grid body — for positioning popup
};

// ── Main component ─────────────────────────────────────────────────────────

export function StaffWeekPlanner({
  businessId,
  bookings,
  staffMembers,
  schedules,
  breaks,
  venueTimeZone,
}: {
  businessId: string;
  bookings:      VenueCalendarBookingRow[];
  staffMembers:  StaffMember[];
  schedules:     AppointmentWeekRow[];
  breaks:        AppointmentBreakRow[];
  venueTimeZone: string;
}) {
  const [view,   setView]   = useState<"day" | "week">("day");
  const [anchor, setAnchor] = useState(() => new Date());
  const [, startTransition] = useTransition();
  const [error, setError]   = useState<string | null>(null);

  // Assign-staff popup (week view)
  const [assigningId, setAssigningId] = useState<string | null>(null);

  // Quick-book popup (day view)
  const [quickBook, setQuickBook]         = useState<QuickBookState | null>(null);
  const [qbName,    setQbName]            = useState("");
  const [qbPhone,   setQbPhone]           = useState("");
  const [qbDuration, setQbDuration]       = useState(60);
  const [qbSubmitting, setQbSubmitting]   = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);

  // Close popup on outside click
  useEffect(() => {
    if (!quickBook) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setQuickBook(null); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [quickBook]);

  // Derived week dates
  const weekDates = useMemo(() => weekDatesFromAnchor(anchor), [anchor]);
  const weekYmds  = useMemo(() => weekDates.map(dateToYmd), [weekDates]);
  const todayYmd  = dateToYmd(new Date());

  // For day view, the "current day" is the anchor date
  const dayYmd = dateToYmd(anchor);

  // Time rows from schedule or 9am–9pm default
  const { openMins, timeRows } = useMemo(() => {
    const opens  = schedules.map((s) => clockToMins(s.open_time));
    const closes = schedules.map((s) => clockToMins(s.close_time));
    const open  = opens.length  ? Math.min(...opens)  : 9 * 60;
    const close = closes.length ? Math.max(...closes) : 21 * 60;
    const rows: number[] = [];
    for (let m = open; m < close; m += 30) rows.push(m);
    return { openMins: open, timeRows: rows };
  }, [schedules]);

  const scheduledDows = useMemo(() => new Set(schedules.map((s) => s.weekday)), [schedules]);

  const totalH = timeRows.length * ROW_H;

  // Confirmed bookings grouped by venue-local date
  const byDate = useMemo(() => {
    const map = new Map<string, VenueCalendarBookingRow[]>();
    for (const b of bookings) {
      if (b.status === "cancelled") continue;
      const ymd = isoToVenueDateYmd(b.starts_at, venueTimeZone);
      const arr = map.get(ymd) ?? [];
      arr.push(b);
      map.set(ymd, arr);
    }
    return map;
  }, [bookings, venueTimeZone]);

  function staffColor(name: string | null | undefined) {
    if (!name) return UNASSIGNED;
    const idx = staffMembers.findIndex((s) => s.name === name);
    return idx >= 0 ? (PALETTE[idx % PALETTE.length] ?? UNASSIGNED) : UNASSIGNED;
  }

  function doAssign(bookingId: string, staffMember: string) {
    setAssigningId(null);
    setError(null);
    startTransition(() => {
      void (async () => {
        try { await assignBookingToStaff(bookingId, staffMember); }
        catch (e) { setError(e instanceof Error ? e.message : "Could not assign."); }
      })();
    });
  }

  async function doQuickBook() {
    if (!quickBook || !qbName.trim() || qbSubmitting) return;
    setQbSubmitting(true);
    setError(null);
    try {
      const startsIso = venueSlotToUtcIso(quickBook.dateYmd, quickBook.slotMins, venueTimeZone);
      const endsIso   = venueSlotToUtcIso(quickBook.dateYmd, quickBook.slotMins + qbDuration, venueTimeZone);
      await addManualVenueCalendarBooking({
        businessId,
        guestName:   qbName.trim(),
        guestPhone:  qbPhone.trim() || undefined,
        bookingKind: "appointment",
        startsAtIso: startsIso,
        endsAtIso:   endsIso,
        staffMember: quickBook.staffName,
      });
      setQuickBook(null);
      setQbName(""); setQbPhone(""); setQbDuration(60);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not book.");
    } finally {
      setQbSubmitting(false);
    }
  }

  function openQuickBook(staffName: string, dateYmd: string, slotMins: number, rowIndex: number) {
    setQuickBook({ staffName, dateYmd, slotMins, anchorTop: rowIndex * ROW_H });
    setQbName(""); setQbPhone(""); setQbDuration(60);
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="relative space-y-4">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setAnchor((d) => { const n = new Date(d); n.setDate(d.getDate() - (view === "week" ? 7 : 1)); return n; })}
            className="rounded-xl border border-[#ebe7f7] bg-white p-2 transition-colors hover:border-[#c4b5fd]"
          >
            <ChevronLeft className="h-4 w-4 text-[#64748b]" aria-hidden />
          </button>

          <div className="min-w-[200px] text-center">
            {view === "day" ? (
              <span className="text-[15px] font-semibold text-[#0f172a]">{formatDayFull(anchor)}</span>
            ) : (
              <span className="text-[15px] font-semibold text-[#0f172a]">{weekRangeLabel(weekDates)}</span>
            )}
          </div>

          <button
            type="button"
            onClick={() => setAnchor((d) => { const n = new Date(d); n.setDate(d.getDate() + (view === "week" ? 7 : 1)); return n; })}
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

        <div className="flex items-center gap-3">
          {/* Staff legend */}
          <div className="hidden flex-wrap items-center gap-1.5 sm:flex">
            {staffMembers.map((s, i) => {
              const col = PALETTE[i % PALETTE.length] ?? UNASSIGNED;
              return (
                <span key={s.id} className="flex items-center gap-1 rounded-full border border-[#ebe7f7] bg-white px-2 py-1 text-[11px] font-semibold text-[#0f172a]">
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", col.dot)} />
                  {s.name}
                </span>
              );
            })}
          </div>

          {/* View toggle */}
          <div className="flex rounded-xl border border-[#ebe7f7] bg-[#fafbff] p-0.5">
            {(["day", "week"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-[13px] font-semibold capitalize transition-colors",
                  view === v ? "bg-white text-[#5b21b6] shadow-sm" : "text-[#64748b] hover:text-[#0f172a]",
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <p className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-2 text-sm text-rose-900">{error}</p>
      )}

      {/* ── Day view ───────────────────────────────────────────────── */}
      {view === "day" && (
        <DayView
          dateYmd={dayYmd}
          bookings={byDate.get(dayYmd) ?? []}
          staffMembers={staffMembers}
          schedules={schedules}
          breaks={breaks}
          openMins={openMins}
          timeRows={timeRows}
          totalH={totalH}
          scheduledDows={scheduledDows}
          venueTimeZone={venueTimeZone}
          staffColor={staffColor}
          quickBook={quickBook}
          onOpenQuickBook={openQuickBook}
          onCloseQuickBook={() => setQuickBook(null)}
          popupRef={popupRef}
          qbName={qbName}
          qbPhone={qbPhone}
          qbDuration={qbDuration}
          qbSubmitting={qbSubmitting}
          onQbName={setQbName}
          onQbPhone={setQbPhone}
          onQbDuration={setQbDuration}
          onQbSubmit={doQuickBook}
          leastBookedStaff={(slotMins, slotEndMins, dayBookings) =>
            leastBookedStaff(staffMembers, slotMins, slotEndMins, dayBookings, venueTimeZone)
          }
        />
      )}

      {/* ── Week view ──────────────────────────────────────────────── */}
      {view === "week" && (
        <WeekView
          weekDates={weekDates}
          weekYmds={weekYmds}
          todayYmd={todayYmd}
          byDate={byDate}
          breaks={breaks}
          openMins={openMins}
          timeRows={timeRows}
          totalH={totalH}
          scheduledDows={scheduledDows}
          venueTimeZone={venueTimeZone}
          staffColor={staffColor}
          assigningId={assigningId}
          staffMembers={staffMembers}
          onAssigningId={setAssigningId}
          onAssign={doAssign}
        />
      )}
    </div>
  );
}

// ── Day view component ─────────────────────────────────────────────────────

function DayView({
  dateYmd,
  bookings,
  staffMembers,
  schedules,
  breaks,
  openMins,
  timeRows,
  totalH,
  scheduledDows,
  venueTimeZone,
  staffColor,
  quickBook,
  onOpenQuickBook,
  onCloseQuickBook,
  popupRef,
  qbName,
  qbPhone,
  qbDuration,
  qbSubmitting,
  onQbName,
  onQbPhone,
  onQbDuration,
  onQbSubmit,
  leastBookedStaff: getLeast,
}: {
  dateYmd: string;
  bookings: VenueCalendarBookingRow[];
  staffMembers: StaffMember[];
  schedules: AppointmentWeekRow[];
  breaks: AppointmentBreakRow[];
  openMins: number;
  timeRows: number[];
  totalH: number;
  scheduledDows: Set<number>;
  venueTimeZone: string;
  staffColor: (name: string | null | undefined) => typeof UNASSIGNED;
  quickBook: QuickBookState | null;
  onOpenQuickBook: (staffName: string, dateYmd: string, slotMins: number, rowIndex: number) => void;
  onCloseQuickBook: () => void;
  popupRef: React.RefObject<HTMLDivElement | null>;
  qbName: string;
  qbPhone: string;
  qbDuration: number;
  qbSubmitting: boolean;
  onQbName: (v: string) => void;
  onQbPhone: (v: string) => void;
  onQbDuration: (v: number) => void;
  onQbSubmit: () => void;
  leastBookedStaff: (slotMins: number, slotEndMins: number, dayBookings: VenueCalendarBookingRow[]) => string | null;
}) {
  // Parse date to get JS day-of-week
  const [y, mo, d] = dateYmd.split("-").map(Number);
  const jsDate = new Date(y!, mo! - 1, d!);
  const jsDay  = jsDate.getDay(); // 0=Sun

  const isOpen  = scheduledDows.has(jsDay);
  const dayBreaks = breaks.filter((b) => b.weekdays.includes(jsDay));

  // Virtual "Unassigned" column for bookings with no staff
  const columns: { id: string; name: string }[] = staffMembers.length
    ? [...staffMembers, { id: "__unassigned__", name: "" }]
    : [{ id: "__unassigned__", name: "" }];

  const displayCols = staffMembers.length
    ? staffMembers.map((s) => ({ id: s.id, name: s.name }))
    : [{ id: "__unassigned__", name: "All bookings" }];

  // Bookings per staff member
  function bookingsForStaff(name: string) {
    if (name === "") return bookings.filter((b) => !b.staff_member || b.staff_member === "");
    return bookings.filter((b) => b.staff_member === name);
  }

  function slotOccupied(staffName: string, slotMins: number) {
    return bookingsForStaff(staffName).some((b) => {
      const sM = isoToVenueMins(b.starts_at, venueTimeZone);
      const eM = isoToVenueMins(b.ends_at,   venueTimeZone);
      return slotMins >= sM && slotMins < eM;
    });
  }

  const hasNoStaff = staffMembers.length === 0;

  return (
    <div className="overflow-x-auto rounded-2xl border border-[#f1eefc] bg-white shadow-sm">
      <div style={{ minWidth: GUTTER_W + displayCols.length * COL_MIN }}>

        {/* Column headers */}
        <div className="flex border-b border-[#f1eefc] bg-[#fafbff]">
          <div style={{ width: GUTTER_W, minWidth: GUTTER_W }} className="shrink-0 border-r border-[#f1eefc]" />
          {displayCols.map((col, ci) => {
            const col2 = staffColor(col.name || null);
            return (
              <div key={col.id} className="flex flex-1 items-center justify-center gap-2 border-r border-[#f1eefc] py-3 last:border-r-0">
                {col.name ? (
                  <>
                    <span className={cn("h-3 w-3 shrink-0 rounded-full", PALETTE[ci % PALETTE.length]?.dot ?? "bg-slate-300")} />
                    <span className="text-[13px] font-bold text-[#0f172a]">{col.name}</span>
                  </>
                ) : (
                  <span className="text-[12px] font-semibold text-[#94a3b8]">Unassigned</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Grid body */}
        <div className="relative flex overflow-y-auto" style={{ height: Math.min(580, totalH) }}>

          {/* Time gutter */}
          <div style={{ width: GUTTER_W, minWidth: GUTTER_W, height: totalH }} className="relative shrink-0 border-r border-[#f1eefc]">
            {timeRows.map((m, ri) => (
              <div
                key={m}
                style={{ top: ri * ROW_H, height: ROW_H }}
                className="absolute inset-x-0 flex items-start justify-end pr-2 pt-0.5"
              >
                {m % 60 === 0 && (
                  <span className="text-[10px] font-semibold text-[#94a3b8]">{minsToLabel(m)}</span>
                )}
              </div>
            ))}
          </div>

          {/* Staff columns */}
          {displayCols.map((col, ci) => {
            const staffBookings = bookingsForStaff(col.name);
            const colColor = PALETTE[ci % PALETTE.length] ?? UNASSIGNED;

            return (
              <div
                key={col.id}
                className="relative flex-1 border-r border-[#f1eefc] last:border-r-0"
                style={{ height: totalH }}
              >
                {/* Background rows */}
                {timeRows.map((m, ri) => {
                  const isBreak    = dayBreaks.some((b) => m >= clockToMins(b.start_time) && m < clockToMins(b.end_time));
                  const isOccupied = col.name !== "" && slotOccupied(col.name, m);
                  const isHour     = m % 60 === 0 && ri > 0;
                  const canBook    = isOpen && !isBreak && !isOccupied && col.name !== "";

                  return (
                    <div
                      key={m}
                      style={{ top: ri * ROW_H, height: ROW_H }}
                      onClick={canBook ? () => onOpenQuickBook(col.name, dateYmd, m, ri) : undefined}
                      className={cn(
                        "absolute inset-x-0 transition-colors",
                        isBreak    && "bg-amber-50/70",
                        !isOpen    && "bg-[#f8fafc]",
                        canBook    && "cursor-pointer hover:bg-[#f5f3ff]/70 hover:ring-1 hover:ring-inset hover:ring-[#ddd6fe]",
                        isHour     && "border-t border-[#f1f5f9]",
                      )}
                    />
                  );
                })}

                {/* Booking cards */}
                {staffBookings.map((b) => {
                  const sM   = isoToVenueMins(b.starts_at, venueTimeZone);
                  const eM   = isoToVenueMins(b.ends_at,   venueTimeZone);
                  const topPx = ((sM - openMins) / 30) * ROW_H;
                  const hPx   = Math.max(ROW_H * 0.85, ((eM - sM) / 30) * ROW_H);
                  const col2  = staffColor(b.staff_member ?? null);

                  return (
                    <div
                      key={b.id}
                      style={{ top: Math.max(0, topPx), height: hPx, left: 3, right: 3 }}
                      className={cn(
                        "absolute z-10 overflow-hidden rounded-xl border px-2 py-1.5 shadow-sm",
                        col.name ? col2.card : "bg-slate-50 border-slate-200",
                      )}
                    >
                      <p className={cn("truncate text-[12px] font-bold leading-tight", col.name ? col2.name : "text-slate-600")}>
                        {b.guest_name}
                      </p>
                      <p className="text-[10px] text-[#64748b]">
                        {minsToLabel(sM)}–{minsToLabel(eM)}
                      </p>
                      {b.title && b.title !== b.guest_name && (
                        <p className="mt-0.5 truncate text-[10px] text-[#94a3b8]">{b.title.split("·")[1]?.trim()}</p>
                      )}
                    </div>
                  );
                })}

                {/* Quick-book popup anchored to this column */}
                {quickBook && quickBook.staffName === col.name && quickBook.dateYmd === dateYmd && (
                  <div
                    ref={popupRef}
                    style={{ top: Math.max(0, quickBook.anchorTop - 8), left: "50%", transform: "translateX(-50%)" }}
                    className="absolute z-50 w-64 rounded-2xl border border-[#ede9fe] bg-white p-4 shadow-xl shadow-[#7c3aed]/10"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <p className="text-[13px] font-bold text-[#0f172a]">Book with {col.name}</p>
                        <p className="text-[11px] text-[#64748b]">{minsToLabel(quickBook.slotMins)}</p>
                      </div>
                      <button type="button" onClick={onCloseQuickBook} className="rounded-lg p-1 hover:bg-[#f5f3ff]">
                        <X className="h-4 w-4 text-[#94a3b8]" />
                      </button>
                    </div>
                    <div className="space-y-2">
                      <input
                        autoFocus
                        value={qbName}
                        onChange={(e) => onQbName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && onQbSubmit()}
                        placeholder="Guest name *"
                        className="h-9 w-full rounded-xl border border-[#ebe7f7] px-3 text-[13px] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/20"
                      />
                      <input
                        value={qbPhone}
                        onChange={(e) => onQbPhone(e.target.value)}
                        placeholder="Phone (optional)"
                        className="h-9 w-full rounded-xl border border-[#ebe7f7] px-3 text-[13px] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/20"
                      />
                      <select
                        value={qbDuration}
                        onChange={(e) => onQbDuration(Number(e.target.value))}
                        className="h-9 w-full rounded-xl border border-[#ebe7f7] px-3 text-[13px]"
                      >
                        {[30, 45, 60, 90, 120].map((m) => (
                          <option key={m} value={m}>{m} min · ends {minsToLabel(quickBook.slotMins + m)}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={!qbName.trim() || qbSubmitting}
                        onClick={onQbSubmit}
                        className="h-9 w-full rounded-xl bg-[#7c3aed] text-[13px] font-semibold text-white transition-opacity disabled:opacity-50 hover:bg-[#6d28d9]"
                      >
                        {qbSubmitting ? "Booking…" : "Confirm booking →"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {!isOpen && (
        <p className="px-4 py-3 text-center text-[13px] text-[#94a3b8]">
          No schedule configured for this day — add hours in Appointment settings.
        </p>
      )}
      {hasNoStaff && isOpen && (
        <p className="border-t border-[#f1eefc] px-4 py-2 text-center text-[12px] text-[#94a3b8]">
          Add staff in Appointment settings to see per-staff columns and click-to-book.
        </p>
      )}
    </div>
  );
}

// ── Week view component ────────────────────────────────────────────────────

function WeekView({
  weekDates,
  weekYmds,
  todayYmd,
  byDate,
  breaks,
  openMins,
  timeRows,
  totalH,
  scheduledDows,
  venueTimeZone,
  staffColor,
  assigningId,
  staffMembers,
  onAssigningId,
  onAssign,
}: {
  weekDates: Date[];
  weekYmds: string[];
  todayYmd: string;
  byDate: Map<string, VenueCalendarBookingRow[]>;
  breaks: AppointmentBreakRow[];
  openMins: number;
  timeRows: number[];
  totalH: number;
  scheduledDows: Set<number>;
  venueTimeZone: string;
  staffColor: (name: string | null | undefined) => typeof UNASSIGNED;
  assigningId: string | null;
  staffMembers: StaffMember[];
  onAssigningId: (id: string | null) => void;
  onAssign: (bookingId: string, staffMember: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-[#f1eefc] bg-white shadow-sm">
      <div style={{ minWidth: GUTTER_W + weekDates.length * 120 }}>

        {/* Day headers */}
        <div className="flex border-b border-[#f1eefc] bg-[#fafbff]">
          <div style={{ width: GUTTER_W, minWidth: GUTTER_W }} className="shrink-0 border-r border-[#f1eefc]" />
          {weekDates.map((d, i) => {
            const ymd     = weekYmds[i]!;
            const isToday = ymd === todayYmd;
            const jsDay   = d.getDay();
            const isOpen  = scheduledDows.has(jsDay);
            const count   = (byDate.get(ymd) ?? []).length;
            return (
              <div key={ymd} className="flex-1 border-r border-[#f1eefc] px-2 py-2 text-center last:border-r-0">
                <div className={cn("text-[10px] font-semibold uppercase tracking-widest", isToday ? "text-[#7c3aed]" : "text-[#94a3b8]")}>
                  {WEEK_SHORT[i]}
                </div>
                <div className={cn(
                  "mx-auto mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-[13px] font-bold",
                  isToday ? "bg-[#7c3aed] text-white" : isOpen ? "text-[#0f172a]" : "text-[#cbd5e1]",
                )}>
                  {d.getDate()}
                </div>
                {count > 0 && (
                  <span className="mx-auto mt-0.5 block w-fit rounded-full bg-[#ede9fe] px-1.5 py-px text-[9px] font-bold text-[#7c3aed]">{count}</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex overflow-y-auto" style={{ height: Math.min(580, totalH) }}>

          {/* Time gutter */}
          <div style={{ width: GUTTER_W, minWidth: GUTTER_W, height: totalH }} className="relative shrink-0 border-r border-[#f1eefc]">
            {timeRows.map((m, ri) => (
              <div key={m} style={{ top: ri * ROW_H, height: ROW_H }} className="absolute inset-x-0 flex items-start justify-end pr-2 pt-0.5">
                {m % 60 === 0 && <span className="text-[10px] font-semibold text-[#94a3b8]">{minsToLabel(m)}</span>}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {weekDates.map((d, di) => {
            const ymd        = weekYmds[di]!;
            const jsDay      = d.getDay();
            const isOpen     = scheduledDows.has(jsDay);
            const dayBookings = byDate.get(ymd) ?? [];
            const dayBreaks  = breaks.filter((b) => b.weekdays.includes(jsDay));

            return (
              <div key={ymd} className="relative flex-1 border-r border-[#f1eefc] last:border-r-0" style={{ height: totalH }}>
                {timeRows.map((m, ri) => {
                  const isBreak = dayBreaks.some((b) => m >= clockToMins(b.start_time) && m < clockToMins(b.end_time));
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

                {dayBookings.map((b) => {
                  const sM   = isoToVenueMins(b.starts_at, venueTimeZone);
                  const eM   = isoToVenueMins(b.ends_at,   venueTimeZone);
                  const topPx = ((sM - openMins) / 30) * ROW_H;
                  const hPx   = Math.max(ROW_H * 0.85, ((eM - sM) / 30) * ROW_H);
                  const col   = staffColor(b.staff_member ?? null);

                  return (
                    <div
                      key={b.id}
                      style={{ top: Math.max(0, topPx), height: hPx, left: 2, right: 2 }}
                      className={cn("absolute z-10 overflow-hidden rounded-xl border px-1.5 py-1 shadow-sm", col.card)}
                    >
                      <p className={cn("truncate text-[11px] font-bold leading-tight", col.name)}>{b.guest_name}</p>
                      <p className="text-[9px] text-[#64748b]">{minsToLabel(sM)}–{minsToLabel(eM)}</p>
                      {staffMembers.length > 0 && (
                        assigningId === b.id ? (
                          <select
                            autoFocus
                            className="mt-0.5 w-full rounded border border-[#c4b5fd] bg-white px-0.5 py-px text-[9px]"
                            defaultValue={b.staff_member ?? ""}
                            onBlur={() => onAssigningId(null)}
                            onChange={(e) => onAssign(b.id, e.target.value)}
                          >
                            <option value="">Unassigned</option>
                            {staffMembers.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
                          </select>
                        ) : (
                          <button type="button" onClick={() => onAssigningId(b.id)} className={cn("mt-0.5 truncate text-[9px] hover:underline", col.name)}>
                            {b.staff_member ?? "Assign →"}
                          </button>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
