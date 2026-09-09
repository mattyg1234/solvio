import { timingSafeEqual } from "node:crypto";

/**
 * GetYourGuide Supplier API — pure helpers. The spec (Integrator Portal, read 9 Sept
 * 2026): JSON over HTTPS, HTTP Basic both ways, ALWAYS status 200 with either
 * { data } or { errorCode, errorMessage }, local datetimes with the activity's UTC
 * offset, ticket categories from a fixed list. See docs/gyg-supplier-api-requirements.md.
 */

export const GYG_CATEGORIES = ["ADULT", "CHILD", "YOUTH", "INFANT", "SENIOR", "STUDENT", "EU_CITIZEN", "MILITARY", "EU_CITIZEN_STUDENT", "COLLECTIVE", "GROUP"] as const;
export type GygCategory = (typeof GYG_CATEGORIES)[number];

export type GygErrorCode =
  | "AUTHORIZATION_FAILURE"
  | "INVALID_PRODUCT"
  | "VALIDATION_FAILURE"
  | "INTERNAL_SYSTEM_FAILURE"
  | "NO_AVAILABILITY"
  | "INVALID_TICKET_CATEGORY"
  | "INVALID_PARTICIPANTS_CONFIGURATION"
  | "INVALID_RESERVATION"
  | "INVALID_BOOKING"
  | "BOOKING_REDEEMED"
  | "BOOKING_IN_PAST"
  | "BOOKING_ALREADY_CANCELLED";

export type GygError = { errorCode: GygErrorCode; errorMessage: string } & Record<string, unknown>;

export function gygError(errorCode: GygErrorCode, errorMessage: string, extra: Record<string, unknown> = {}): GygError {
  return { errorCode, errorMessage, ...extra };
}

/** Constant-time HTTP Basic check. Empty configured credentials mean the endpoint is closed. */
export function basicAuthMatches(header: string | null | undefined, user: string | undefined, pass: string | undefined): boolean {
  if (!user || !pass) return false;
  const m = /^Basic\s+([A-Za-z0-9+/=]+)$/.exec(String(header ?? "").trim());
  if (!m) return false;
  let decoded = "";
  try {
    decoded = Buffer.from(m[1], "base64").toString("utf8");
  } catch {
    return false;
  }
  const idx = decoded.indexOf(":");
  if (idx < 0) return false;
  const expected = Buffer.from(`${user}:${pass}`, "utf8");
  const got = Buffer.from(decoded, "utf8");
  if (expected.length !== got.length) return false;
  return timingSafeEqual(expected, got);
}

/** Canary shows and the UK tour keep their own clocks. */
export function zoneForIsland(island: string | null | undefined): string {
  return /^uk\b/i.test(String(island ?? "").trim()) ? "Europe/London" : "Atlantic/Canary";
}

/** "+01:00" style offset of a zone at a local date/time (offset taken at that day's noon). */
export function utcOffsetFor(dateIso: string, timeZone: string): string {
  const probe = new Date(`${dateIso}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, timeZoneName: "longOffset" }).formatToParts(probe);
  const raw = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = /GMT([+-]\d{2}:\d{2})?/.exec(raw);
  return m?.[1] ?? "+00:00";
}

/** Local show datetime in GYG's expected format: 2026-12-05T19:00:00+00:00. */
export function gygDateTime(showDate: string, showTime: string | null | undefined, island: string | null | undefined): string {
  const time = /^\d{2}:\d{2}/.test(String(showTime ?? "")) ? String(showTime).slice(0, 5) : "19:00";
  return `${showDate}T${time}:00${utcOffsetFor(showDate, zoneForIsland(island))}`;
}

/** GYG sends the local time with its offset; we key nights by the local date (and time) in the string. */
export function parseGygDateTime(value: unknown): { date: string; time: string | null } | null {
  const s = String(value ?? "").trim();
  const m = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.exec(s);
  if (!m) return null;
  return { date: m[1], time: m[2] ?? null };
}

export type PaxSplit = { adults: number; children: number; infants: number; total: number; groups: number };

export type ProductPricing = { pricingType: "individual" | "group"; groupSize: number | null };
const INDIVIDUAL: ProductPricing = { pricingType: "individual", groupSize: null };

/**
 * ADULT/CHILD/INFANT map to Solvio's three counts; other individual categories count as
 * adults. GROUP products take GROUP items only: each group books `groupSize` seats (the
 * item's own groupSize when GYG sends it, else the mapping's group size) and counts as
 * adults on the booking.
 */
export function bookingItemsToPax(items: unknown, pricing: ProductPricing = INDIVIDUAL): { ok: true; pax: PaxSplit } | { ok: false; error: GygError } {
  if (!Array.isArray(items) || !items.length) return { ok: false, error: gygError("VALIDATION_FAILURE", "bookingItems must be a non-empty array.") };
  const pax = { adults: 0, children: 0, infants: 0, total: 0, groups: 0 };
  const groupProduct = pricing.pricingType === "group";
  for (const raw of items) {
    const item = (raw ?? {}) as Record<string, unknown>;
    const category = String(item.category ?? "").toUpperCase();
    const count = Number(item.count);
    if (!GYG_CATEGORIES.includes(category as GygCategory)) {
      return { ok: false, error: gygError("INVALID_TICKET_CATEGORY", `The ticket category ${category || "(missing)"} is not sellable.`, { ticketCategory: category }) };
    }
    if (!Number.isInteger(count) || count < 0) return { ok: false, error: gygError("VALIDATION_FAILURE", `Invalid count for ${category}.`) };
    if (category === "GROUP") {
      if (!groupProduct) return { ok: false, error: gygError("INVALID_TICKET_CATEGORY", "This product is sold per person, not per group.", { ticketCategory: category }) };
      const size = Number.isInteger(Number(item.groupSize)) && Number(item.groupSize) > 0 ? Number(item.groupSize) : pricing.groupSize ?? 0;
      if (size < 1) return { ok: false, error: gygError("VALIDATION_FAILURE", "groupSize is required for GROUP items.") };
      if (pricing.groupSize && size > pricing.groupSize) {
        return { ok: false, error: gygError("INVALID_PARTICIPANTS_CONFIGURATION", `Groups take up to ${pricing.groupSize} people.`, { participantsConfiguration: { min: 1, max: pricing.groupSize } }) };
      }
      pax.groups += count;
      pax.adults += count * size;
      continue;
    }
    if (category === "COLLECTIVE" || groupProduct) {
      return { ok: false, error: gygError("INVALID_TICKET_CATEGORY", groupProduct ? "This product is sold per group; send GROUP items." : "Collective tickets are not sold for this product; book per person.", { ticketCategory: category }) };
    }
    if (category === "CHILD" || category === "YOUTH") pax.children += count;
    else if (category === "INFANT") pax.infants += count;
    else pax.adults += count;
  }
  pax.total = pax.adults + pax.children + pax.infants;
  if (pax.total < 1) return { ok: false, error: gygError("VALIDATION_FAILURE", "At least one participant is required.") };
  if (pax.adults + pax.children < 1) {
    return { ok: false, error: gygError("INVALID_PARTICIPANTS_CONFIGURATION", "At least one adult or child is required.", { participantsConfiguration: { min: 1, max: null } }) };
  }
  return { ok: true, pax };
}

export type NightSource = {
  capacity: number | null;
  runWeekdays: number[] | null;
  showTime: string | null;
  island: string;
  cutoffMinutes: number;
  /** time_point: the show starts at showTime. time_period: bookable for the date, opening times returned. */
  availabilityType?: "time_point" | "time_period";
  /** Length of the opening window for time-period products, from showTime. */
  periodMinutes?: number;
  /** GROUP pricing: vacancies are whole groups of this many seats. */
  groupSize?: number | null;
};

export type GygAvailability = { dateTime: string; productId: string; cutoffSeconds: number; vacancies: number; openingTimes?: Array<{ fromTime: string; toTime: string }> };

function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = Math.min(23 * 60 + 59, h * 60 + m + minutes);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Which nights exist in a range: the product's weekly pattern plus any date that
 * already has bookings (one-off nights), minus fully closed nights. Vacancies are
 * capacity minus booked pax minus live holds, never below zero.
 */
export function availabilityForRange(
  source: NightSource,
  fromDate: string,
  toDate: string,
  bookedPaxByDate: Record<string, number>,
  heldPaxByDate: Record<string, number>,
  closedDates: Set<string>,
  productId: string,
): GygAvailability[] {
  const out: GygAvailability[] = [];
  const period = source.availabilityType === "time_period";
  const showTime = /^\d{2}:\d{2}/.test(String(source.showTime ?? "")) ? String(source.showTime).slice(0, 5) : "19:00";
  const groupSize = source.groupSize && source.groupSize > 0 ? source.groupSize : null;
  const start = new Date(`${fromDate}T00:00:00Z`);
  const end = new Date(`${toDate}T00:00:00Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) return out;
  const weekdays = new Set((source.runWeekdays ?? []).map((n) => Number(n)));
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    const isNight = weekdays.has(d.getUTCDay()) || (bookedPaxByDate[iso] ?? 0) > 0;
    if (!isNight) continue;
    const closed = closedDates.has(iso);
    const booked = bookedPaxByDate[iso] ?? 0;
    const held = heldPaxByDate[iso] ?? 0;
    const seats = closed ? 0 : source.capacity == null ? 999 : Math.max(0, source.capacity - booked - held);
    // GROUP products report available groups, not seats.
    const vacancies = groupSize ? Math.floor(seats / groupSize) : seats;
    const row: GygAvailability = { dateTime: gygDateTime(iso, period ? "00:00" : source.showTime, source.island), productId, cutoffSeconds: Math.max(0, source.cutoffMinutes) * 60, vacancies };
    if (period) row.openingTimes = [{ fromTime: showTime, toTime: addMinutes(showTime, source.periodMinutes ?? 180) }];
    out.push(row);
  }
  return out;
}

export function reservationExpiry(now: Date = new Date(), minutes = 60): string {
  return new Date(now.getTime() + minutes * 60_000).toISOString().replace(/\.\d{3}Z$/, "+00:00");
}

export function newReservationRef(): string {
  return `RES-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

/** A traveller list → what the booking form needs. GYG sends the lead traveller first. */
export function leadTraveller(travelers: unknown): { name: string; email: string | null; phone: string | null } {
  const list = Array.isArray(travelers) ? travelers : [];
  const t = (list[0] ?? {}) as Record<string, unknown>;
  const name = [t.firstName, t.lastName].map((x) => String(x ?? "").trim()).filter(Boolean).join(" ") || "GetYourGuide guest";
  const email = typeof t.email === "string" && t.email.includes("@") ? t.email.trim() : null;
  const phone = typeof t.phoneNumber === "string" && t.phoneNumber.trim() ? t.phoneNumber.trim() : null;
  return { name, email, phone };
}

/** Cancellation must be refused for past nights and redeemed tickets; both are legitimate error codes in the spec. */
export function cancellationRefusal(booking: { show_date: string; arrived_at: string | null; cancelled_at: string | null }, now: Date = new Date()): GygError | null {
  if (booking.cancelled_at) return gygError("BOOKING_ALREADY_CANCELLED", "The booking has already been cancelled.");
  if (booking.arrived_at) return gygError("BOOKING_REDEEMED", "The party has already been admitted.");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Atlantic/Canary", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  if (String(booking.show_date) < today) return gygError("BOOKING_IN_PAST", "The show night has passed.");
  return null;
}

const LOW_SEATS = 7;
const LOW_SEATS_WINDOW_DAYS = 60;
/** GetYourGuide rejects pushed slots more than 90 days out ("too far in the future"). */
const PUSH_HORIZON_DAYS = 90;

/**
 * GetYourGuide's push policy: tell them only when a night sells out, comes back on
 * sale, or a low-seat night (< 7 left) changes inside the next 60 days. Anything
 * else they pull themselves via get-availabilities. `prev` is the last figure we
 * pushed (or observed) for the night; undefined = first time we look at it.
 */
export function shouldPushAvailability(prev: number | undefined, next: number, date: string, today = new Date()): boolean {
  const days = (new Date(`${date}T00:00:00Z`).getTime() - Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) / 86_400_000;
  if (!(days >= 0 && days <= PUSH_HORIZON_DAYS)) return false;
  if (prev === undefined) return next === 0;
  if (prev === next) return false;
  if (next === 0 || prev === 0) return true;
  if (next < LOW_SEATS) return days <= LOW_SEATS_WINDOW_DAYS;
  return false;
}
