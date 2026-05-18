"use client";

import { useMemo, useState, useTransition, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, CalendarRange, X } from "lucide-react";

import {
  toggleBusinessEventOccurrenceSkipped,
  upsertBusinessEventInstanceOverrideTimes,
  clearBusinessEventInstanceOverride,
  cancelBusinessEvent,
} from "@/app/dashboard/bookings/inventory-actions";
import { Button } from "@/components/ui/button";
import { expandBusinessEventOccurrences, formatYmdInTimeZone } from "@/lib/business-event-occurrences";
import { cn } from "@/lib/utils";

/** Mirror of `BusinessEventRow` minus soft-delete bookkeeping (drawer hides deleted rows upstream). */
export type SheetBusinessEventRow = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  recurrence: unknown;
  cancelled_at: string | null;
};

export type EventSeriesCalendarSheetProps = {
  event: SheetBusinessEventRow | null;
  businessId: string;
  /** `businesses.time_zone` fallback `UTC`. */
  venueTimeZone: string;
  onClose: () => void;
};

function monthMeta(year: number, month1Indexed: number) {
  const lastDay = new Date(year, month1Indexed, 0).getDate();
  return { lastDay };
}

/** First-of-calendar-month weekday 0 = Sun … 6 = Sat, evaluated in `tz`. */
function dowOfMonthFirst(year: number, month1Indexed: number, tz: string): number {
  const isoDay = `${year}-${String(month1Indexed).padStart(2, "0")}-01T14:30:00Z`;
  const d = new Date(isoDay);
  const wd = d.toLocaleDateString("en-US", { weekday: "short", timeZone: tz });
  const ix = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
  return ix >= 0 ? ix : 0;
}

function isoSliceForDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day}T${h}:${mi}`;
}

export function EventSeriesCalendarSheet({
  event,
  businessId,
  venueTimeZone,
  onClose,
}: EventSeriesCalendarSheetProps) {
  const tz = venueTimeZone && venueTimeZone.trim().length ? venueTimeZone.trim() : "UTC";

  const now = useMemo(() => new Date(), []);
  const initialYmd = formatYmdInTimeZone(now, tz);
  const [ym, setYm] = useState(() => {
    const [y, mo] = initialYmd.split("-").map((x) => Number(x));
    return { year: y, month: mo };
  });

  useEffect(() => {
    if (!event) return;
    const anchorYmd = formatYmdInTimeZone(new Date(event.starts_at), tz);
    const [y, mo] = anchorYmd.split("-").map((x) => Number(x));
    setYm({ year: y, month: mo });
  }, [event, tz]);

  const [selectedYmd, setSelectedYmd] = useState<string | null>(null);

  useEffect(() => {
    setSelectedYmd(null);
  }, [ym.year, ym.month]);

  useEffect(() => {
    if (!event) return;
    function esc(k: KeyboardEvent) {
      if (k.key === "Escape") onClose();
    }
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [event, onClose]);

  const rangeBounds = useMemo(() => {
    const { lastDay } = monthMeta(ym.year, ym.month);
    const y = ym.year;
    const m = String(ym.month).padStart(2, "0");
    const paddedLast = String(lastDay).padStart(2, "0");
    return {
      /** UTC month bounds keeps expansion inclusive of evening shows ending in local venues. */
      rangeStart: new Date(`${y}-${m}-01T00:00:00Z`),
      rangeEnd: new Date(`${y}-${m}-${paddedLast}T23:59:59.999Z`),
      lastDay,
    };
  }, [ym]);

  const occurrences = useMemo(() => {
    if (!event) return [];
    return expandBusinessEventOccurrences(
      event.starts_at,
      event.ends_at,
      event.recurrence,
      tz,
      rangeBounds.rangeStart,
      rangeBounds.rangeEnd,
    );
  }, [event, tz, rangeBounds.rangeStart, rangeBounds.rangeEnd]);

  const occByYmd = useMemo(() => {
    const m = new Map<string, (typeof occurrences)[0]>();
    for (const o of occurrences) m.set(o.dateYmd, o);
    return m;
  }, [occurrences]);

  const calendarCells = useMemo(() => {
    const leading = dowOfMonthFirst(ym.year, ym.month, tz);
    const { lastDay } = monthMeta(ym.year, ym.month);
    const cells: { day: number | null }[] = [];
    for (let i = 0; i < leading; i++) cells.push({ day: null });
    for (let d = 1; d <= lastDay; d++) cells.push({ day: d });
    while (cells.length % 7 !== 0 || cells.length < 42) cells.push({ day: null });
    return cells;
  }, [ym.year, ym.month, tz]);

  const [pending, startTransition] = useTransition();

  const run = useCallback(
    (fn: () => Promise<void>) => {
      startTransition(() => {
        void (async () => {
          try {
            await fn();
          } catch (e) {
            alert(e instanceof Error ? e.message : "Something went wrong.");
          }
        })();
      });
    },
    [startTransition],
  );

  const selOcc = selectedYmd ? occByYmd.get(selectedYmd) : undefined;

  const [editStartLocal, setEditStartLocal] = useState("");
  const [editEndLocal, setEditEndLocal] = useState("");

  useEffect(() => {
    if (!selOcc) {
      setEditStartLocal("");
      setEditEndLocal("");
      return;
    }
    setEditStartLocal(isoSliceForDatetimeLocal(selOcc.starts_at));
    setEditEndLocal(isoSliceForDatetimeLocal(selOcc.ends_at));
  }, [selOcc]);

  if (!event) return null;

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label={`Calendar for ${event.title}`}>
      <button type="button" className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" aria-label="Close backdrop" onClick={onClose} />
      <div
        className="relative ml-auto flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-[#ebe7f7] bg-white shadow-[0_0_60px_-20px_rgba(76,29,149,0.45)] md:rounded-l-[26px]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 z-10 flex items-start gap-4 border-b border-[#f1eefc] bg-white px-6 py-5">
          <div className="flex flex-1 flex-col gap-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#94a3b8]">Series calendar</p>
            <h2 className="text-xl font-semibold tracking-tight text-[#0f172a]">{event.title}</h2>
            {event.description ? <p className="max-h-16 overflow-auto text-[13px] leading-relaxed text-[#64748b]">{event.description}</p> : null}
            {event.cancelled_at ? (
              <span className="mt-2 inline-flex max-w-fit rounded-full bg-rose-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-rose-800">
                Listing cancelled everywhere
              </span>
            ) : null}
          </div>
          <button
            type="button"
            className="rounded-full border border-transparent p-2 text-[#64748b] hover:border-[#ebe7f7] hover:bg-[#fafbff] hover:text-[#0f172a]"
            onClick={onClose}
          >
            <X className="h-6 w-6" aria-hidden />
          </button>
        </header>

        <div className="flex flex-1 flex-col px-6 py-5">
          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full border-[#ebe7f7]"
              disabled={pending}
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
            <span className="flex items-center gap-2 text-[15px] font-semibold text-[#0f172a]">
              <CalendarRange className="h-5 w-5 text-[#7c3aed]" aria-hidden />
              {new Date(ym.year, ym.month - 1, 1).toLocaleString(undefined, { month: "long", year: "numeric" })}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full border-[#ebe7f7]"
              disabled={pending}
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
          <p className="mt-2 text-[12px] leading-relaxed text-[#64748b]">
            Days with this show pulse in violet. Venue timezone baseline:{" "}
            <span className="font-semibold text-[#475569]">{tz}</span>. Timing edits render in{" "}
            <span className="font-semibold text-[#475569]">your browser timezone</span>—that&apos;s deliberate for quicker edits today.
          </p>

          <div className="mt-6 grid grid-cols-7 gap-y-4 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">
            <span>Sun</span>
            <span>Mon</span>
            <span>Tue</span>
            <span>Wed</span>
            <span>Thu</span>
            <span>Fri</span>
            <span>Sat</span>
          </div>

          <div className="mt-3 grid grid-cols-7 gap-2">
            {calendarCells.map((cell, idx) => {
              if (!cell.day) {
                return <div key={`pad-${idx}`} className="h-11" />;
              }
              const dateYmd = `${ym.year}-${String(ym.month).padStart(2, "0")}-${String(cell.day).padStart(2, "0")}`;
              const occ = occByYmd.get(dateYmd);
              const highlighted = Boolean(occ);
              const skipped = Boolean(occ?.skipped);
              const selected = selectedYmd === dateYmd;
              return (
                <button
                  key={dateYmd}
                  type="button"
                  disabled={!highlighted || Boolean(event.cancelled_at)}
                  aria-label={`${cell.day}${highlighted ? ", event occurrence" : ""}`}
                  onClick={() => {
                    if (highlighted && !event.cancelled_at) setSelectedYmd(dateYmd);
                  }}
                  className={cn(
                    "flex aspect-square max-h-[3.25rem] flex-col items-center justify-center rounded-2xl text-sm font-semibold transition-colors",
                    !highlighted && "cursor-default rounded-xl text-[#cbd5e1]",
                    highlighted && !skipped && !event.cancelled_at && "border border-[#c4b5fd] bg-[#f5f3ff] text-[#5b21b6] hover:bg-[#ede9fe]",
                    highlighted &&
                      skipped &&
                      "border border-rose-200 bg-rose-50 text-rose-800 line-through decoration-rose-900/70",
                    event.cancelled_at && highlighted && "cursor-default opacity-40",
                    selected &&
                      highlighted &&
                      !event.cancelled_at &&
                      "shadow-[inset_0_0_0_2px_#6366f1] ring-2 ring-[#c7d2fe] ring-offset-1",
                  )}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>

          {selOcc && !event.cancelled_at ? (
            <section className="rounded-2xl border border-[#ede9fe] bg-[#fafbff]/95 p-4">
              <h3 className="text-[13px] font-semibold text-[#0f172a]">
                {selectedYmd}
                {selOcc.override ? (
                  <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-900">
                    Custom time
                  </span>
                ) : null}
                {selOcc.skipped ? (
                  <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-rose-800">
                    Skipped
                  </span>
                ) : null}
              </h3>
              <p className="mt-1 text-[12px] text-[#64748b]">
                Stored instants:&nbsp;
                <span className="font-mono">{new Date(selOcc.starts_at).toLocaleString()}</span>
                {" → "}
                <span className="font-mono">{new Date(selOcc.ends_at).toLocaleString()}</span>
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {selOcc.skipped ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pending}
                    className="rounded-full border-[#bbf7d0] text-emerald-800"
                    onClick={() =>
                      run(async () => {
                        if (!selectedYmd) return;
                        await toggleBusinessEventOccurrenceSkipped({
                          businessId,
                          eventId: event.id,
                          dateYmd: selectedYmd,
                          skip: false,
                        });
                      })
                    }
                  >
                    Bring night back
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pending}
                    className="rounded-full border-rose-200 text-rose-800"
                    onClick={() =>
                      run(async () => {
                        if (!selectedYmd) return;
                        await toggleBusinessEventOccurrenceSkipped({
                          businessId,
                          eventId: event.id,
                          dateYmd: selectedYmd,
                          skip: true,
                        });
                      })
                    }
                  >
                    Skip this night
                  </Button>
                )}
              </div>

              <div className="mt-6 space-y-3 border-t border-[#ebe7f7]/70 pt-4">
                <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#64748b]">Override times for this tile</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-[11px] font-semibold uppercase text-[#64748b]" htmlFor="ev-ov-start">
                      Starts
                    </label>
                    <input
                      id="ev-ov-start"
                      type="datetime-local"
                      value={editStartLocal}
                      onChange={(e) => setEditStartLocal(e.target.value)}
                      className="mt-1 h-10 w-full rounded-xl border border-[#ebe7f7] px-2 text-[13px]"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold uppercase text-[#64748b]" htmlFor="ev-ov-end">
                      Ends
                    </label>
                    <input
                      id="ev-ov-end"
                      type="datetime-local"
                      value={editEndLocal}
                      onChange={(e) => setEditEndLocal(e.target.value)}
                      className="mt-1 h-10 w-full rounded-xl border border-[#ebe7f7] px-2 text-[13px]"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button
                    type="button"
                    disabled={pending || !selectedYmd || !editStartLocal || !editEndLocal}
                    className="rounded-full font-semibold"
                    onClick={() =>
                      run(async () => {
                        if (!selectedYmd || !editStartLocal || !editEndLocal) return;
                        await upsertBusinessEventInstanceOverrideTimes({
                          businessId,
                          eventId: event.id,
                          dateYmd: selectedYmd,
                          startsAtIso: new Date(editStartLocal).toISOString(),
                          endsAtIso: new Date(editEndLocal).toISOString(),
                        });
                      })
                    }
                  >
                    Save this night&apos;s timing
                  </Button>
                  {selOcc.override ? (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={pending || !selectedYmd}
                      className="rounded-full text-[#64748b]"
                      onClick={() =>
                        run(async () => {
                          if (!selectedYmd) return;
                          await clearBusinessEventInstanceOverride({
                            businessId,
                            eventId: event.id,
                            dateYmd: selectedYmd,
                          });
                        })
                      }
                    >
                      Undo custom · revert to series pattern
                    </Button>
                  ) : null}
                </div>
              </div>
            </section>
          ) : !event.cancelled_at ? (
            <section className="rounded-2xl border border-dashed border-[#ddd6fe] bg-white/80 p-6 text-[13px] text-[#64748b]">
              Tap any highlighted tile to skip a night or set one-off timings.
            </section>
          ) : null}

          <div className={cn("border-t border-[#f1eefc] pt-6 pb-16", selOcc ? "mt-6" : "mt-10")}>
            <p className="text-[13px] font-semibold text-[#0f172a]">Whole series actions</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {!event.cancelled_at ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  className="rounded-full border-rose-300 text-rose-800"
                  onClick={() =>
                    run(async () => {
                      const why = window.prompt("Optional cancellation note?");
                      await cancelBusinessEvent(businessId, event.id, why ?? undefined);
                    })
                  }
                >
                  Cancel entire listing
                </Button>
              ) : (
                <p className="text-[13px] leading-relaxed text-[#64748b]">
                  Use Restore on the bookings list outside this drawer once you&apos;re ready to publish every night again.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
