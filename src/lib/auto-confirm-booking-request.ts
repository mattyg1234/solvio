import { sendBookingConfirmedEmail } from "@/lib/notifications/booking-emails";
import { sendBookingConfirmedSms } from "@/lib/notifications/booking-sms";
import { coerceValidIanaTimeZone } from "@/lib/safe-timezone";
import { getDeploymentSiteUrl } from "@/lib/deployment-site-url";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export type AutoConfirmBookingHints = {
  hostedOccurrenceStartsAt?: string;
  hostedOccurrenceEndsAt?: string;
  businessEventId?: string | null;
  floorPlanTableId?: string | null;
  serviceDurationMinutes?: number;
  venueTimeZone?: string;
};

export type AutoConfirmBookingResult =
  | { ok: true; venueCalendarBookingId: string }
  | { ok: false; reason: string };

/** Best-effort parse "7:30pm" / "19:30" / "8 PM" → {hours, minutes}. */
export function parsePreferredTime(text: string | null | undefined): { h: number; m: number } | null {
  if (!text?.trim()) return null;
  const m = text.trim().match(/(\d{1,2})\s*[:.\s]?\s*(\d{0,2})\s*(am|pm)?/i);
  if (!m) return null;
  const ampm = m[3]?.toLowerCase();
  let h = parseInt(m[1] ?? "0", 10);
  const mins = m[2] ? parseInt(m[2], 10) : 0;
  if (ampm === "pm" && h < 12) h += 12;
  if (ampm === "am" && h === 12) h = 0;
  if (!(Number.isFinite(h) && h >= 0 && h < 24 && Number.isFinite(mins) && mins >= 0 && mins < 60)) {
    return null;
  }
  return { h, m: mins };
}

function parseIntakeExtras(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, unknown>;
}

function parseAppointmentSlotRange(
  preferredTime: string,
  requestedDate: string,
  durationMinutes: number,
): { starts: Date; ends: Date } | null {
  const slotMatch = preferredTime.trim().match(/^(\d{4}-\d{2}-\d{2})\s·\s(\d{2}:\d{2})[–-](\d{2}:\d{2})/);
  if (slotMatch) {
    const starts = new Date(`${slotMatch[1]}T${slotMatch[2]}:00`);
    const ends = new Date(`${slotMatch[1]}T${slotMatch[3]}:00`);
    if (!Number.isNaN(starts.getTime()) && !Number.isNaN(ends.getTime()) && ends.getTime() > starts.getTime()) {
      return { starts, ends };
    }
  }

  const date = requestedDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const time = parsePreferredTime(preferredTime) ?? { h: 19, m: 0 };
  const starts = new Date(`${date}T${String(time.h).padStart(2, "0")}:${String(time.m).padStart(2, "0")}:00`);
  if (Number.isNaN(starts.getTime())) return null;
  const mins = Math.max(15, Math.min(480, durationMinutes > 0 ? durationMinutes : 60));
  const ends = new Date(starts.getTime() + mins * 60 * 1000);
  return { starts, ends };
}

function resolveSlotTimes(args: {
  bookingKind: string;
  requestedDate: string | null;
  preferredTime: string | null;
  intake: Record<string, unknown>;
  hints: AutoConfirmBookingHints;
}): { starts: Date; ends: Date; businessEventId: string | null; floorPlanTableId: string | null } | null {
  const kind = args.bookingKind.trim().toLowerCase();
  const intakeStarts =
    typeof args.intake.hosted_occurrence_starts_at === "string" ? args.intake.hosted_occurrence_starts_at.trim() : "";
  const intakeEnds =
    typeof args.intake.hosted_occurrence_ends_at === "string" ? args.intake.hosted_occurrence_ends_at.trim() : "";
  const hostedStarts = args.hints.hostedOccurrenceStartsAt?.trim() || intakeStarts;
  const hostedEnds = args.hints.hostedOccurrenceEndsAt?.trim() || intakeEnds;
  const businessEventId =
    args.hints.businessEventId?.trim() ||
    (typeof args.intake.hosted_event_id === "string" ? args.intake.hosted_event_id.trim() : "") ||
    null;
  const floorPlanTableId =
    args.hints.floorPlanTableId?.trim() ||
    (typeof args.intake.floor_plan_table_id === "string" ? args.intake.floor_plan_table_id.trim() : "") ||
    null;

  if (kind === "event" && hostedStarts) {
    const starts = new Date(hostedStarts);
    const ends = hostedEnds ? new Date(hostedEnds) : new Date(starts.getTime() + 3 * 60 * 60 * 1000);
    if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime()) || ends.getTime() <= starts.getTime()) {
      return null;
    }
    return { starts, ends, businessEventId, floorPlanTableId };
  }

  const date = args.requestedDate?.trim() ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  if (kind === "appointment") {
    const duration =
      args.hints.serviceDurationMinutes ??
      (typeof args.intake.selected_service_duration === "number" ? args.intake.selected_service_duration : 60);
    const range = parseAppointmentSlotRange(args.preferredTime ?? "", date, duration);
    if (!range) return null;
    return { ...range, businessEventId, floorPlanTableId };
  }

  const time = parsePreferredTime(args.preferredTime) ?? { h: 19, m: 0 };
  const starts = new Date(`${date}T${String(time.h).padStart(2, "0")}:${String(time.m).padStart(2, "0")}:00`);
  if (Number.isNaN(starts.getTime())) return null;
  const ends = new Date(starts.getTime() + 60 * 60 * 1000);
  return { starts, ends, businessEventId, floorPlanTableId };
}

/**
 * When no deposit is collected, move a guest request straight into confirmed diary
 * and notify the guest by email + SMS (same as manual merchant confirm).
 */
export async function autoConfirmBookingRequest(args: {
  bookingRequestId: string;
  hints?: AutoConfirmBookingHints;
  internalNotes?: string;
  /** When false, skip guest notifications (e.g. caller will notify separately). */
  notifyGuest?: boolean;
}): Promise<AutoConfirmBookingResult> {
  const bookingRequestId = args.bookingRequestId.trim();
  if (!bookingRequestId) return { ok: false, reason: "missing_id" };

  const admin = createSupabaseServiceRoleClient();
  const hints = args.hints ?? {};

  const { data: existing } = await admin
    .from("venue_calendar_bookings")
    .select("id")
    .eq("booking_request_id", bookingRequestId)
    .neq("status", "cancelled")
    .limit(1);
  if (existing?.length) {
    return { ok: true, venueCalendarBookingId: existing[0]!.id as string };
  }

  const { data: req } = await admin
    .from("booking_requests")
    .select(
      "id,business_id,customer_name,email,phone,booking_kind,event_title,guest_count,requested_date,preferred_time,intake_extras",
    )
    .eq("id", bookingRequestId)
    .maybeSingle();

  if (!req?.business_id) return { ok: false, reason: "request_not_found" };

  const intake = parseIntakeExtras(req.intake_extras);
  const slot = resolveSlotTimes({
    bookingKind: req.booking_kind ?? "",
    requestedDate: req.requested_date,
    preferredTime: req.preferred_time,
    intake,
    hints,
  });
  if (!slot) return { ok: false, reason: "unresolved_time" };

  const startsIso = slot.starts.toISOString();
  const endsIso = slot.ends.toISOString();

  if (!slot.businessEventId) {
    const { count: overlapCount } = await admin
      .from("venue_calendar_bookings")
      .select("*", { count: "exact", head: true })
      .eq("business_id", req.business_id)
      .neq("status", "cancelled")
      .lt("starts_at", endsIso)
      .gt("ends_at", startsIso);
    if (typeof overlapCount === "number" && overlapCount > 0) {
      return { ok: false, reason: "overlap" };
    }
  }

  const title =
    req.event_title?.trim() ||
    `${req.customer_name?.trim() || "Guest"} · ${req.booking_kind?.trim() || "booking"}`;
  const safeTitle = title.slice(0, 480);

  const { data: inserted, error: insErr } = await admin
    .from("venue_calendar_bookings")
    .insert({
      business_id: req.business_id,
      booking_request_id: req.id,
      title: safeTitle,
      booking_kind: req.booking_kind,
      starts_at: startsIso,
      ends_at: endsIso,
      guest_name: req.customer_name ?? "Guest",
      guest_email: req.email ?? "",
      guest_phone: req.phone ?? null,
      guest_count: typeof req.guest_count === "number" ? req.guest_count : null,
      status: "confirmed",
      floor_plan_table_id: slot.floorPlanTableId,
      business_event_id: slot.businessEventId,
      internal_notes: args.internalNotes?.trim() || "Auto-confirmed — no deposit required.",
    })
    .select("id")
    .single();

  if (insErr || !inserted?.id) {
    return { ok: false, reason: insErr?.message ?? "insert_failed" };
  }

  if (args.notifyGuest !== false) {
    const { data: biz } = await admin
      .from("businesses")
      .select("name,time_zone")
      .eq("id", req.business_id)
      .maybeSingle();

    const merchantName = (biz?.name ?? "Your venue").toString();
    const tz = coerceValidIanaTimeZone(hints.venueTimeZone ?? biz?.time_zone ?? "");
    const siteUrl = getDeploymentSiteUrl();

    if (req.email?.trim()) {
      await sendBookingConfirmedEmail({
        guestEmail: req.email.trim(),
        guestName: req.customer_name?.trim() || "Guest",
        merchantName,
        title: safeTitle,
        startsIso,
        endsIso,
        timeZone: tz,
        siteUrl,
      }).catch(() => {});
    }

    if (req.phone?.trim()) {
      await sendBookingConfirmedSms({
        phoneE164: req.phone.trim(),
        merchantName,
        title: safeTitle,
        timeZone: tz,
      }).catch(() => {});
    }
  }

  return { ok: true, venueCalendarBookingId: inserted.id as string };
}
