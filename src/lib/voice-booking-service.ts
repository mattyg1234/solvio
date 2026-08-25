import { parsePreferredTime, autoConfirmBookingRequest } from "@/lib/auto-confirm-booking-request";
import { assertEventCapacityForSubmit } from "@/lib/booking-event-capacity";
import {
  buildAppointmentSlotGrid,
  dowSundayZeroInBusinessTZ,
  type AppointmentBreak,
} from "@/lib/booking-appointment-slots";
import { computeEventTicketCents, computeTableDepositCents } from "@/lib/booking-deposit-pricing";
import { expandHostedEventForSubmit, validateHostedEventSubmission } from "@/lib/booking-hosted-submit";
import { parseGuestModesFromRpc, type BookingPublicContextPayload } from "@/lib/booking-public-context";
import { validateTableBookingSubmission } from "@/lib/booking-table-rules";
import { parseCallTimeLocal } from "@/lib/booking-from-phone-call";
import { isStaffWorkingOnWeekday } from "@/lib/staff-members";
import { notifyMerchantNewBooking } from "@/lib/notifications/merchant-new-booking";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export type VoiceBookingCheckInput = {
  bookingKind?: string;
  dateYmd?: string;
  timeLocal?: string;
  partySize?: number;
  preferredTable?: string;
  serviceName?: string;
  staffName?: string;
  hostedEventId?: string;
  hostedOccurrenceStartsAt?: string;
};

export type VoiceBookingCreateInput = VoiceBookingCheckInput & {
  guestName?: string;
  guestEmail?: string;
  guestPhone?: string;
  notes?: string;
};

type LoadedVoiceBooking = {
  businessId: string;
  slug: string;
  ctx: BookingPublicContextPayload;
  breaks: AppointmentBreak[];
  connectChargesEnabled: boolean;
  appointmentDepositCents: number;
};

function normalizeKind(raw: string | undefined, ctx: BookingPublicContextPayload): string {
  const kind = (raw ?? "table").trim().toLowerCase();
  const modes = parseGuestModesFromRpc(ctx.guest_modes_raw);
  if (modes.includes(kind as (typeof modes)[number])) return kind;
  return modes[0] ?? "table";
}

function parseDateYmd(raw: string | undefined): string | null {
  const trimmed = raw?.trim() ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  return trimmed;
}

async function loadVoiceBooking(businessId: string): Promise<LoadedVoiceBooking | null> {
  const admin = createSupabaseServiceRoleClient();
  const { data: biz } = await admin
    .from("businesses")
    .select("id, booking_slug, stripe_connect_charges_enabled, appointment_deposit_cents")
    .eq("id", businessId)
    .maybeSingle();

  const slug = typeof biz?.booking_slug === "string" ? biz.booking_slug.trim() : "";
  if (!biz?.id || !slug) return null;

  const { data: ctxRaw } = await admin.rpc("get_booking_public_context", { p_slug: slug });
  const { parseBookingPublicContext } = await import("@/lib/booking-public-context");
  const ctx = parseBookingPublicContext(ctxRaw);
  if (!ctx) return null;

  const { data: brkData } = await admin.from("appointment_breaks").select("weekdays, start_time, end_time").eq("business_id", biz.id);

  return {
    businessId: biz.id,
    slug,
    ctx,
    breaks: (brkData ?? []) as AppointmentBreak[],
    connectChargesEnabled: Boolean(biz.stripe_connect_charges_enabled),
    appointmentDepositCents: Number(biz.appointment_deposit_cents ?? 0),
  };
}

function resolveService(ctx: BookingPublicContextPayload, serviceName?: string) {
  const want = serviceName?.trim().toLowerCase();
  if (!want) return null;
  return ctx.appointment_services.find((s) => s.name.trim().toLowerCase() === want) ?? null;
}

function resolveStaff(ctx: BookingPublicContextPayload, staffName?: string) {
  const want = staffName?.trim().toLowerCase();
  if (!want) return null;
  return ctx.staff_members.find((s) => s.name.trim().toLowerCase() === want) ?? null;
}

function staffWorkingNames(ctx: BookingPublicContextPayload, dateYmd: string): string[] {
  const dow = dowSundayZeroInBusinessTZ(dateYmd, ctx.venue_time_zone);
  return ctx.staff_members
    .filter((m) => isStaffWorkingOnWeekday(m, dow))
    .map((m) => m.name.trim())
    .filter(Boolean);
}

async function calendarOverlaps(args: {
  businessId: string;
  startsAt: string;
  endsAt: string;
}): Promise<boolean> {
  const admin = createSupabaseServiceRoleClient();
  const { count } = await admin
    .from("venue_calendar_bookings")
    .select("*", { count: "exact", head: true })
    .eq("business_id", args.businessId)
    .neq("status", "cancelled")
    .lt("starts_at", args.endsAt)
    .gt("ends_at", args.startsAt);
  return typeof count === "number" && count > 0;
}

function tableWindow(dateYmd: string, timeLocal: string): { startsAt: string; endsAt: string } | null {
  const time = parseCallTimeLocal(timeLocal) ?? parsePreferredTime(timeLocal);
  if (!time) return null;
  const starts = new Date(`${dateYmd}T${String(time.h).padStart(2, "0")}:${String(time.m).padStart(2, "0")}:00`);
  if (Number.isNaN(starts.getTime())) return null;
  return { startsAt: starts.toISOString(), endsAt: new Date(starts.getTime() + 60 * 60 * 1000).toISOString() };
}

function findAvailableAppointmentSlot(
  ctx: BookingPublicContextPayload,
  loaded: LoadedVoiceBooking,
  dateYmd: string,
  timeLocal: string | undefined,
  serviceName?: string,
  staffName?: string,
) {
  const tz = ctx.venue_time_zone?.trim() || "UTC";
  const dow = dowSundayZeroInBusinessTZ(dateYmd, tz);
  const hourRow = ctx.appointment_hours.find((h) => h.weekday === dow);
  const service = resolveService(ctx, serviceName);
  const staff = resolveStaff(ctx, staffName);
  const staffWorking = staffWorkingNames(ctx, dateYmd);

  const grid = buildAppointmentSlotGrid({
    dateYmd,
    row: hourRow,
    venueTimeZone: tz,
    exceptions: ctx.appointment_slot_exceptions,
    breaks: loaded.breaks,
    bookedSlots: ctx.appointment_booked_slots ?? [],
    preferredStaffName: staff?.name ?? null,
    staffWorkingThatDay: staffWorking.length ? staffWorking : ctx.staff_members.map((m) => m.name),
    serviceDurationMinutes: service?.duration_minutes ?? null,
  });

  const available = grid.filter((s) => s.status === "available");

  if (!timeLocal?.trim()) {
    return { grid, available, matched: null as (typeof available)[number] | null };
  }

  const parsed = parseCallTimeLocal(timeLocal) ?? parsePreferredTime(timeLocal);
  if (!parsed) return { grid, available, matched: null };

  const hm = `${String(parsed.h).padStart(2, "0")}:${String(parsed.m).padStart(2, "0")}`;
  const matched =
    available.find((s) => s.slotStartHm === hm) ??
    available.find((s) => s.slotStartHm <= hm && s.slotEndHm > hm) ??
    null;

  return { grid, available, matched };
}

export async function checkVoiceBookingAvailability(
  businessId: string,
  input: VoiceBookingCheckInput,
): Promise<{ ok: true; summary: string } | { ok: false; message: string }> {
  const loaded = await loadVoiceBooking(businessId);
  if (!loaded) {
    return { ok: false, message: "This venue has not published a booking page yet." };
  }

  const { ctx } = loaded;
  const kind = normalizeKind(input.bookingKind, ctx);
  const dateYmd = parseDateYmd(input.dateYmd);

  if (kind === "walk_in") {
    return {
      ok: true,
      summary: JSON.stringify({
        available: true,
        bookingKind: kind,
        message: "Walk-in enquiries can be logged — ask for party size, name, and when they hope to visit.",
      }),
    };
  }

  if (!dateYmd) {
    return { ok: false, message: "Need a date as YYYY-MM-DD (for example 2026-06-20)." };
  }

  if (kind === "table") {
    const tableCheck = validateTableBookingSubmission({
      ctx,
      bookingKind: kind,
      preferredTableLabel: input.preferredTable?.trim() ?? "",
      requestedDateYmd: dateYmd,
    });
    if (!tableCheck.ok) {
      return {
        ok: true,
        summary: JSON.stringify({ available: false, bookingKind: kind, dateYmd, message: tableCheck.message }),
      };
    }

    if (input.timeLocal?.trim()) {
      const window = tableWindow(dateYmd, input.timeLocal);
      if (!window) {
        return { ok: false, message: "Could not parse that time — try 8pm or 20:00." };
      }
      const overlap = await calendarOverlaps({ businessId: loaded.businessId, ...window });
      if (overlap) {
        return {
          ok: true,
          summary: JSON.stringify({
            available: false,
            bookingKind: kind,
            dateYmd,
            timeLocal: input.timeLocal,
            message: "That time overlaps another booking in the diary — suggest a different time on the same date or another date.",
          }),
        };
      }
      return {
        ok: true,
        summary: JSON.stringify({
          available: true,
          bookingKind: kind,
          dateYmd,
          timeLocal: input.timeLocal,
          message: `${dateYmd} at ${input.timeLocal} looks open for a table request${input.partySize ? ` for party of ${input.partySize}` : ""}. Confirm details then create the booking.`,
        }),
      };
    }

    return {
      ok: true,
      summary: JSON.stringify({
        available: true,
        bookingKind: kind,
        dateYmd,
        message: `${dateYmd} is open for table bookings. Ask what time they want, then check again with timeLocal.`,
      }),
    };
  }

  if (kind === "appointment") {
    const { available, matched } = findAvailableAppointmentSlot(
      ctx,
      loaded,
      dateYmd,
      input.timeLocal,
      input.serviceName,
      input.staffName,
    );

    if (input.timeLocal?.trim()) {
      if (!matched) {
        const samples = available.slice(0, 6).map((s) => s.shortLabel);
        return {
          ok: true,
          summary: JSON.stringify({
            available: false,
            bookingKind: kind,
            dateYmd,
            timeLocal: input.timeLocal,
            suggestedSlots: samples,
            message:
              samples.length > 0
                ? `That time is not free. Offer one of these: ${samples.join(", ")}.`
                : "No appointment slots left that day — try another date.",
          }),
        };
      }
      return {
        ok: true,
        summary: JSON.stringify({
          available: true,
          bookingKind: kind,
          dateYmd,
          slotValue: matched.value,
          slotLabel: matched.label,
          message: `${matched.label} is available. Confirm name and contact details, then create the booking.`,
        }),
      };
    }

    const samples = available.slice(0, 8).map((s) => ({ label: s.shortLabel, value: s.value }));
    return {
      ok: true,
      summary: JSON.stringify({
        available: samples.length > 0,
        bookingKind: kind,
        dateYmd,
        availableSlots: samples,
        message:
          samples.length > 0
            ? `Open slots on ${dateYmd}: ${samples.map((s) => s.label).join(", ")}.`
            : "No open appointment slots that day — try another date.",
      }),
    };
  }

  if (kind === "event") {
    const tz = ctx.venue_time_zone?.trim() || "UTC";
    const evId = input.hostedEventId?.trim() ?? "";
    const occIso = input.hostedOccurrenceStartsAt?.trim() ?? "";

    if (evId && occIso) {
      const hostedCheck = validateHostedEventSubmission({
        ctx,
        bookingKind: kind,
        hostedEventId: evId,
        requestedDateYmd: dateYmd,
        hostedOccurrenceStartsAt: occIso,
      });
      if (!hostedCheck.ok) {
        return {
          ok: true,
          summary: JSON.stringify({ available: false, bookingKind: kind, dateYmd, message: hostedCheck.message }),
        };
      }
      const ev = ctx.events.find((e) => e.id === evId);
      if (ev && typeof ev.capacity === "number" && ev.capacity > 0) {
        const remaining = ev.capacity - (ev.booked_count ?? 0);
        if (remaining <= 0) {
          return {
            ok: true,
            summary: JSON.stringify({
              available: false,
              bookingKind: kind,
              message: `${ev.title} is sold out on that night.`,
            }),
          };
        }
      }
      return {
        ok: true,
        summary: JSON.stringify({
          available: true,
          bookingKind: kind,
          dateYmd,
          hostedEventId: evId,
          hostedOccurrenceStartsAt: occIso,
          message: "That show night is bookable — confirm party size and guest details, then create the booking.",
        }),
      };
    }

    const listings: { eventId: string; title: string; dateYmd: string; startsAt: string; label: string }[] = [];
    for (const ev of ctx.events.filter((e) => !e.cancelled && e.id)) {
      for (const oc of expandHostedEventForSubmit(ev, tz).slice(0, 4)) {
        listings.push({
          eventId: ev.id!,
          title: ev.title,
          dateYmd: oc.dateYmd,
          startsAt: oc.starts_at,
          label: `${ev.title} · ${oc.dateYmd}`,
        });
      }
    }
    return {
      ok: true,
      summary: JSON.stringify({
        available: listings.length > 0,
        bookingKind: kind,
        upcomingShows: listings.slice(0, 8),
        message:
          listings.length > 0
            ? `Upcoming shows: ${listings
                .slice(0, 5)
                .map((l) => l.label)
                .join("; ")}. Pick one, then check again with hostedEventId and hostedOccurrenceStartsAt.`
            : "No upcoming hosted events on this booking page.",
      }),
    };
  }

  return { ok: false, message: `Booking kind "${kind}" is not supported on this link.` };
}

function depositRequired(args: {
  loaded: LoadedVoiceBooking;
  ctx: BookingPublicContextPayload;
  kind: string;
  preferredTable: string;
  guestCount: number;
  servicePriceCents: number;
  eventTicketCents: number | null;
  appointmentDepositCents: number;
}): boolean {
  if (!args.loaded.connectChargesEnabled) return false;
  if (args.kind === "table") {
    const cents = computeTableDepositCents({
      ctx: args.ctx,
      preferredTableLabel: args.preferredTable,
      guestCount: args.guestCount,
    });
    return Boolean(cents && cents > 0);
  }
  if (args.kind === "appointment") {
    return args.servicePriceCents > 0 || args.appointmentDepositCents >= 50;
  }
  if (args.kind === "event") {
    return Boolean(args.eventTicketCents && args.eventTicketCents > 0);
  }
  return false;
}

export async function createVoiceBookingRequest(
  businessId: string,
  input: VoiceBookingCreateInput,
): Promise<{ ok: true; summary: string } | { ok: false; message: string }> {
  const guestName = input.guestName?.trim() ?? "";
  if (!guestName) return { ok: false, message: "Need the guest's name before creating a booking." };

  const loaded = await loadVoiceBooking(businessId);
  if (!loaded) return { ok: false, message: "This venue has not published a booking page yet." };

  const { ctx, slug } = loaded;
  const kind = normalizeKind(input.bookingKind, ctx);
  const dateYmd = parseDateYmd(input.dateYmd);
  const partySize = Math.max(1, Math.min(999, Math.round(input.partySize ?? 1)));
  const preferredTable = input.preferredTable?.trim() ?? "";
  const service = resolveService(ctx, input.serviceName);
  const staff = resolveStaff(ctx, input.staffName);
  const hostedEventId = input.hostedEventId?.trim() ?? "";
  const hostedOccurrenceStartsAt = input.hostedOccurrenceStartsAt?.trim() ?? "";

  if (kind !== "walk_in" && !dateYmd) {
    return { ok: false, message: "Need dateYmd as YYYY-MM-DD." };
  }

  let preferredTime = input.timeLocal?.trim() ?? "";
  let intakeExtras: Record<string, unknown> = {};
  if (preferredTable) intakeExtras.preferred_table = preferredTable;
  if (hostedEventId) intakeExtras.hosted_event_id = hostedEventId;
  if (service) {
    intakeExtras.selected_service = service.name;
    intakeExtras.selected_service_id = service.id;
    intakeExtras.selected_service_duration = service.duration_minutes;
    intakeExtras.selected_service_price_cents = service.price_cents;
  }
  if (staff) {
    intakeExtras.preferred_staff = staff.name;
    intakeExtras.preferred_staff_id = staff.id;
  }

  const preferredTableMatch = preferredTable ? ctx.tables.find((t) => t.label.trim() === preferredTable) : undefined;
  if (preferredTableMatch?.id) intakeExtras.floor_plan_table_id = preferredTableMatch.id;

  if (kind === "appointment" && dateYmd) {
    const { matched, grid } = findAvailableAppointmentSlot(
      ctx,
      loaded,
      dateYmd,
      preferredTime,
      input.serviceName,
      input.staffName,
    );
    if (!matched) {
      const samples = grid.filter((s) => s.status === "available").slice(0, 4).map((s) => s.shortLabel);
      return {
        ok: false,
        message: samples.length
          ? `That appointment time is not available. Offer: ${samples.join(", ")}.`
          : "No open appointment slots that day — try another date.",
      };
    }
    preferredTime = matched.value;
  }

  if (kind === "table" && dateYmd) {
    const tableCheck = validateTableBookingSubmission({
      ctx,
      bookingKind: kind,
      preferredTableLabel: preferredTable,
      requestedDateYmd: dateYmd,
    });
    if (!tableCheck.ok) return { ok: false, message: tableCheck.message };
    if (preferredTime) {
      const window = tableWindow(dateYmd, preferredTime);
      if (!window) return { ok: false, message: "Could not parse time — use 8pm or 20:00." };
      if (await calendarOverlaps({ businessId: loaded.businessId, ...window })) {
        return { ok: false, message: "That time overlaps another booking — choose a different time." };
      }
    } else {
      return { ok: false, message: "Need a time for the table booking (timeLocal)." };
    }
  }

  if (kind === "event" && dateYmd) {
    if (!hostedEventId || !hostedOccurrenceStartsAt) {
      return { ok: false, message: "Hosted events need hostedEventId and hostedOccurrenceStartsAt from check_booking_availability." };
    }
    const hostedCheck = validateHostedEventSubmission({
      ctx,
      bookingKind: kind,
      hostedEventId,
      requestedDateYmd: dateYmd,
      hostedOccurrenceStartsAt,
    });
    if (!hostedCheck.ok) return { ok: false, message: hostedCheck.message };
    preferredTime = hostedCheck.preferred_time ?? preferredTime;
    const evt = ctx.events.find((e) => e.id === hostedEventId);
    const hit = evt ? expandHostedEventForSubmit(evt, ctx.venue_time_zone).find((o) => o.starts_at === hostedOccurrenceStartsAt) : null;
    if (hit) {
      intakeExtras.hosted_occurrence_starts_at = hit.starts_at;
      intakeExtras.hosted_occurrence_ends_at = hit.ends_at;
    }
    const capCheck = await assertEventCapacityForSubmit({
      eventId: hostedEventId,
      businessId: loaded.businessId,
      wantedGuests: partySize,
      eventTitle: evt?.title ?? "Event",
    });
    if (!capCheck.ok) return { ok: false, message: capCheck.message };
  }

  const email =
    input.guestEmail?.trim() && input.guestEmail.includes("@")
      ? input.guestEmail.trim().toLowerCase()
      : `${guestName.toLowerCase().replace(/[^a-z0-9]+/g, ".")}.${Date.now()}@voice.solviosystems.com`;

  const phone = input.guestPhone?.trim() || null;
  const intakeJson = JSON.stringify(intakeExtras);
  const admin = createSupabaseServiceRoleClient();

  const { data: bookingId, error } = await admin.rpc("submit_booking_request", {
    p_slug: slug,
    p_customer_name: guestName,
    p_email: email,
    p_phone: phone,
    p_notes: input.notes?.trim() || null,
    p_preferred_time: preferredTime,
    p_event_title: kind === "event" ? ctx.events.find((e) => e.id === hostedEventId)?.title ?? null : null,
    p_booking_kind: kind,
    p_requested_date: dateYmd,
    p_guest_count: String(partySize),
    p_intake_extras_json: intakeJson,
    p_rate_key_hash: "",
  });

  if (error || !bookingId) {
    return { ok: false, message: error?.message ?? "Could not save the booking request." };
  }

  const evt = hostedEventId ? ctx.events.find((e) => e.id === hostedEventId) : null;
  const ticketTotal =
    kind === "event"
      ? computeEventTicketCents({ ticketPriceCents: evt?.ticket_price_cents, guestCount: partySize })
      : null;
  const needsDeposit = depositRequired({
    loaded,
    ctx,
    kind,
    preferredTable,
    guestCount: partySize,
    servicePriceCents: service?.price_cents ?? 0,
    eventTicketCents: ticketTotal,
    appointmentDepositCents: loaded.appointmentDepositCents,
  });

  let autoConfirmed = false;
  if (!needsDeposit) {
    const hostedOccEnds =
      typeof intakeExtras.hosted_occurrence_ends_at === "string" ? intakeExtras.hosted_occurrence_ends_at : undefined;
    const confirmed = await autoConfirmBookingRequest({
      bookingRequestId: bookingId as string,
      hints: {
        hostedOccurrenceStartsAt: hostedOccurrenceStartsAt || undefined,
        hostedOccurrenceEndsAt: hostedOccEnds,
        businessEventId: hostedEventId || null,
        floorPlanTableId: preferredTableMatch?.id ?? null,
        serviceDurationMinutes: service?.duration_minutes,
        venueTimeZone: ctx.venue_time_zone,
      },
    });
    autoConfirmed = confirmed.ok;

    await notifyMerchantNewBooking({
      bookingSlug: slug,
      guestName,
      guestEmail: email,
      bookingKind: kind,
      requestedDate: dateYmd ?? undefined,
      preferredTime: preferredTime || undefined,
      guestCount: String(partySize),
      notes: input.notes?.trim() || undefined,
      autoConfirmed,
    });

    return {
      ok: true,
      summary: JSON.stringify({
        bookingRequestId: bookingId,
        status: confirmed.ok ? "confirmed" : "pending",
        bookingKind: kind,
        dateYmd,
        timeLocal: preferredTime,
        message: confirmed.ok
          ? "Booking confirmed in the diary — guest confirmation email/SMS sent if configured."
          : "Booking saved — the team may need to confirm manually in the dashboard.",
      }),
    };
  }

  await notifyMerchantNewBooking({
    bookingSlug: slug,
    guestName,
    guestEmail: email,
    bookingKind: kind,
    requestedDate: dateYmd ?? undefined,
    preferredTime: preferredTime || undefined,
    guestCount: String(partySize),
    notes: input.notes?.trim() || undefined,
    autoConfirmed: false,
  });

  return {
    ok: true,
    summary: JSON.stringify({
      bookingRequestId: bookingId,
      status: "pending_deposit",
      bookingKind: kind,
      dateYmd,
      timeLocal: preferredTime,
      message:
        "Booking saved but needs a deposit to confirm. Call send_deposit_payment_link with bookingRequestId and the guest phone — do not read URLs aloud.",
    }),
  };
}
