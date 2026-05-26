import type {
  PublicAppointmentBookedSlot,
  PublicAppointmentHour,
  PublicAppointmentSlotException,
} from "@/lib/booking-public-context";
import { BOOKING_PUBLIC_WEEKDAY_SHORT } from "@/lib/booking-public-context";
import { isStaffWorkingOnWeekday, type StaffMember } from "@/lib/staff-members";
import { coerceValidIanaTimeZone } from "@/lib/safe-timezone";

export type AppointmentSlotChoice = {
  /** Sent with the form (`preferred_time`) — human-readable for inbox. */
  value: string;
  /** Shorter label shown in dropdown. */
  label: string;
  /** Canonical slot start HH:MM in venue-local wall clock (matches exceptions). */
  slotStartHm: string;
  slotEndHm: string;
};

export type AppointmentSlotStatus = "available" | "booked" | "break" | "blocked";

export type AppointmentSlotDisplay = AppointmentSlotChoice & {
  status: AppointmentSlotStatus;
  /** Compact label for grid cells, e.g. 9:00 */
  shortLabel: string;
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
  const normalized = normalizeSlotStartHm(clock);
  if (!normalized) return null;
  const m = /^(\d{2}):(\d{2})$/.exec(normalized);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
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

export type AppointmentBreak = {
  weekdays: number[];
  start_time: string;
  end_time: string;
};

function slotOverlapsBooking(
  slotStartMins: number,
  slotEndMins: number,
  booking: PublicAppointmentBookedSlot,
): boolean {
  const bStart = clockToMinutes(booking.slot_start);
  const bEnd = clockToMinutes(booking.slot_end);
  if (bStart === null || bEnd === null) return false;
  return bStart < slotEndMins && bEnd > slotStartMins;
}

/** Whether this slot is taken for the guest's staff choice. */
export function isAppointmentSlotBookedForGuest(params: {
  dateYmd: string;
  slotStartMins: number;
  slotEndMins: number;
  bookedSlots: PublicAppointmentBookedSlot[];
  preferredStaffName?: string | null;
  staffWorkingThatDay?: string[];
}): boolean {
  const dayBooked = params.bookedSlots.filter((b) => b.date === params.dateYmd.trim());

  function overlaps(b: PublicAppointmentBookedSlot): boolean {
    return slotOverlapsBooking(params.slotStartMins, params.slotEndMins, b);
  }

  if (params.preferredStaffName?.trim()) {
    const name = params.preferredStaffName.trim();
    return dayBooked.some((b) => {
      if (!overlaps(b)) return false;
      const assigned = b.staff_member?.trim() || null;
      return !assigned || assigned === name;
    });
  }

  const working = params.staffWorkingThatDay ?? [];
  if (working.length === 0) {
    return dayBooked.some(overlaps);
  }

  return !working.some(
    (name) =>
      !dayBooked.some((b) => {
        if (!overlaps(b)) return false;
        const assigned = b.staff_member?.trim() || null;
        return !assigned || assigned === name;
      }),
  );
}

/**
 * Full slot grid for a day — includes booked/break/blocked slots (shown struck-through in UI).
 */
export function buildAppointmentSlotGrid(params: {
  dateYmd: string;
  row: PublicAppointmentHour | undefined;
  venueTimeZone: string;
  exceptions?: PublicAppointmentSlotException[];
  breaks?: AppointmentBreak[];
  bookedSlots?: PublicAppointmentBookedSlot[];
  preferredStaffName?: string | null;
  staffWorkingThatDay?: string[];
}): AppointmentSlotDisplay[] {
  const { dateYmd, row, venueTimeZone } = params;
  if (!row) return [];

  const unavailable = blockedSlotHmSet(exceptionsForAppointmentDay(dateYmd.trim(), params.exceptions ?? []));
  if (unavailable.wholeDay) return [];

  const dow = BOOKING_PUBLIC_WEEKDAY_SHORT[row.weekday];
  const intervals = intervalsForHourRow(row);
  const tz = coerceValidIanaTimeZone(venueTimeZone);
  const dayDow = dowSundayZeroInBusinessTZ(dateYmd.trim(), venueTimeZone);
  const booked = params.bookedSlots ?? [];

  const out: AppointmentSlotDisplay[] = [];
  for (const { start, end } of intervals) {
    const a = minutesToClock(start);
    const b = minutesToClock(end);
    let status: AppointmentSlotStatus = "available";

    if (unavailable.hm.has(a)) {
      status = "blocked";
    } else if (
      params.breaks?.some((br) => {
        if (!br.weekdays.includes(dayDow)) return false;
        const bStart = clockToMinutes(br.start_time);
        const bEnd = clockToMinutes(br.end_time);
        return bStart !== null && bEnd !== null && start >= bStart && start < bEnd;
      })
    ) {
      status = "break";
    } else if (
      isAppointmentSlotBookedForGuest({
        dateYmd,
        slotStartMins: start,
        slotEndMins: end,
        bookedSlots: booked,
        preferredStaffName: params.preferredStaffName,
        staffWorkingThatDay: params.staffWorkingThatDay,
      })
    ) {
      status = "booked";
    }

    out.push({
      slotStartHm: a,
      slotEndHm: b,
      value: `${dateYmd.trim()} · ${a}–${b} (${tz})`,
      label: `${dow} ${dateYmd.trim()} · ${a}–${b}`,
      shortLabel: a,
      status,
    });
  }
  return out;
}

/** Validate a chosen slot value is still free before submit. */
export function validateAppointmentSlotSelection(params: {
  preferredTime: string;
  dateYmd: string;
  row: PublicAppointmentHour | undefined;
  venueTimeZone: string;
  exceptions?: PublicAppointmentSlotException[];
  breaks?: AppointmentBreak[];
  bookedSlots?: PublicAppointmentBookedSlot[];
  preferredStaffName?: string | null;
  staffWorkingThatDay?: string[];
}): { ok: true } | { ok: false; message: string } {
  const grid = buildAppointmentSlotGrid(params);
  const match = grid.find((s) => s.value === params.preferredTime.trim());
  if (!match) {
    return { ok: false, message: "Pick an available time slot from the grid." };
  }
  if (match.status !== "available") {
    return { ok: false, message: "That time was just taken — please choose another slot." };
  }
  return { ok: true };
}

/**
 * Available slots only — backwards-compatible wrapper around the full grid.
 */
export function buildAppointmentSlotChoices(
  dateYmd: string,
  row: PublicAppointmentHour | undefined,
  venueTimeZone: string,
  exceptions: PublicAppointmentSlotException[] | undefined,
  breaks?: AppointmentBreak[],
  bookedSlots?: PublicAppointmentBookedSlot[],
  preferredStaffName?: string | null,
  staffWorkingThatDay?: string[],
): AppointmentSlotChoice[] {
  return buildAppointmentSlotGrid({
    dateYmd,
    row,
    venueTimeZone,
    exceptions,
    breaks,
    bookedSlots,
    preferredStaffName,
    staffWorkingThatDay,
  }).filter((s) => s.status === "available");
}

export type AppointmentDayCalendarStatus = "past" | "no_hours" | "closed" | "full" | "bookable";

export type AppointmentDayCalendarSummary = {
  dateYmd: string;
  status: AppointmentDayCalendarStatus;
  staffNames: string[];
  availableCount: number;
};

/** Guest calendar cell — bookable days mirror hosted-event purple; closures use rose strikethrough. */
export function summarizeAppointmentDayForCalendar(params: {
  dateYmd: string;
  todayYmd: string;
  appointmentHours: PublicAppointmentHour[];
  venueTimeZone: string;
  exceptions: PublicAppointmentSlotException[];
  breaks?: AppointmentBreak[];
  bookedSlots?: PublicAppointmentBookedSlot[];
  staffMembers: StaffMember[];
}): AppointmentDayCalendarSummary {
  const dateYmd = params.dateYmd.trim();
  if (dateYmd < params.todayYmd.trim()) {
    return { dateYmd, status: "past", staffNames: [], availableCount: 0 };
  }

  const dow = dowSundayZeroInBusinessTZ(dateYmd, params.venueTimeZone);
  const hourRow = params.appointmentHours.find((h) => h.weekday === dow);
  const staffWorking = params.staffMembers.filter((m) => isStaffWorkingOnWeekday(m, dow));
  const staffNames = staffWorking.map((m) => m.name.trim()).filter(Boolean);

  if (!hourRow) {
    return { dateYmd, status: "no_hours", staffNames, availableCount: 0 };
  }

  const dayExceptions = params.exceptions.filter((e) => e.exception_date.trim() === dateYmd);
  if (dayExceptions.some((e) => !e.slot_start)) {
    return { dateYmd, status: "closed", staffNames, availableCount: 0 };
  }

  const slots = buildAppointmentSlotGrid({
    dateYmd,
    row: hourRow,
    venueTimeZone: params.venueTimeZone,
    exceptions: params.exceptions,
    breaks: params.breaks,
    bookedSlots: params.bookedSlots,
    preferredStaffName: null,
    staffWorkingThatDay: staffNames.length ? staffNames : params.staffMembers.map((m) => m.name),
  });

  const availableCount = slots.filter((s) => s.status === "available").length;
  if (slots.length === 0) {
    return { dateYmd, status: "no_hours", staffNames, availableCount: 0 };
  }
  if (availableCount === 0) {
    return { dateYmd, status: "full", staffNames, availableCount: 0 };
  }
  return { dateYmd, status: "bookable", staffNames, availableCount };
}

export function formatAppointmentStaffPreview(names: string[], max = 2): string | null {
  const clean = names.map((n) => n.trim()).filter(Boolean);
  if (!clean.length) return null;
  if (clean.length <= max) return clean.join(" · ");
  return `${clean.slice(0, max).join(" · ")} +${clean.length - max}`;
}
