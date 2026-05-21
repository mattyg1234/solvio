import { expandBusinessEventOccurrences, formatYmdInTimeZone } from "@/lib/business-event-occurrences";
import { coerceValidIanaTimeZone } from "@/lib/safe-timezone";

export type CalendarBookingRow = {
  id: string;
  title: string;
  booking_kind: string | null;
  starts_at: string;
  ends_at: string;
  guest_name: string;
  guest_email: string;
  guest_phone: string | null;
  guest_count: number | null;
  floor_plan_table_id: string | null;
  business_event_id: string | null;
  status: string;
  internal_notes: string | null;
};

export type CalendarEventRow = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  recurrence: unknown;
  cancelled_at: string | null;
  deleted_at: string | null;
  capacity?: number | null;
};

export type DayEventSummary = {
  eventId: string;
  title: string;
  dateYmd: string;
  startsAt: string;
  endsAt: string;
  bookedGuests: number;
  bookingCount: number;
  capacity: number | null;
  skipped: boolean;
};

export type DayCalendarSummary = {
  dateYmd: string;
  totalGuests: number;
  bookingCount: number;
  events: DayEventSummary[];
  /** Bookings not tied to a listed event occurrence (tables, appointments, manual). */
  standaloneBookings: CalendarBookingRow[];
  /** All active bookings on this day (filled by UI layer). */
  allBookings?: CalendarBookingRow[];
};

export function monthMeta(year: number, month1Indexed: number) {
  const lastDay = new Date(year, month1Indexed, 0).getDate();
  return { lastDay };
}

/** First-of-calendar-month weekday 0 = Sun … 6 = Sat, evaluated in `tz`. */
export function dowOfMonthFirst(year: number, month1Indexed: number, tz: string): number {
  const isoDay = `${year}-${String(month1Indexed).padStart(2, "0")}-01T14:30:00Z`;
  const d = new Date(isoDay);
  const wd = d.toLocaleDateString("en-US", { weekday: "short", timeZone: tz });
  const ix = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
  return ix >= 0 ? ix : 0;
}

function guestUnits(count: number | null | undefined): number {
  return typeof count === "number" && count > 0 ? count : 1;
}

function monthUtcBounds(year: number, month1Indexed: number) {
  const { lastDay } = monthMeta(year, month1Indexed);
  const y = year;
  const m = String(month1Indexed).padStart(2, "0");
  const paddedLast = String(lastDay).padStart(2, "0");
  return {
    rangeStart: new Date(`${y}-${m}-01T00:00:00Z`),
    rangeEnd: new Date(`${y}-${m}-${paddedLast}T23:59:59.999Z`),
    lastDay,
  };
}

export function buildMonthCalendarSummaries(params: {
  year: number;
  month: number;
  timeZone: string;
  events: CalendarEventRow[];
  bookings: CalendarBookingRow[];
  includeCancelledBookings?: boolean;
}): Map<string, DayCalendarSummary> {
  const tz = coerceValidIanaTimeZone(params.timeZone);
  const { rangeStart, rangeEnd, lastDay } = monthUtcBounds(params.year, params.month);

  const activeBookings = params.bookings.filter((b) => params.includeCancelledBookings || b.status !== "cancelled");

  const bookingsByYmd = new Map<string, CalendarBookingRow[]>();
  for (const b of activeBookings) {
    const ymd = formatYmdInTimeZone(new Date(b.starts_at), tz);
    const prev = bookingsByYmd.get(ymd) ?? [];
    prev.push(b);
    bookingsByYmd.set(ymd, prev);
  }

  const occurrencesByYmd = new Map<string, DayEventSummary[]>();
  for (const ev of params.events) {
    if (ev.cancelled_at || ev.deleted_at) continue;
    const occs = expandBusinessEventOccurrences(ev.starts_at, ev.ends_at, ev.recurrence, tz, rangeStart, rangeEnd);
    for (const occ of occs) {
      const dayBookings = (bookingsByYmd.get(occ.dateYmd) ?? []).filter((b) => b.business_event_id === ev.id);
      const bookedGuests = dayBookings.reduce((sum, b) => sum + guestUnits(b.guest_count), 0);
      const row: DayEventSummary = {
        eventId: ev.id,
        title: ev.title,
        dateYmd: occ.dateYmd,
        startsAt: occ.starts_at,
        endsAt: occ.ends_at,
        bookedGuests,
        bookingCount: dayBookings.length,
        capacity: ev.capacity ?? null,
        skipped: occ.skipped,
      };
      const prev = occurrencesByYmd.get(occ.dateYmd) ?? [];
      prev.push(row);
      occurrencesByYmd.set(occ.dateYmd, prev);
    }
  }

  const out = new Map<string, DayCalendarSummary>();
  for (let day = 1; day <= lastDay; day++) {
    const dateYmd = `${params.year}-${String(params.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dayBookings = bookingsByYmd.get(dateYmd) ?? [];
    const eventIdsOnDay = new Set((occurrencesByYmd.get(dateYmd) ?? []).map((e) => e.eventId));
    const standaloneBookings = dayBookings.filter((b) => !b.business_event_id || !eventIdsOnDay.has(b.business_event_id));
    const totalGuests = dayBookings.reduce((sum, b) => sum + guestUnits(b.guest_count), 0);

    if (dayBookings.length === 0 && !(occurrencesByYmd.get(dateYmd)?.length)) continue;

    out.set(dateYmd, {
      dateYmd,
      totalGuests,
      bookingCount: dayBookings.length,
      events: occurrencesByYmd.get(dateYmd) ?? [],
      standaloneBookings,
    });
  }

  return out;
}

export function formatCalendarDayLabel(dateYmd: string, timeZone: string): string {
  const tz = coerceValidIanaTimeZone(timeZone);
  const d = new Date(`${dateYmd}T12:00:00Z`);
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: tz,
  });
}

export function formatBookingTimeRange(startsAt: string, endsAt: string, timeZone: string): string {
  const tz = coerceValidIanaTimeZone(timeZone);
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.getTime())) return "—";
  const opts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit", timeZone: tz };
  const startStr = start.toLocaleTimeString(undefined, opts);
  if (Number.isNaN(end.getTime())) return startStr;
  const endStr = end.toLocaleTimeString(undefined, opts);
  return `${startStr} – ${endStr}`;
}
