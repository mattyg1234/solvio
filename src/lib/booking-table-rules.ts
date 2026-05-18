import type { BookingPublicContextPayload, PublicBusinessEvent, PublicFloorTable } from "@/lib/booking-public-context";
import { expandHostedEventForSubmit } from "@/lib/booking-hosted-submit";
import { dowSundayZeroInBusinessTZ } from "@/lib/booking-appointment-slots";

/** Same shape as weekday appointment rows minus slot granularity — used only for weekday open/close checks. */
export type TableWeekdayWindow = {
  weekday: number;
  open_time: string;
  close_time: string;
};

function activeHostedEvents(events: PublicBusinessEvent[]): PublicBusinessEvent[] {
  return events.filter((e) => !e.cancelled);
}

/**
 * Dates (venue-local YYYY-MM-DD) where a hosted show is booked and not skipped.
 * Used only when merchants opt in to blocking public table enquiries those nights.
 */
export function datesWithUpcomingHostedOccurrences(events: PublicBusinessEvent[], venueTz: string): Set<string> {
  const out = new Set<string>();
  for (const ev of activeHostedEvents(events)) {
    for (const oc of expandHostedEventForSubmit(ev, venueTz)) {
      out.add(oc.dateYmd);
    }
  }
  return out;
}

function venueAppointmentBars(ctx: BookingPublicContextPayload): TableWeekdayWindow[] {
  const out: TableWeekdayWindow[] = [];
  for (const h of ctx.appointment_hours) {
    out.push({
      weekday: h.weekday,
      open_time: h.open_time.trim(),
      close_time: h.close_time.trim(),
    });
  }
  return out;
}

function normalizeHm(t: string): string {
  const s = t.trim();
  const m = /^(\d{1,2}):(\d{2})/.exec(s);
  if (!m) return s;
  const hh = Number(m[1]);
  const mi = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mi)) return s;
  return `${hh.toString().padStart(2, "0")}:${mi.toString().padStart(2, "0")}`;
}

/**
 * Effective weekly windows:
 * — If `table.weekday_hours` non-empty → only those weekdays (others treated as closed for this table).
 * — Else fallback to venue `appointment_hours`; if neither defined → empty (skip weekday gates).
 */
export function effectiveBarsForFloorTable(preferredLabel: string, ctx: BookingPublicContextPayload): TableWeekdayWindow[] {
  const want = preferredLabel.trim();
  let tableRow: PublicFloorTable | undefined;
  if (want.length) {
    tableRow = ctx.tables.find((t) => t.label.trim() === want);
  }
  if (tableRow && tableRow.weekday_hours && tableRow.weekday_hours.length > 0) {
    return tableRow.weekday_hours.map((x) => ({
      weekday: x.weekday,
      open_time: normalizeHm(x.open_time),
      close_time: normalizeHm(x.close_time),
    }));
  }
  return venueAppointmentBars(ctx);
}

function hasOpenWindow(row: Pick<TableWeekdayWindow, "open_time" | "close_time">): boolean {
  const o = row.open_time;
  const c = row.close_time;
  if (!o || !c) return false;
  return normalizeHm(o) < normalizeHm(c);
}

/** True when weekday has at least one non-degenerate interval. */
export function isWeekdayInsideTableBookingWindows(
  dateYmd: string,
  venueTz: string,
  bars: TableWeekdayWindow[],
): boolean | null {
  if (!bars.length) return null;
  const dow = dowSundayZeroInBusinessTZ(dateYmd.trim(), venueTz);
  for (const b of bars) {
    if (b.weekday !== dow) continue;
    if (hasOpenWindow(b)) return true;
  }
  return false;
}

export function validateTableBookingSubmission(args: {
  ctx: BookingPublicContextPayload | null;
  bookingKind: string;
  preferredTableLabel: string;
  requestedDateYmd: string;
}): { ok: true } | { ok: false; message: string } {
  const kind = args.bookingKind.trim().toLowerCase();
  if (kind !== "table") return { ok: true };

  const ctx = args.ctx;
  if (!ctx) return { ok: false, message: "Booking page is unavailable." };

  const date = args.requestedDateYmd.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return {
      ok: false,
      message: "Pick a preferred date — we sync table requests against your diary and hosted nights.",
    };
  }

  const tz = ctx.venue_time_zone?.trim() || "UTC";

  if (ctx.booking_policies?.block_public_table_when_hosted_event_date) {
    const blocked = datesWithUpcomingHostedOccurrences(ctx.events, tz);
    if (blocked.has(date)) {
      return {
        ok: false,
        message:
          "We're not accepting table enquiries on nights that overlap your hosted lineup — choose another evening or browse the Events path when it's live.",
      };
    }
  }

  const bars = effectiveBarsForFloorTable(args.preferredTableLabel, ctx);
  const inside = isWeekdayInsideTableBookingWindows(date, tz, bars);
  if (inside === false) {
    const name = WEEKDAY_HELP[dowSundayZeroInBusinessTZ(date, tz)];
    const tableHint = args.preferredTableLabel.trim()
      ? ` for ${args.preferredTableLabel.trim()}`
      : "";
    return {
      ok: false,
      message: `${name}${tableHint} doesn't offer table bookings yet — tweak weekly hours under Dashboard → Bookings → Tables or pick another day.`,
    };
  }

  return { ok: true };
}

const WEEKDAY_HELP = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
