"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarRange, Users, X } from "lucide-react";

import { callVenueCalendarGuestAction } from "@/app/dashboard/bookings/guest-call-actions";
import { EditBookingDialog } from "@/components/dashboard/edit-booking-dialog";
import { EventSeriesCalendarSheet, type SheetBusinessEventRow } from "@/components/dashboard/event-series-calendar-sheet";
import { GuestAiCallButton } from "@/components/dashboard/guest-ai-call-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  buildMonthCalendarSummaries,
  dowOfMonthFirst,
  formatBookingTimeRange,
  formatCalendarDayLabel,
  monthMeta,
  type CalendarBookingRow,
  type CalendarEventRow,
  type DayCalendarSummary,
} from "@/lib/bookings-calendar-aggregate";
import { formatYmdInTimeZone } from "@/lib/business-event-occurrences";
import { coerceValidIanaTimeZone } from "@/lib/safe-timezone";
import { cn } from "@/lib/utils";

type BookingsOverviewCalendarProps = {
  businessId: string;
  businessName: string;
  venueTimeZone: string;
  events: CalendarEventRow[];
  bookings: CalendarBookingRow[];
  tables: { id: string; label: string }[];
  eventOptions: { id: string; title: string }[];
};

function todayYmd(timeZone: string): string {
  return formatYmdInTimeZone(new Date(), coerceValidIanaTimeZone(timeZone));
}

function BookingsDayDetailSheet({
  day,
  businessName,
  venueTimeZone,
  tables,
  eventOptions,
  eventsById,
  onClose,
  onManageEvent,
}: {
  day: DayCalendarSummary;
  businessName: string;
  venueTimeZone: string;
  tables: { id: string; label: string }[];
  eventOptions: { id: string; title: string }[];
  eventsById: Map<string, CalendarEventRow>;
  onClose: () => void;
  onManageEvent: (event: CalendarEventRow) => void;
}) {
  const dayBookings = day.allBookings ?? [];

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label={`Bookings for ${day.dateYmd}`}>
      <button type="button" className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" aria-label="Close" onClick={onClose} />
      <div
        className="relative ml-auto flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-[#ebe7f7] bg-white shadow-[0_0_60px_-20px_rgba(76,29,149,0.45)] md:rounded-l-[26px]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 z-10 flex items-start gap-4 border-b border-[#f1eefc] bg-white px-6 py-5">
          <div className="flex flex-1 flex-col gap-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#94a3b8]">Day overview</p>
            <h2 className="text-xl font-semibold tracking-tight text-[#0f172a]">{formatCalendarDayLabel(day.dateYmd, venueTimeZone)}</h2>
            <p className="text-sm text-[#64748b]">
              <span className="font-semibold text-[#5b21b6]">{day.totalGuests}</span> guests across{" "}
              <span className="font-semibold text-[#0f172a]">{day.bookingCount}</span> booking
              {day.bookingCount === 1 ? "" : "s"}
              {day.events.length ? (
                <>
                  {" "}
                  · <span className="font-semibold text-[#0f172a]">{day.events.length}</span> event
                  {day.events.length === 1 ? "" : "s"}
                </>
              ) : null}
            </p>
          </div>
          <button
            type="button"
            className="rounded-full border border-transparent p-2 text-[#64748b] hover:border-[#ebe7f7] hover:bg-[#fafbff]"
            onClick={onClose}
          >
            <X className="h-6 w-6" aria-hidden />
          </button>
        </header>

        <div className="flex flex-1 flex-col gap-6 px-6 py-5 pb-16">
          {day.events.length > 0 ? (
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-[#94a3b8]">Events</h3>
              {day.events.map((ev) => {
                const full = eventsById.get(ev.eventId);
                const capLabel =
                  ev.capacity != null && ev.capacity > 0
                    ? `${ev.bookedGuests} / ${ev.capacity} guests`
                    : `${ev.bookedGuests} guest${ev.bookedGuests === 1 ? "" : "s"}`;
                return (
                  <div
                    key={`${ev.eventId}-${ev.dateYmd}`}
                    className={cn(
                      "rounded-2xl border px-4 py-4",
                      ev.skipped ? "border-rose-200 bg-rose-50/80" : "border-[#ddd6fe] bg-[#faf7ff]",
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[#0f172a]">{ev.title}</p>
                        <p className="mt-1 text-sm text-[#64748b]">
                          {formatBookingTimeRange(ev.startsAt, ev.endsAt, venueTimeZone)}
                        </p>
                        <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/80 px-2.5 py-1 text-xs font-semibold text-[#5b21b6]">
                          <Users className="h-3.5 w-3.5" aria-hidden />
                          {capLabel}
                          {ev.bookingCount > 0 ? ` · ${ev.bookingCount} booking${ev.bookingCount === 1 ? "" : "s"}` : ""}
                        </p>
                        {ev.skipped ? (
                          <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-rose-800">Cancelled night</p>
                        ) : null}
                      </div>
                      {full ? (
                        <button
                          type="button"
                          onClick={() => onManageEvent(full)}
                          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "rounded-full border-[#c4b5fd] text-[#5b21b6]")}
                        >
                          Manage event
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </section>
          ) : null}

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-[#94a3b8]">Bookings</h3>
              <Link
                href="/dashboard/bookings?tab=guests&view=confirmed"
                className="text-xs font-semibold text-[#7c3aed] hover:underline"
              >
                Open full diary →
              </Link>
            </div>

            {!dayBookings.length ? (
              <p className="rounded-2xl border border-dashed border-[#ddd6fe] bg-[#fafbff] px-4 py-6 text-sm text-[#64748b]">
                No confirmed bookings on this day yet — events may still be scheduled.
              </p>
            ) : (
              <ul className="space-y-3">
                {dayBookings.map((b) => (
                  <li key={b.id} className="rounded-2xl border border-[#ebe7f7] bg-white px-4 py-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-[#0f172a]">{b.guest_name}</p>
                        <p className="mt-0.5 text-sm text-[#64748b]">{b.title || "Booking"}</p>
                        <p className="mt-1 text-sm font-medium text-[#475569]">
                          {formatBookingTimeRange(b.starts_at, b.ends_at, venueTimeZone)}
                        </p>
                        <p className="mt-2 text-xs text-[#94a3b8]">
                          Party of {b.guest_count ?? 1}
                          {b.guest_phone?.trim() ? ` · ${b.guest_phone}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <EditBookingDialog
                          booking={{
                            id: b.id,
                            guest_name: b.guest_name,
                            guest_email: b.guest_email,
                            guest_phone: b.guest_phone,
                            guest_count: b.guest_count,
                            starts_at: b.starts_at,
                            ends_at: b.ends_at,
                            floor_plan_table_id: b.floor_plan_table_id,
                            business_event_id: b.business_event_id,
                            booking_kind: b.booking_kind,
                            internal_notes: b.internal_notes,
                            title: b.title,
                          }}
                          businessName={businessName}
                          venueTimeZone={venueTimeZone}
                          tables={tables}
                          events={eventOptions}
                          onNotifyGuest={({ purpose, changeSummary, customScript }) =>
                            callVenueCalendarGuestAction({
                              venueCalendarBookingId: b.id,
                              purpose,
                              changeSummary,
                              customScript,
                            })
                          }
                        />
                        <GuestAiCallButton
                          guestName={b.guest_name}
                          guestPhone={b.guest_phone}
                          bookingLabel={b.title || "Booking"}
                          triggerLabel="AI call"
                          triggerClassName="h-8 rounded-full px-3 text-[11px]"
                          onCall={({ purpose, changeSummary, customScript }) =>
                            callVenueCalendarGuestAction({
                              venueCalendarBookingId: b.id,
                              purpose,
                              changeSummary,
                              customScript,
                            })
                          }
                        />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

export function BookingsOverviewCalendar({
  businessId,
  businessName,
  venueTimeZone,
  events,
  bookings,
  tables,
  eventOptions,
}: BookingsOverviewCalendarProps) {
  const tz = coerceValidIanaTimeZone(venueTimeZone);
  const today = todayYmd(tz);

  const initialYmd = today.split("-").map((x) => Number(x));
  const [ym, setYm] = useState(() => ({ year: initialYmd[0]!, month: initialYmd[1]! }));
  const [selectedDay, setSelectedDay] = useState<DayCalendarSummary | null>(null);
  const [manageEvent, setManageEvent] = useState<SheetBusinessEventRow | null>(null);

  const eventsById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);

  const summaries = useMemo(
    () =>
      buildMonthCalendarSummaries({
        year: ym.year,
        month: ym.month,
        timeZone: tz,
        events,
        bookings,
      }),
    [ym.year, ym.month, tz, events, bookings],
  );

  const enrichedSummaries = useMemo(() => {
    const activeBookings = bookings.filter((b) => b.status !== "cancelled");
    const byYmd = new Map<string, CalendarBookingRow[]>();
    for (const b of activeBookings) {
      const ymd = formatYmdInTimeZone(new Date(b.starts_at), tz);
      const prev = byYmd.get(ymd) ?? [];
      prev.push(b);
      byYmd.set(ymd, prev);
    }
    const out = new Map(summaries);
    for (const [ymd, summary] of summaries) {
      out.set(ymd, { ...summary, allBookings: byYmd.get(ymd) ?? [] });
    }
    return out;
  }, [summaries, bookings, tz]);

  const calendarCells = useMemo(() => {
    const leading = dowOfMonthFirst(ym.year, ym.month, tz);
    const { lastDay } = monthMeta(ym.year, ym.month);
    const cells: { day: number | null }[] = [];
    for (let i = 0; i < leading; i++) cells.push({ day: null });
    for (let d = 1; d <= lastDay; d++) cells.push({ day: d });
    while (cells.length % 7 !== 0 || cells.length < 42) cells.push({ day: null });
    return cells;
  }, [ym.year, ym.month, tz]);

  const monthGuestTotal = useMemo(() => {
    let total = 0;
    for (const s of enrichedSummaries.values()) total += s.totalGuests;
    return total;
  }, [enrichedSummaries]);

  function openDay(dateYmd: string) {
    const summary = enrichedSummaries.get(dateYmd);
    if (summary) setSelectedDay(summary);
  }

  return (
    <>
      <section className="overflow-hidden rounded-[28px] border border-[#ebe7f7] bg-gradient-to-b from-[#faf7ff] to-white shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#f1eefc] px-5 py-5 md:px-8">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#94a3b8]">Booking calendar</p>
            <h2 className="mt-1 text-xl font-semibold text-[#0f172a] md:text-2xl">Events &amp; guest headcount</h2>
            <p className="mt-1 text-sm text-[#64748b]">
              Tap a day to view bookings, times, and manage events for <span className="font-semibold">{businessName}</span>.
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
            <span className="flex min-w-[10rem] items-center justify-center gap-2 text-[15px] font-semibold text-[#0f172a]">
              <CalendarRange className="h-5 w-5 text-[#7c3aed]" aria-hidden />
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
        </header>

        <div className="px-5 py-5 md:px-8 md:py-6">
          <div className="mb-4 flex flex-wrap items-center gap-4 text-xs text-[#64748b]">
            <span>
              This month: <span className="font-semibold text-[#5b21b6]">{monthGuestTotal}</span> guests booked
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#7c3aed]" aria-hidden />
              Event or booking day
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full ring-2 ring-[#7c3aed] ring-offset-1" aria-hidden />
              Today
            </span>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-[#94a3b8] md:gap-2">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <span key={d} className="py-1">
                {d}
              </span>
            ))}
          </div>

          <div className="mt-2 grid grid-cols-7 gap-1 md:gap-2">
            {calendarCells.map((cell, idx) => {
              if (!cell.day) {
                return <div key={`pad-${idx}`} className="min-h-[5.5rem] md:min-h-[6.5rem]" />;
              }
              const dateYmd = `${ym.year}-${String(ym.month).padStart(2, "0")}-${String(cell.day).padStart(2, "0")}`;
              const summary = enrichedSummaries.get(dateYmd);
              const isToday = dateYmd === today;
              const hasActivity = Boolean(summary);
              const previewEvents = summary?.events.filter((e) => !e.skipped).slice(0, 2) ?? [];

              return (
                <button
                  key={dateYmd}
                  type="button"
                  disabled={!hasActivity}
                  onClick={() => openDay(dateYmd)}
                  aria-label={`${cell.day}${hasActivity ? `, ${summary!.totalGuests} guests, ${summary!.bookingCount} bookings` : ""}`}
                  className={cn(
                    "flex min-h-[5.5rem] flex-col rounded-2xl border p-2 text-left transition-colors md:min-h-[6.5rem] md:p-2.5",
                    !hasActivity && "cursor-default border-transparent bg-transparent text-[#cbd5e1]",
                    hasActivity &&
                      "border-[#ddd6fe] bg-white hover:border-[#c4b5fd] hover:bg-[#faf7ff] hover:shadow-sm",
                    isToday && hasActivity && "ring-2 ring-[#7c3aed] ring-offset-1",
                  )}
                >
                  <div className="flex items-start justify-between gap-1">
                    <span
                      className={cn(
                        "text-sm font-semibold",
                        isToday ? "text-[#7c3aed]" : hasActivity ? "text-[#0f172a]" : "text-[#cbd5e1]",
                      )}
                    >
                      {cell.day}
                    </span>
                    {hasActivity && summary!.totalGuests > 0 ? (
                      <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-[#ede9fe] px-1.5 py-0.5 text-[10px] font-bold text-[#5b21b6] md:text-[11px]">
                        <Users className="h-3 w-3" aria-hidden />
                        {summary!.totalGuests}
                      </span>
                    ) : null}
                  </div>

                  {hasActivity ? (
                    <div className="mt-1.5 flex flex-1 flex-col gap-1 overflow-hidden">
                      {previewEvents.map((ev) => (
                        <span
                          key={`${ev.eventId}-${ev.dateYmd}`}
                          className="truncate rounded-md bg-[#f5f3ff] px-1.5 py-0.5 text-[10px] font-medium text-[#5b21b6] md:text-[11px]"
                          title={ev.title}
                        >
                          {ev.title}
                          {ev.bookedGuests > 0 ? ` · ${ev.bookedGuests}` : ""}
                        </span>
                      ))}
                      {summary!.standaloneBookings.length > 0 && previewEvents.length < 2 ? (
                        <span className="truncate text-[10px] text-[#64748b] md:text-[11px]">
                          {summary!.standaloneBookings.length} other booking
                          {summary!.standaloneBookings.length === 1 ? "" : "s"}
                        </span>
                      ) : null}
                      {(summary!.events.length > 2 || (summary!.events.length >= 2 && summary!.standaloneBookings.length > 0)) &&
                      summary!.bookingCount > 2 ? (
                        <span className="text-[10px] font-semibold text-[#94a3b8]">+ more</span>
                      ) : null}
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {selectedDay ? (
        <BookingsDayDetailSheet
          day={selectedDay}
          businessName={businessName}
          venueTimeZone={venueTimeZone}
          tables={tables}
          eventOptions={eventOptions}
          eventsById={eventsById}
          onClose={() => setSelectedDay(null)}
          onManageEvent={(ev) => {
            setSelectedDay(null);
            setManageEvent({
              id: ev.id,
              title: ev.title,
              description: null,
              starts_at: ev.starts_at,
              ends_at: ev.ends_at,
              recurrence: ev.recurrence,
              cancelled_at: ev.cancelled_at,
            });
          }}
        />
      ) : null}

      <EventSeriesCalendarSheet
        event={manageEvent}
        businessId={businessId}
        venueTimeZone={venueTimeZone}
        onClose={() => setManageEvent(null)}
      />
    </>
  );
}
