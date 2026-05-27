"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import type { PublicAppointmentHour, PublicAppointmentBookedSlot, PublicAppointmentSlotException } from "@/lib/booking-public-context";
import {
  type AppointmentBreak,
  type AppointmentDayCalendarSummary,
  formatAppointmentStaffPreview,
  summarizeAppointmentDayForCalendar,
} from "@/lib/booking-appointment-slots";
import { dowOfMonthFirst, monthMeta } from "@/lib/bookings-calendar-aggregate";
import type { StaffMember } from "@/lib/staff-members";
import { cn } from "@/lib/utils";

const WEEK_HEAD_LABELS = ["S", "M", "T", "W", "T", "F", "S"] as const;

function parseYmFromYmd(ymd: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]) };
}

function ymPrefix(year: number, month1Indexed: number): string {
  return `${year}-${String(month1Indexed).padStart(2, "0")}-`;
}

export type AppointmentMonthCalendarProps = {
  timeZone: string;
  todayYmd: string;
  appointmentHours: PublicAppointmentHour[];
  exceptions: PublicAppointmentSlotException[];
  bookedSlots: PublicAppointmentBookedSlot[];
  staffMembers: StaffMember[];
  breaks?: AppointmentBreak[];
  selectedDateYmd: string;
  onSelectDate: (dateYmd: string) => void;
};

export function AppointmentMonthCalendar({
  timeZone,
  todayYmd,
  appointmentHours,
  exceptions,
  bookedSlots,
  staffMembers,
  breaks = [],
  selectedDateYmd,
  onSelectDate,
}: AppointmentMonthCalendarProps) {
  const [cursor, setCursor] = useState(() => {
    const anchor = selectedDateYmd.trim() || todayYmd;
    const p = parseYmFromYmd(anchor);
    if (p?.year && p.month) return p;
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() + 1 };
  });

  useEffect(() => {
    const anchor = selectedDateYmd.trim() || todayYmd;
    const p = parseYmFromYmd(anchor);
    if (p?.year && p.month) setCursor(p);
  }, [selectedDateYmd, todayYmd]);

  const summariesByDom = useMemo(() => {
    const pref = ymPrefix(cursor.year, cursor.month);
    const { lastDay } = monthMeta(cursor.year, cursor.month);
    const map = new Map<number, AppointmentDayCalendarSummary>();
    for (let dom = 1; dom <= lastDay; dom++) {
      const dateYmd = `${pref}${String(dom).padStart(2, "0")}`;
      map.set(
        dom,
        summarizeAppointmentDayForCalendar({
          dateYmd,
          todayYmd,
          appointmentHours,
          venueTimeZone: timeZone,
          exceptions,
          breaks,
          bookedSlots,
          staffMembers,
        }),
      );
    }
    return map;
  }, [
    appointmentHours,
    bookedSlots,
    breaks,
    cursor.month,
    cursor.year,
    exceptions,
    staffMembers,
    timeZone,
    todayYmd,
  ]);

  const closedInMonth = useMemo(() => {
    return [...summariesByDom.values()]
      .filter((s) => s.status === "closed" || s.status === "full")
      .sort((a, b) => a.dateYmd.localeCompare(b.dateYmd));
  }, [summariesByDom]);

  const leadingBlanks = dowOfMonthFirst(cursor.year, cursor.month, timeZone);
  const { lastDay } = monthMeta(cursor.year, cursor.month);
  const totalCells = Math.ceil((leadingBlanks + lastDay) / 7) * 7;

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

  const selectedSummary = selectedDateYmd.trim()
    ? summarizeAppointmentDayForCalendar({
        dateYmd: selectedDateYmd.trim(),
        todayYmd,
        appointmentHours,
        venueTimeZone: timeZone,
        exceptions,
        breaks,
        bookedSlots,
        staffMembers,
      })
    : null;

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
          if (idx < leadingBlanks || domNum > lastDay || domNum < 1) {
            return (
              <div key={`e-${cursor.year}-${cursor.month}-${idx}`} className="min-h-[4.5rem] rounded-lg bg-[#fafafa]/70 md:min-h-[5.25rem]" aria-hidden />
            );
          }

          const summary = summariesByDom.get(domNum)!;
          const isSelected = selectedDateYmd.trim() === summary.dateYmd;
          const staffPreview = formatAppointmentStaffPreview(summary.staffNames);
          const isBookable = summary.status === "bookable";
          const isClosed = summary.status === "closed" || summary.status === "full";
          const isPast = summary.status === "past";
          const isNoHours = summary.status === "no_hours";

          return (
            <button
              key={summary.dateYmd}
              type="button"
              disabled={!isBookable}
              aria-pressed={isSelected || undefined}
              title={
                isBookable
                  ? `${domNum} · ${summary.availableCount} slot${summary.availableCount === 1 ? "" : "s"}${staffPreview ? ` · ${staffPreview}` : ""}`
                  : isClosed
                    ? `${domNum} — ${summary.status === "full" ? "fully booked" : "closed"}`
                    : isNoHours
                      ? `${domNum} — not open this weekday`
                      : `${domNum} — past`
              }
              onClick={() => onSelectDate(summary.dateYmd)}
              className={cn(
                "flex min-h-[3rem] flex-col items-center justify-start rounded-lg border px-0.5 py-2 text-[13px] font-semibold transition sm:min-h-[4.5rem] md:min-h-[5.25rem] md:px-1 md:py-2",
                isPast || isNoHours
                  ? "cursor-not-allowed border-transparent bg-[#f1f5f9] text-[#cbd5e1]"
                  : isClosed
                    ? "cursor-not-allowed border-rose-200 bg-rose-50 text-rose-800 line-through decoration-rose-900/70"
                    : isSelected
                      ? "border-[#7c3aed] bg-gradient-to-br from-[#ddd6fe] via-[#ede9fe] to-[#f5f3ff] text-[#4c1d95] shadow-inner shadow-[#7c3aed]/35 ring-2 ring-[#a78bfa]"
                      : "border-[#c4b5fd] bg-gradient-to-br from-[#ede9fe] to-[#f5f3ff] text-[#5b21b6] shadow-[0_1px_0_rgba(124,58,237,0.12)] hover:border-[#7c3aed] hover:bg-[#ddd6fe]/90 hover:shadow-md",
              )}
            >
              <span>{domNum}</span>
              {staffPreview && isBookable ? (
                <span className="mt-0.5 hidden line-clamp-2 w-full px-0.5 text-center text-[9px] font-medium normal-case leading-tight text-[#6d28d9]/90 sm:block md:text-[10px]">
                  {staffPreview}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {closedInMonth.length > 0 ? (
        <ul className="space-y-2 rounded-xl border border-rose-100 bg-rose-50/80 px-4 py-3 text-[12px] leading-relaxed text-rose-950">
          {closedInMonth.map((s) => (
            <li key={s.dateYmd}>
              <span className="font-semibold">
                {new Date(`${s.dateYmd}T12:00:00`).toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  timeZone,
                })}
              </span>
              {" — "}
              {s.status === "full" ? "Fully booked" : "Closed"}
            </li>
          ))}
        </ul>
      ) : null}

      {selectedSummary && selectedSummary.status === "bookable" ? (
        <p className="text-[13px] leading-relaxed text-[#64748b]">
          <span className="font-semibold text-[#0f172a]">
            {new Date(`${selectedSummary.dateYmd}T12:00:00`).toLocaleDateString(undefined, {
              weekday: "long",
              month: "short",
              day: "numeric",
              timeZone,
            })}
          </span>
          {selectedSummary.staffNames.length ? (
            <>
              {" "}
              · Working: <span className="font-semibold text-[#5b21b6]">{selectedSummary.staffNames.join(", ")}</span>
            </>
          ) : null}
          {" · "}
          <span className="font-semibold text-[#5b21b6]">{selectedSummary.availableCount}</span> slot
          {selectedSummary.availableCount === 1 ? "" : "s"} left
          <span className="text-[#94a3b8]"> ({timeZone})</span>
        </p>
      ) : null}

      <p className="text-[11px] leading-relaxed text-[#94a3b8]">
        Grey days aren&apos;t open for appointments —{" "}
        <span className="font-semibold text-[#5b21b6]">purple dates</span> are bookable.{" "}
        <span className="font-semibold text-rose-700">Struck-through rose dates</span> are closed or fully booked. Team names show who&apos;s scheduled that day.
      </p>
    </div>
  );
}
