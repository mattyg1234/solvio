import type { BookingGuestMode } from "@/lib/booking-guest-modes";
import { isBookingGuestMode, parseGuestModesJson } from "@/lib/booking-guest-modes";
import { coerceFloorPlanShape, normalizeFloorTableFillColor, type FloorPlanTableShape } from "@/lib/floor-plan-visuals";
import { parseStaffMembers, type StaffMember } from "@/lib/staff-members";
import { coerceValidIanaTimeZone } from "@/lib/safe-timezone";
import { formatMoney } from "@/lib/checkout-money";

/** Matches Postgres `extract(dow)` convention used in dashboards: 0 = Sunday … 6 = Saturday */
export const BOOKING_PUBLIC_WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export type PublicAppointmentHour = {
  weekday: number;
  open_time: string;
  close_time: string;
  slot_minutes: number;
};

export type PublicAppointmentSlotException = {
  exception_date: string;
  slot_start: string | null;
  kind: "removed" | "cancelled";
};

/** Confirmed appointment diary occupancy (venue-local date + wall clock). */
export type PublicAppointmentBookedSlot = {
  date: string;
  slot_start: string;
  slot_end: string;
  staff_member: string | null;
};

export type PublicAppointmentService = {
  id: string;
  name: string;
  duration_minutes: number;
  price_cents: number;
  sort_order: number;
};

export type EventCustomQuestion = {
  label: string;
  required: boolean;
};

export type PublicBusinessEvent = {
  id?: string;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  /** Recurrence blob from DB (same schema as merchant calendar helpers). */
  recurrence?: unknown | null;
  cancelled: boolean;
  cancellation_reason: string;
  /** Max attendees for this event. null = unlimited. */
  capacity: number | null;
  /** Sum of guest_count across confirmed venue_calendar_bookings for this event. */
  booked_count: number;
  /** Optional intake questions per event (e.g. "How many children?"). */
  custom_questions: EventCustomQuestion[];
  /** Per-ticket price in cents. null/0 = free RSVP. >0 = paid (blocks free table bookings on same date). */
  ticket_price_cents: number | null;
  /** When false, hide the "X seats left" badge on the public form (still server-enforced). */
  show_remaining_seats: boolean;
};

export type PublicTableWeekdayBar = {
  weekday: number;
  open_time: string;
  close_time: string;
};

export type PublicFloorTable = {
  id?: string;
  label: string;
  capacity: number;
  pricing_mode: string;
  price_cents: number;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  shape: FloorPlanTableShape;
  fill_color?: string;
  /** When non-empty on the hub, replaces venue appointment hours entirely for weekday checks on this table. */
  weekday_hours?: PublicTableWeekdayBar[];
};

export type BookingPublicPolicies = {
  block_public_table_when_hosted_event_date: boolean;
};

export type PublicTableQuestion = {
  question_label: string;
  required: boolean;
  sort_order: number;
};

export type BookingPublicContextPayload = {
  business_name: string;
  guest_message: string;
  booking_flow_kind: string;
  venue_time_zone: string;
  guest_modes_raw: unknown;
  appointment_hours: PublicAppointmentHour[];
  appointment_slot_exceptions: PublicAppointmentSlotException[];
  appointment_booked_slots: PublicAppointmentBookedSlot[];
  appointment_services: PublicAppointmentService[];
  events: PublicBusinessEvent[];
  tables: PublicFloorTable[];
  table_questions: PublicTableQuestion[];
  booking_policies: BookingPublicPolicies;
  staff_members: StaffMember[];
  /** Venue-wide intake questions shown when guests book appointments. */
  appointment_questions: EventCustomQuestion[];
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function parseHours(raw: unknown): PublicAppointmentHour[] {
  if (!Array.isArray(raw)) return [];
  const out: PublicAppointmentHour[] = [];
  for (const row of raw) {
    const o = asRecord(row);
    if (!o) continue;
    const weekday = typeof o.weekday === "number" ? o.weekday : Number(o.weekday);
    const slotMinutes =
      typeof o.slot_minutes === "number" ? o.slot_minutes : Number(o.slot_minutes);
    const openTime = typeof o.open_time === "string" ? o.open_time : "";
    const closeTime = typeof o.close_time === "string" ? o.close_time : "";
    if (!Number.isFinite(weekday) || weekday < 0 || weekday > 6) continue;
    if (!openTime || !closeTime || !Number.isFinite(slotMinutes)) continue;
    out.push({
      weekday,
      open_time: openTime,
      close_time: closeTime,
      slot_minutes: slotMinutes,
    });
  }
  return out;
}

function parseAppointmentSlotExceptions(raw: unknown): PublicAppointmentSlotException[] {
  if (!Array.isArray(raw)) return [];
  const out: PublicAppointmentSlotException[] = [];
  for (const row of raw) {
    const o = asRecord(row);
    if (!o) continue;
    const ds = typeof o.exception_date === "string" ? o.exception_date.trim() : "";
    const ymd = /^(\d{4}-\d{2}-\d{2})/.exec(ds);
    const exception_date = ymd?.[1] ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(exception_date)) continue;

    let kindRaw: PublicAppointmentSlotException["kind"] = "removed";
    if (typeof o.kind === "string" && (o.kind === "removed" || o.kind === "cancelled")) {
      kindRaw = o.kind;
    }

    let slot_start: string | null = null;
    if (o.slot_start === null || o.slot_start === undefined) {
      slot_start = null;
    } else if (typeof o.slot_start === "string") {
      const t = o.slot_start.trim();
      if (!t.length) slot_start = null;
      else {
        const clip = /^(\d{2}:\d{2})(?::\d{2})?/.exec(t);
        slot_start = clip ? clip[1] : null;
      }
    }

    out.push({ exception_date, slot_start: slot_start ?? null, kind: kindRaw });
  }
  return out;
}

function parseAppointmentBookedSlots(raw: unknown): PublicAppointmentBookedSlot[] {
  if (!Array.isArray(raw)) return [];
  const out: PublicAppointmentBookedSlot[] = [];
  for (const row of raw) {
    const o = asRecord(row);
    if (!o) continue;
    const date = typeof o.date === "string" ? o.date.trim() : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const slotStartRaw = typeof o.slot_start === "string" ? o.slot_start.trim() : "";
    const slotEndRaw = typeof o.slot_end === "string" ? o.slot_end.trim() : "";
    const startClip = /^(\d{2}:\d{2})/.exec(slotStartRaw);
    const endClip = /^(\d{2}:\d{2})/.exec(slotEndRaw);
    if (!startClip || !endClip) continue;
    const staffRaw = typeof o.staff_member === "string" ? o.staff_member.trim() : "";
    out.push({
      date,
      slot_start: startClip[1]!,
      slot_end: endClip[1]!,
      staff_member: staffRaw.length ? staffRaw : null,
    });
  }
  return out;
}

function parseEvents(raw: unknown): PublicBusinessEvent[] {
  if (!Array.isArray(raw)) return [];
  const out: PublicBusinessEvent[] = [];
  for (const item of raw) {
    const o = asRecord(item);
    if (!o) continue;
    const title = typeof o.title === "string" ? o.title.trim() : "";
    const startsAt = typeof o.starts_at === "string" ? o.starts_at : "";
    const endsAt = typeof o.ends_at === "string" ? o.ends_at : "";
    if (!title || !startsAt || !endsAt) continue;
    const id =
      typeof o.id === "string" && /^[0-9a-f-]{36}$/i.test(o.id.trim())
        ? o.id.trim()
        : undefined;
    const recurrence = o.recurrence ?? null;

    const capacity =
      typeof o.capacity === "number" && Number.isFinite(o.capacity) && o.capacity > 0
        ? Math.floor(o.capacity)
        : null;
    const bookedCount =
      typeof o.booked_count === "number" && Number.isFinite(o.booked_count) && o.booked_count >= 0
        ? Math.floor(o.booked_count)
        : 0;

    const customQuestions: EventCustomQuestion[] = [];
    if (Array.isArray(o.custom_questions)) {
      for (const q of o.custom_questions) {
        if (!q || typeof q !== "object" || Array.isArray(q)) continue;
        const qr = q as Record<string, unknown>;
        const label = typeof qr.label === "string" ? qr.label.trim() : "";
        if (!label || label.length > 240) continue;
        customQuestions.push({ label, required: Boolean(qr.required) });
      }
    }

    const ticketPriceCents =
      typeof o.ticket_price_cents === "number" && Number.isFinite(o.ticket_price_cents) && o.ticket_price_cents > 0
        ? Math.floor(o.ticket_price_cents)
        : null;
    const showRemainingSeats = typeof o.show_remaining_seats === "boolean" ? o.show_remaining_seats : true;

    const evt: PublicBusinessEvent = {
      ...(id ? { id } : {}),
      title,
      description: typeof o.description === "string" ? o.description : "",
      starts_at: startsAt,
      ends_at: endsAt,
      ...(recurrence === null ? {} : { recurrence }),
      cancelled: Boolean(o.cancelled),
      cancellation_reason:
        typeof o.cancellation_reason === "string" ? o.cancellation_reason : "",
      capacity,
      booked_count: bookedCount,
      custom_questions: customQuestions,
      ticket_price_cents: ticketPriceCents,
      show_remaining_seats: showRemainingSeats,
    };
    out.push(evt);
  }
  return out;
}

function parseTableWeekdayBars(raw: unknown): PublicTableWeekdayBar[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: PublicTableWeekdayBar[] = [];
  for (const row of raw) {
    const o = asRecord(row);
    if (!o) continue;
    const weekday = typeof o.weekday === "number" ? o.weekday : Number(o.weekday);
    const openTime = typeof o.open_time === "string" ? o.open_time.trim() : "";
    const closeTime = typeof o.close_time === "string" ? o.close_time.trim() : "";
    if (!Number.isFinite(weekday) || weekday < 0 || weekday > 6) continue;
    if (!openTime || !closeTime) continue;
    out.push({ weekday, open_time: openTime, close_time: closeTime });
  }
  return out.length ? out : undefined;
}

function parseTables(raw: unknown): PublicFloorTable[] {
  if (!Array.isArray(raw)) return [];
  const out: PublicFloorTable[] = [];
  for (const item of raw) {
    const o = asRecord(item);
    if (!o) continue;
    const label = typeof o.label === "string" ? o.label.trim() : "";
    const capacity = typeof o.capacity === "number" ? o.capacity : Number(o.capacity);
    const pricingMode = typeof o.pricing_mode === "string" ? o.pricing_mode.trim() : "table";
    const priceCents = typeof o.price_cents === "number" ? o.price_cents : Number(o.price_cents);
    const positionX = typeof o.position_x === "number" ? o.position_x : Number(o.position_x);
    const positionY = typeof o.position_y === "number" ? o.position_y : Number(o.position_y);
    const width = typeof o.width === "number" ? o.width : Number(o.width);
    const height = typeof o.height === "number" ? o.height : Number(o.height);
    if (!label || !Number.isFinite(capacity)) continue;
    const id =
      typeof o.id === "string" && /^[0-9a-f-]{36}$/i.test(o.id.trim()) ? o.id.trim() : undefined;
    const weekdayHours = parseTableWeekdayBars(o.weekday_hours);
    const shape = coerceFloorPlanShape(o.shape);
    const fillParsed = normalizeFloorTableFillColor(
      typeof o.fill_color === "string" ? o.fill_color : undefined,
    );
    const ft: PublicFloorTable = {
      ...(id ? { id } : {}),
      label,
      capacity: Number.isFinite(capacity) ? capacity : 0,
      pricing_mode: pricingMode || "table",
      price_cents: Number.isFinite(priceCents) ? Math.max(0, Math.round(priceCents)) : 0,
      position_x: Number.isFinite(positionX) ? positionX : 0,
      position_y: Number.isFinite(positionY) ? positionY : 0,
      width: Number.isFinite(width) ? Math.max(1, width) : 120,
      height: Number.isFinite(height) ? Math.max(1, height) : 80,
      shape,
      ...(fillParsed ? { fill_color: fillParsed } : {}),
      ...(weekdayHours?.length ? { weekday_hours: weekdayHours } : {}),
    };
    out.push(ft);
  }
  return out;
}

function parseBookingPolicies(raw: unknown): BookingPublicPolicies {
  const root = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  if (!root) {
    return { block_public_table_when_hosted_event_date: false };
  }
  let block = false;
  const v = root.block_public_table_when_hosted_event_date;
  if (typeof v === "boolean") block = v;
  else if (typeof v === "string") block = ["true", "1", "yes"].includes(v.trim().toLowerCase());
  return { block_public_table_when_hosted_event_date: block };
}

function parseQuestions(raw: unknown): PublicTableQuestion[] {
  if (!Array.isArray(raw)) return [];
  const out: PublicTableQuestion[] = [];
  for (const row of raw) {
    const o = asRecord(row);
    if (!o) continue;
    const questionLabel = typeof o.question_label === "string" ? o.question_label.trim() : "";
    const sortOrder = typeof o.sort_order === "number" ? o.sort_order : Number(o.sort_order);
    if (!questionLabel) continue;
    out.push({
      question_label: questionLabel,
      required: Boolean(o.required),
      sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
    });
  }
  out.sort((a, b) => a.sort_order - b.sort_order || a.question_label.localeCompare(b.question_label));
  return out;
}

function parseAppointmentServices(raw: unknown): PublicAppointmentService[] {
  if (!Array.isArray(raw)) return [];
  const out: PublicAppointmentService[] = [];
  for (const row of raw) {
    const o = asRecord(row);
    if (!o) continue;
    const id = typeof o.id === "string" ? o.id.trim() : "";
    const name = typeof o.name === "string" ? o.name.trim() : "";
    const durationMinutes = typeof o.duration_minutes === "number" ? o.duration_minutes : Number(o.duration_minutes);
    const priceCents = typeof o.price_cents === "number" ? o.price_cents : Number(o.price_cents);
    const sortOrder = typeof o.sort_order === "number" ? o.sort_order : Number(o.sort_order);
    if (!id || !name || !Number.isFinite(durationMinutes) || durationMinutes <= 0) continue;
    if (!Number.isFinite(priceCents) || priceCents < 0) continue;
    out.push({
      id,
      name,
      duration_minutes: durationMinutes,
      price_cents: priceCents,
      sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
    });
  }
  out.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  return out;
}

export function parseGuestModesFromRpc(raw: unknown): BookingGuestMode[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    const out = raw.filter((x): x is BookingGuestMode => typeof x === "string" && isBookingGuestMode(x));
    return [...new Set(out)];
  }
  if (typeof raw === "string") {
    return parseGuestModesJson(raw);
  }
  return [];
}

/** Parses JSON returned by `get_booking_public_context`. Returns null when slug unknown or malformed. */
export function parseBookingPublicContext(raw: unknown): BookingPublicContextPayload | null {
  let decoded: unknown = raw;
  if (typeof raw === "string") {
    try {
      decoded = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const root = asRecord(decoded);
  if (!root) return null;
  const businessName = typeof root.business_name === "string" ? root.business_name.trim() : "";
  if (!businessName) return null;

  return {
    business_name: businessName,
    guest_message: typeof root.guest_message === "string" ? root.guest_message.trim() : "",
    booking_flow_kind:
      typeof root.booking_flow_kind === "string" ? root.booking_flow_kind.trim() : "",
    venue_time_zone: coerceValidIanaTimeZone(root.venue_time_zone),
    guest_modes_raw: root.guest_modes,
    appointment_hours: parseHours(root.appointment_hours),
    appointment_slot_exceptions: parseAppointmentSlotExceptions(root.appointment_slot_exceptions),
    appointment_booked_slots: parseAppointmentBookedSlots(root.appointment_booked_slots ?? []),
    appointment_services: parseAppointmentServices(root.appointment_services),
    events: parseEvents(root.events),
    tables: parseTables(root.tables),
    table_questions: parseQuestions(root.table_questions),
    booking_policies: parseBookingPolicies(root.booking_policies),
    staff_members: parseStaffMembers(root.staff_members),
    appointment_questions: parseEventQuestionsList(root.appointment_questions),
  };
}

function parseEventQuestionsList(raw: unknown): EventCustomQuestion[] {
  if (!Array.isArray(raw)) return [];
  const out: EventCustomQuestion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const o = item as Record<string, unknown>;
    const label = typeof o.label === "string" ? o.label.trim() : "";
    if (!label || label.length > 240) continue;
    out.push({ label, required: Boolean(o.required) });
  }
  return out;
}

export function formatPublicTablePrice(priceCents: number, pricingMode: string): string {
  const safe = Number.isFinite(priceCents) ? Math.max(0, priceCents) : 0;
  const base = formatMoney(safe);
  switch (pricingMode) {
    case "person":
      return `${base} / guest`;
    case "group_tier":
      return `${base} · group tiers`;
    default:
      return `${base} / table`;
  }
}

/** @deprecated Use formatPublicTablePrice */
export const formatPublicTablePriceEUR = formatPublicTablePrice;

export function formatPublicRange(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "";
  const sameDay = start.toDateString() === end.toDateString();
  const dateFmt: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" };
  const timeFmt: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  if (sameDay) {
    return `${start.toLocaleString(undefined, { ...dateFmt, ...timeFmt })} – ${end.toLocaleTimeString(undefined, timeFmt)}`;
  }
  return `${start.toLocaleString(undefined, { ...dateFmt, ...timeFmt })} → ${end.toLocaleString(undefined, { ...dateFmt, ...timeFmt })}`;
}
