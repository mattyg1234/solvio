import type { PublicAppointmentHour, PublicAppointmentSlotException } from "@/lib/booking-public-context";
import { BOOKING_PUBLIC_WEEKDAY_SHORT } from "@/lib/booking-public-context";
import { coerceValidIanaTimeZone } from "@/lib/safe-timezone";

export type AppointmentSlotChoice = {
  /** Sent with the form (`preferred_time`) — human-readable for inbox. */
  value: string;
  /** Shorter label shown in dropdown. */
  label: string;
  /** Canonical slot start HH:MM in venue-local wall clock (matches exceptions). */
  slotStartHm: string;
};

/**
 * Postgres / Solvio weekday: 0 = Sunday … 6 = Saturday (`extract(dow)` style).
 */
export function dowSundayZeroInBusinessTZ(dateYmd: string, ianaTz: string): number {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateYmd);
  if (!parts) return 0;
  const y = Number(parts[1]);
  const mo = Number(parts[2]);
  const d = Number(parts[3]);
  const utcMid = Date.UTC(y, mo - 1, d, 12, 0, 0);
  const zone = coerceValidIanaTimeZone(ianaTz);
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "short" }).format(new Date(utcMid));
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[wd] ?? 0;
}

/** YYYY-MM-DD in a given IANA zone, anchored at noon UTC + day delta — stable for DST edges. */
export function calendarYmdInZone(utcMidAnchorMs: number, ianaTz: string): string {
  const zone = coerceValidIanaTimeZone(ianaTz);
  const s = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(utcMidAnchorMs));
  return s;
}

/** Add whole calendar days within the venue TZ (approximation via midday UTC steps). */
export function addDaysYmdInVenueZone(anchorYmd: string, deltaDays: number, ianaTz: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(anchorYmd.trim());
  if (!m) return anchorYmd.trim();
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const ms = Date.UTC(y, mo - 1, d, 12, 0, 0) + deltaDays * 86400000;
  return calendarYmdInZone(ms, ianaTz);
}

/** Seven calendar dates Sun→Sat covering `anchorYmd`, interpreted in venue TZ (matches Solvio weekdays). */
export function weekSevenDaysSundayStart(anchorYmd: string, ianaTz: string): string[] {
  const dow = dowSundayZeroInBusinessTZ(anchorYmd, ianaTz);
  const sunday = addDaysYmdInVenueZone(anchorYmd, -dow, ianaTz);
  return Array.from({ length: 7 }, (_, i) => addDaysYmdInVenueZone(sunday, i, ianaTz));
}

/** Normalize Postgres time / picker values to canonical HH:MM. */
export function normalizeSlotStartHm(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(raw.trim());
  if (!m) return null;
  let hh = Number(m[1]);
  let mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  hh = Math.max(0, Math.min(23, hh));
  mm = Math.max(0, Math.min(59, mm));
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function clockToMinutes(clock: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(clock.trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function minutesToClock(total: number): string {
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function intervalsForHourRow(row: PublicAppointmentHour): Array<{ start: number; end: number }> {
  const openM = clockToMinutes(row.open_time);
  const closeM = clockToMinutes(row.close_time);
  const step = row.slot_minutes;
  if (openM === null || closeM === null || step <= 0) return [];
  if (closeM <= openM) return [];
  const intervals: Array<{ start: number; end: number }> = [];
  for (let s = openM; s + step <= closeM; s += step) {
    intervals.push({ start: s, end: s + step });
  }
  return intervals;
}

function exceptionsForAppointmentDay(dateYmd: string, all: PublicAppointmentSlotException[]): PublicAppointmentSlotException[] {
  return all.filter((e) => e.exception_date.trim() === dateYmd.trim());
}

function blockedSlotHmSet(dayExceptions: PublicAppointmentSlotException[]): { wholeDay: boolean; hm: Set<string> } {
  if (dayExceptions.some((x) => !x.slot_start)) {
    return { wholeDay: true, hm: new Set() };
  }
  const hm = new Set<string>();
  for (const x of dayExceptions) {
    const n = normalizeSlotStartHm(x.slot_start ?? "");
    if (n) hm.add(n);
  }
  return { wholeDay: false, hm };
}

/**
 * Discrete slot intervals for dashboards (square grid / painting).
 */
export function buildAppointmentSlotsForPainting(
  row: PublicAppointmentHour | undefined,
): Array<{ slotStartHm: string; slotEndHm: string; labelHm: string }> {
  if (!row) return [];
  const intervals = intervalsForHourRow(row);
  return intervals.map(({ start, end }) => {
    const a = minutesToClock(start);
    const b = minutesToClock(end);
    return { slotStartHm: a, slotEndHm: b, labelHm: `${a}–${b}` };
  });
}

/** Which slot-start times are unavailable for bookings for this venue-local date (removed + cancelled). */
export function getUnavailableSlotStartsHm(dateYmd: string, exceptions: PublicAppointmentSlotException[]): {
  wholeDay: boolean;
  hm: Set<string>;
} {
  return blockedSlotHmSet(exceptionsForAppointmentDay(dateYmd, exceptions));
}

/**
 * Public booking: convert a preferred calendar day + recurring hours into selectable slots.
 * Exceptions remove slots from inventory (both removed + cancelled behave as unavailable for picks).
 */
export function buildAppointmentSlotChoices(
  dateYmd: string,
  row: PublicAppointmentHour | undefined,
  venueTimeZone: string,
  exceptions: PublicAppointmentSlotException[] | undefined,
): AppointmentSlotChoice[] {
  if (!row) return [];
  const unavailable = blockedSlotHmSet(exceptionsForAppointmentDay(dateYmd.trim(), exceptions ?? []));
  if (unavailable.wholeDay) return [];
  const dow = BOOKING_PUBLIC_WEEKDAY_SHORT[row.weekday];
  const intervals = intervalsForHourRow(row);
  const tz = coerceValidIanaTimeZone(venueTimeZone);

  const out: AppointmentSlotChoice[] = [];
  for (const { start, end } of intervals) {
    const a = minutesToClock(start);
    const b = minutesToClock(end);
    if (unavailable.hm.has(a)) continue;
    out.push({
      slotStartHm: a,
      value: `${dateYmd.trim()} · ${a}–${b} (${tz})`,
      label: `${dow} ${dateYmd.trim()} · ${a}–${b}`,
    });
  }
  return out;
}
