"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { replaceAppointmentSlotExceptionsForDate } from "@/app/dashboard/bookings/inventory-actions";
import type { AppointmentWeekRow, SlotExceptionRow } from "@/lib/booking-inventory-types";
import {
  buildAppointmentSlotsForPainting,
  calendarYmdInZone,
  dowSundayZeroInBusinessTZ,
  normalizeSlotStartHm,
  weekSevenDaysSundayStart,
} from "@/lib/booking-appointment-slots";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function rowsForAppointmentDate(schedules: AppointmentWeekRow[], dateYmd: string, venueTz: string): AppointmentWeekRow | undefined {
  if (!/^(\d{4})-(\d{2})-(\d{2})$/.exec(dateYmd.trim())) return undefined;
  const dow = dowSundayZeroInBusinessTZ(dateYmd.trim(), venueTz);
  return schedules.find((s) => s.weekday === dow);
}

function exceptionsForDay(all: SlotExceptionRow[], dateYmd: string): SlotExceptionRow[] {
  const d = dateYmd.trim();
  return all.filter((x) => x.exception_date === d);
}

function wholeDayStored(rows: SlotExceptionRow[]): boolean {
  return rows.some((r) => !r.slot_start);
}

/** Closed slot starts HH:MM for this date — empty set when stored as whole day (meaning all closed). */
function closedHmFromRows(rows: SlotExceptionRow[]): { wholeDay: boolean; hm: Set<string> } {
  if (wholeDayStored(rows)) return { wholeDay: true, hm: new Set() };
  const hm = new Set<string>();
  for (const r of rows) {
    const n = normalizeSlotStartHm(r.slot_start ?? "");
    if (n) hm.add(n);
  }
  return { wholeDay: false, hm };
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

  const [pickDate, setPickDate] = useState(() => todayYmd);
  const [closedHm, setClosedHm] = useState<Set<string>>(() => new Set());
  const [exKind, setExKind] = useState<"removed" | "cancelled">("removed");
  const [exReason, setExReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const rowForDay = useMemo(() => rowsForAppointmentDate(schedules, pickDate, tz), [schedules, pickDate, tz]);
  const templateSlots = useMemo(() => buildAppointmentSlotsForPainting(rowForDay), [rowForDay]);
  const dayRows = useMemo(() => exceptionsForDay(exceptions, pickDate), [exceptions, pickDate]);

  useEffect(() => {
    const { wholeDay, hm } = closedHmFromRows(dayRows);
    const allHm = templateSlots.map((s) => s.slotStartHm);
    if (wholeDay) {
      setClosedHm(new Set(allHm));
    } else {
      setClosedHm(new Set(Array.from(hm).filter((h) => allHm.includes(h))));
    }
  }, [pickDate, dayRows, templateSlots]);

  const painting = useRef(false);
  const brush = useRef<"close" | "open">("close");

  const allSelected = templateSlots.length > 0 && closedHm.size === templateSlots.length;
  const closedCount = closedHm.size;

  function toggleSlot(hm: string, brushMode: "close" | "open") {
    setClosedHm((prev) => {
      const n = new Set(prev);
      if (brushMode === "close") n.add(hm);
      else n.delete(hm);
      return n;
    });
  }

  function gridPointerDown(slotHm: string) {
    const on = closedHm.has(slotHm);
    painting.current = true;
    brush.current = on ? "open" : "close";
    toggleSlot(slotHm, brush.current);
  }

  function gridPointerEnter(slotHm: string) {
    if (!painting.current) return;
    const wantClosed = brush.current === "close";
    setClosedHm((prev) => {
      const cur = prev.has(slotHm);
      if (wantClosed === cur) return prev;
      const n = new Set(prev);
      if (wantClosed) n.add(slotHm);
      else n.delete(slotHm);
      return n;
    });
  }

  useEffect(() => {
    function release() {
      painting.current = false;
    }
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
    };
  }, []);

  function runSave(forDates: string[], modeSlots: Map<string, Set<string>> | "whole_week_whole_days") {
    setError(null);
    startTransition(() => {
      void (async () => {
        try {
          if (modeSlots === "whole_week_whole_days") {
            for (const d of forDates) {
              await replaceAppointmentSlotExceptionsForDate({
                businessId,
                exceptionDate: d,
                kind: exKind,
                reason: exReason.trim() ? exReason.trim() : null,
                mode: "whole_day",
              });
            }
            router.refresh();
            return;
          }
          for (const d of forDates) {
            const hm = modeSlots.get(d)!;
            const row = rowsForAppointmentDate(schedules, d, tz);
            const slotsHm = row ? buildAppointmentSlotsForPainting(row).map((s) => s.slotStartHm) : [];
            if (slotsHm.length === 0) continue;
            if (hm.size === 0) {
              await replaceAppointmentSlotExceptionsForDate({
                businessId,
                exceptionDate: d,
                kind: exKind,
                reason: exReason.trim() ? exReason.trim() : null,
                mode: "clear",
              });
            } else if (hm.size === slotsHm.length) {
              await replaceAppointmentSlotExceptionsForDate({
                businessId,
                exceptionDate: d,
                kind: exKind,
                reason: exReason.trim() ? exReason.trim() : null,
                mode: "whole_day",
              });
            } else {
              await replaceAppointmentSlotExceptionsForDate({
                businessId,
                exceptionDate: d,
                kind: exKind,
                reason: exReason.trim() ? exReason.trim() : null,
                mode: "slots",
                slotStartsHm: Array.from(hm),
              });
            }
          }
          router.refresh();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not save.");
        }
      })();
    });
  }

  const weekDates = pickDate.trim() ? weekSevenDaysSundayStart(pickDate.trim(), tz) : [];

  return (
    <div className="space-y-4 rounded-2xl border border-[#f1eefc] bg-white p-5">
      {error ? <p className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-2 text-sm text-rose-900">{error}</p> : null}
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-[#0f172a]">Paint closed slots — day grid</h3>
        <p className="text-sm text-[#64748b]">
          Tap or drag across the squares to toggle closed openings. Selecting every tile for a day behaves like a full closure. Saved rules respect your weekly template for that weekday (in{" "}
          <span className="font-semibold text-[#475569]">{tz}</span>).
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl bg-[#fafbff] p-4">
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]" htmlFor="ex-grid-date">
            Date
          </label>
          <input
            id="ex-grid-date"
            type="date"
            value={pickDate}
            onChange={(e) => setPickDate(e.target.value)}
            className="h-11 rounded-xl border border-[#ebe7f7] bg-white px-3"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">Stored as</label>
          <select
            value={exKind}
            onChange={(e) => setExKind(e.target.value as "removed" | "cancelled")}
            className="h-11 rounded-xl border border-[#ebe7f7] bg-white px-3"
          >
            <option value="removed">Blocked (silent — slot hidden online)</option>
            <option value="cancelled">Cancelled (shows “unavailable” tone to AI)</option>
          </select>
        </div>
        <div className="min-w-[200px] flex-1 space-y-1">
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">Reason (optional)</label>
          <input
            value={exReason}
            onChange={(e) => setExReason(e.target.value)}
            placeholder="Staff retreat · renovation…"
            className="h-11 w-full rounded-xl border border-[#ebe7f7] px-3"
          />
        </div>
      </div>

      {!rowForDay ? (
        <p className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          This weekday isn&apos;t in your weekly appointment template yet — add it above first, then exceptions can shade that day&apos;s slot grid.
        </p>
      ) : templateSlots.length === 0 ? (
        <p className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          Open and close hours for this weekday don&apos;t produce any slots — adjust the weekly row (or slot length).
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full text-xs font-semibold"
              disabled={pending || !templateSlots.length}
              onClick={() => setClosedHm(new Set(templateSlots.map((s) => s.slotStartHm)))}
            >
              Select all slots ({templateSlots.length})
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full text-xs font-semibold"
              disabled={pending}
              onClick={() => setClosedHm(new Set())}
            >
              Clear all
            </Button>
          </div>

          <p className="text-xs text-[#64748b]">
            {allSelected ? (
              <>
                Saving will store this as one <strong>whole-day closure</strong> for {pickDate} (fewer rows, same effect online).
              </>
            ) : closedCount === 0 ? (
              <>
                Saving clears every exception recorded for <span className="font-semibold text-[#475569]">{pickDate}</span>.
              </>
            ) : (
              <>
                Blocking <strong>{closedCount}</strong> of <strong>{templateSlots.length}</strong> slots · paint by dragging across cells.
              </>
            )}
          </p>

          <div className="select-none rounded-2xl border border-[#ede9fe]/90 bg-[#fafbff]/80 p-4">
            <div
              className="grid gap-2 md:gap-3"
              style={{ gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))" }}
              role="group"
              aria-label="Appointment slot closure grid"
              onPointerLeave={() => {
                painting.current = false;
              }}
            >
              {templateSlots.map((s) => {
                const on = closedHm.has(s.slotStartHm);
                return (
                  <button
                    key={`${pickDate}-${s.slotStartHm}`}
                    type="button"
                    className={cn(
                      "aspect-square min-h-[72px] rounded-xl border-2 px-2 py-3 text-[11px] font-semibold leading-tight shadow-sm outline-none ring-offset-2 transition-colors focus-visible:ring-2 focus-visible:ring-[#7c3aed]",
                      on
                        ? "border-rose-200 bg-rose-50 text-rose-900"
                        : "border-[#dcd6fc] bg-white text-[#475569] hover:bg-[#f5f3ff]",
                    )}
                    onPointerDown={(e) => {
                      if (e.button !== 0) return;
                      e.preventDefault();
                      gridPointerDown(s.slotStartHm);
                    }}
                    onPointerEnter={(e) => {
                      if ((e.buttons & 1) === 1) gridPointerEnter(s.slotStartHm);
                    }}
                  >
                    <span className="sr-only">{on ? "Closed" : "Open"} · </span>
                    {s.labelHm}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              type="button"
              className="rounded-full font-semibold"
              disabled={pending || !rowForDay || !pickDate.trim()}
              onClick={() => {
                const hm = closedHm;
                const m = new Map<string, Set<string>>();
                m.set(pickDate.trim(), new Set(Array.from(hm)));
                runSave([pickDate.trim()], m);
              }}
            >
              {pending ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden /> : null}
              Save this date
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-full border-rose-200 font-semibold text-rose-800"
              disabled={pending || weekDates.length < 7 || !pickDate.trim()}
              onClick={() => {
                const ok =
                  typeof window !== "undefined"
                    ? window.confirm(
                        "Close the ENTIRE salon for every day Sun–Sat in this calendar week? This replaces exceptions for each date.",
                      )
                    : false;
                if (!ok) return;
                runSave(weekDates, "whole_week_whole_days");
              }}
            >
              Whole week shut (Sun–Sat)
            </Button>
          </div>
        </>
      )}

      <p className="text-[13px] leading-relaxed text-[#94a3b8]">
        Tip: Exceptions are keyed to the venue clock — travellers still pick times in local wall hours. Hosted Events stay separate for themed sell-outs (boat parties).
      </p>
    </div>
  );
}
