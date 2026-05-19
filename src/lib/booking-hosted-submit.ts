import type { BookingPublicContextPayload, PublicBusinessEvent } from "@/lib/booking-public-context";
import type { ExpandedOccurrence } from "@/lib/business-event-occurrences";
import { expandBusinessEventOccurrences } from "@/lib/business-event-occurrences";

const MS_PER_DAY = 86400000;

/** Keep in sync with public booking hosted-event expansion. */
export const BOOKING_HOSTED_EXPAND_SLACK_BEFORE_MS = 8 * MS_PER_DAY;
export const BOOKING_HOSTED_EXPAND_RANGE_AHEAD_MS = 540 * MS_PER_DAY;

function activeHostedEvents(events: PublicBusinessEvent[]): PublicBusinessEvent[] {
  return events.filter((e) => !e.cancelled);
}

export function expandHostedEventForSubmit(ev: PublicBusinessEvent, venueTz: string): ExpandedOccurrence[] {
  return expandHostedEventOccurrences(ev, venueTz).filter((o) => !o.skipped);
}

/** Guest calendar — includes cancelled nights (with reasons) but still hides past dates. */
export function expandHostedEventOccurrences(ev: PublicBusinessEvent, venueTz: string): ExpandedOccurrence[] {
  const now = Date.now();
  const rangeStart = new Date(now - BOOKING_HOSTED_EXPAND_SLACK_BEFORE_MS);
  const rangeEnd = new Date(now + BOOKING_HOSTED_EXPAND_RANGE_AHEAD_MS);
  return expandBusinessEventOccurrences(ev.starts_at, ev.ends_at, ev.recurrence ?? {}, venueTz, rangeStart, rangeEnd).filter(
    (o) => Date.parse(o.starts_at) >= now - 60_000,
  );
}

export function formatHostedOccurrencePreferredSummary(o: ExpandedOccurrence, venueTz: string): string {
  const dayFmt = new Date(`${o.dateYmd}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: venueTz,
  });
  const opts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit", timeZone: venueTz };
  const s = new Date(o.starts_at);
  const e = new Date(o.ends_at);
  return `${dayFmt} · ${s.toLocaleTimeString(undefined, opts)} → ${e.toLocaleTimeString(undefined, opts)} (${venueTz})`;
}

/**
 * Validates event-kind submissions so guests cannot claim a hosted listing on a night it never runs.
 */
export function validateHostedEventSubmission(args: {
  ctx: BookingPublicContextPayload | null;
  bookingKind: string;
  hostedEventId: string;
  /** YYYY-MM-DD from `requested_date` */
  requestedDateYmd: string;
  /** Exact ISO occurrence start submitted from the calendar picker (when required). */
  hostedOccurrenceStartsAt: string;
}): { ok: true; preferred_time?: string } | { ok: false; message: string } {
  const kind = args.bookingKind.trim().toLowerCase();
  if (kind !== "event") return { ok: true };

  const ctx = args.ctx;
  if (!ctx) return { ok: false, message: "Booking page is unavailable." };

  const upcoming = activeHostedEvents(ctx.events);
  if (upcoming.length === 0) return { ok: true };

  const evId = args.hostedEventId.trim().toLowerCase();
  if (!/^[0-9a-f-]{36}$/.test(evId)) {
    return { ok: false, message: "Pick a hosted night from the list so Solvio knows which show." };
  }

  const ev = upcoming.find((e) => e.id?.toLowerCase() === evId);
  if (!ev || !ev.id) {
    return { ok: false, message: "That hosted listing is no longer available — refresh and choose again." };
  }

  const tz = ctx.venue_time_zone?.trim() || "UTC";
  const occurrences = expandHostedEventForSubmit(ev, tz);

  const rec =
    ev.recurrence && typeof ev.recurrence === "object" && !Array.isArray(ev.recurrence)
      ? (ev.recurrence as Record<string, unknown>)
      : null;
  const recurType = typeof rec?.type === "string" ? rec.type.trim().toLowerCase() : "once";

  if (occurrences.length === 0 && (recurType === "weekly" || recurType === "daily")) {
    return {
      ok: false,
      message:
        "That hosted listing has no upcoming show dates in Solvio yet. Ask the venue to refresh recurrence or pick another night.",
    };
  }

  if (occurrences.length > 0) {
    const occIso = args.hostedOccurrenceStartsAt.trim();
    const occMs = Date.parse(occIso);
    if (!occIso || Number.isNaN(occMs)) {
      return { ok: false, message: "Choose a highlighted date on the calendar for this hosted night." };
    }
    const hit = occurrences.find((o) => o.starts_at === occIso);
    if (!hit) {
      return { ok: false, message: "That showing is no longer offered on this link — reload and tap a highlighted date." };
    }

    if (hit.dateYmd !== args.requestedDateYmd.trim()) {
      return { ok: false, message: "Calendar date does not match the showing you selected — try again." };
    }

    return { ok: true, preferred_time: formatHostedOccurrencePreferredSummary(hit, tz) };
  }

  if (occurrences.length === 0 && recurType === "once") {
    return {
      ok: false,
      message: "That one-off listing is no longer accepting bookings — pick another hosted night.",
    };
  }

  const hasDate = /^\d{4}-\d{2}-\d{2}$/.test(args.requestedDateYmd.trim());
  if (!hasDate) {
    return { ok: false, message: "Add a preferred date (YYYY-MM-DD) for this hosted request." };
  }

  return { ok: true };
}
