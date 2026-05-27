"use server";

import { computeTableDepositCents, computeEventTicketCents } from "@/lib/booking-deposit-pricing";
import { formatMoney } from "@/lib/checkout-money";
import { validateBookingPhone } from "@/lib/normalize-phone";
import { createBookingDepositCheckoutSession } from "@/lib/booking-deposit-checkout";
import { getBookingSubmitRateFingerprint } from "@/lib/booking-submit-fingerprint";
import { parseBookingPublicContext, parseGuestModesFromRpc } from "@/lib/booking-public-context";
import { isBookingGuestMode } from "@/lib/booking-guest-modes";
import { validateHostedEventSubmission } from "@/lib/booking-hosted-submit";
import { assertEventCapacityForSubmit } from "@/lib/booking-event-capacity";
import { validateTableBookingSubmission } from "@/lib/booking-table-rules";
import { dowSundayZeroInBusinessTZ, validateAppointmentSlotSelection, type AppointmentBreak } from "@/lib/booking-appointment-slots";
import { isStaffWorkingOnWeekday } from "@/lib/staff-members";
import { sendBookingRequestReceivedEmail, sendNewBookingNotificationEmail } from "@/lib/notifications/booking-emails";
import { sendBookingRequestReceivedSms } from "@/lib/notifications/booking-sms";
import { getDeploymentSiteUrl } from "@/lib/deployment-site-url";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export type SubmitBookingSummary = {
  bookingKind: string;
  requestedDate?: string;
  preferredTime?: string;
  serviceName?: string;
  staffName?: string;
  guestCount?: string;
  paymentLabel?: string;
};

export type SubmitBookingState =
  | { ok: true; depositCheckoutUrl?: string; emailSent?: boolean; smsSent?: boolean; summary?: SubmitBookingSummary }
  | { ok: false; message: string };

function mergeGuestIntakeNotes(base: string, lines: string[]): string {
  const cleaned = lines.map((l) => l.trim()).filter(Boolean);
  if (!cleaned.length) return base;
  const block = ["--- Guest intake extras ---", ...cleaned.map((l) => `• ${l}`)].join("\n");
  const trimmed = base.trim();
  return trimmed ? `${trimmed}\n\n${block}` : block;
}

function guestFriendlyPreferredTime(raw: string): string {
  const trimmed = raw.trim();
  const slotMatch = /·\s*(\d{2}:\d{2}[–-]\d{2}:\d{2})/.exec(trimmed);
  if (slotMatch) return slotMatch[1];
  return trimmed.replace(/^\d{4}-\d{2}-\d{2}\s·\s*/, "").replace(/\s*\(UTC\)\s*$/, "").trim();
}

export async function submitBookingRequestAction(
  slug: string,
  _prev: SubmitBookingState | null,
  formData: FormData,
): Promise<SubmitBookingState> {
  const customerName = String(formData.get("customer_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phoneDial = String(formData.get("phone_country_dial") ?? "+44").trim();
  const phoneLocal = String(formData.get("phone_local") ?? "").trim();
  const phoneLegacy = String(formData.get("phone") ?? "").trim();
  const preferredTimeRaw = String(formData.get("preferred_time") ?? "").trim();
  let notes = String(formData.get("notes") ?? "").trim();
  const eventTitle = String(formData.get("event_title") ?? "").trim();
  const bookingKind = String(formData.get("booking_kind") ?? "").trim().toLowerCase();
  const requestedDate = String(formData.get("requested_date") ?? "").trim();
  let guestCount = String(formData.get("guest_count") ?? "").trim();
  const preferredTable = String(formData.get("preferred_table") ?? "").trim();
  const hostedEventId = String(formData.get("hosted_event_id") ?? "").trim();
  const hostedOccurrenceStartsAt = String(formData.get("hosted_occurrence_starts_at") ?? "").trim();

  const intakeExtras: Record<string, unknown> = {
    booking_kind_key: bookingKind || null,
  };

  const intakeLines: string[] = [];

  if (preferredTable) {
    intakeExtras.preferred_table = preferredTable;
    intakeLines.push(`Preferred table: ${preferredTable}`);
  }

  const tableAnswers: { question: string; answer: string }[] = [];

  const qCountRaw = Number(formData.get("table_q_count") ?? 0);
  const qCount = Number.isFinite(qCountRaw) ? Math.min(40, Math.max(0, Math.floor(qCountRaw))) : 0;
  for (let i = 0; i < qCount; i++) {
    const label = String(formData.get(`tl_${i}`) ?? "").trim();
    const answer = String(formData.get(`ta_${i}`) ?? "").trim();
    if (!label || label.length > 240) continue;
    if (!answer) continue;
    tableAnswers.push({ question: label, answer });
    intakeLines.push(`${label}: ${answer}`);
  }
  if (tableAnswers.length) {
    intakeExtras.table_question_answers = tableAnswers;
  }

  // Custom event questions (parallel pattern: eq_/ea_ + event_q_count)
  const eventAnswers: { question: string; answer: string }[] = [];
  const eqCountRaw = Number(formData.get("event_q_count") ?? 0);
  const eqCount = Number.isFinite(eqCountRaw) ? Math.min(20, Math.max(0, Math.floor(eqCountRaw))) : 0;
  for (let i = 0; i < eqCount; i++) {
    const label = String(formData.get(`eq_${i}`) ?? "").trim();
    const answer = String(formData.get(`ea_${i}`) ?? "").trim();
    if (!label || label.length > 240) continue;
    if (!answer) continue;
    eventAnswers.push({ question: label, answer });
    intakeLines.push(`${label}: ${answer}`);
  }
  if (eventAnswers.length) {
    intakeExtras.event_question_answers = eventAnswers;
  }

  // Custom appointment questions (parallel pattern: aq_/aa_ + appt_q_count)
  const appointmentAnswers: { question: string; answer: string }[] = [];
  const aqCountRaw = Number(formData.get("appt_q_count") ?? 0);
  const aqCount = Number.isFinite(aqCountRaw) ? Math.min(20, Math.max(0, Math.floor(aqCountRaw))) : 0;
  for (let i = 0; i < aqCount; i++) {
    const label = String(formData.get(`aq_${i}`) ?? "").trim();
    const answer = String(formData.get(`aa_${i}`) ?? "").trim();
    if (!label || label.length > 240) continue;
    if (!answer) continue;
    appointmentAnswers.push({ question: label, answer });
    intakeLines.push(`${label}: ${answer}`);
  }
  if (appointmentAnswers.length) {
    intakeExtras.appointment_question_answers = appointmentAnswers;
  }

  const seatingNotes = String(formData.get("seating_notes") ?? "").trim();
  if (seatingNotes) {
    intakeExtras.seating_notes = seatingNotes;
    intakeLines.push(`Seating notes: ${seatingNotes}`);
  }

  const preferredStaffId = String(formData.get("preferred_staff") ?? "").trim();
  const selectedServiceId = String(formData.get("selected_service") ?? "").trim();

  if (!slug.trim()) {
    return { ok: false, message: "Invalid booking link." };
  }

  const phoneCheck = validateBookingPhone(phoneDial, phoneLocal || phoneLegacy);
  if (!phoneCheck.ok) {
    return { ok: false, message: phoneCheck.message };
  }
  const phone = phoneCheck.e164;

  const supabase = await createSupabaseServerClient();
  const { data: ctxRaw } = await supabase.rpc("get_booking_public_context", { p_slug: slug.trim() });
  const parsedCtx = parseBookingPublicContext(ctxRaw);
  const selectedServiceMatch = selectedServiceId
    ? parsedCtx?.appointment_services.find((s) => s.id === selectedServiceId) ?? null
    : null;

  if (selectedServiceMatch) {
    intakeExtras.selected_service = selectedServiceMatch.name;
    intakeExtras.selected_service_id = selectedServiceMatch.id;
    intakeExtras.selected_service_duration = selectedServiceMatch.duration_minutes;
    intakeExtras.selected_service_price_cents = selectedServiceMatch.price_cents;
    const priceStr =
      selectedServiceMatch.price_cents > 0 ? ` · ${formatMoney(selectedServiceMatch.price_cents)}` : "";
    intakeLines.push(`Service: ${selectedServiceMatch.name} (${selectedServiceMatch.duration_minutes} min)${priceStr}`);
  }

  if (hostedEventId) {
    intakeExtras.hosted_event_id = hostedEventId;
  }

  if (preferredStaffId) {
    const staffMatch = parsedCtx?.staff_members.find((s) => s.id === preferredStaffId);
    if (staffMatch) {
      intakeExtras.preferred_staff = staffMatch.name;
      intakeExtras.preferred_staff_id = staffMatch.id;
      intakeLines.push(`Preferred staff: ${staffMatch.name}`);
    }
  }

  notes = mergeGuestIntakeNotes(notes, intakeLines);

  let intakeJson = "{}";
  try {
    intakeJson =
      typeof intakeExtras === "object"
        ? JSON.stringify(Object.fromEntries(Object.entries(intakeExtras).filter(([, v]) => v != null)))
        : "{}";
  } catch {
    intakeJson = "{}";
  }

  const bkLower = bookingKind.trim().toLowerCase();
  const isAppointmentBooking = bkLower === "appointment";

  if (!guestCount.trim()) {
    if (isAppointmentBooking) {
      guestCount = "1";
    } else {
      return { ok: false, message: "Please enter how many people are coming." };
    }
  }
  const gc = Number.parseInt(guestCount, 10);
  if (!Number.isFinite(gc) || gc < 1 || gc > 999) {
    return { ok: false, message: isAppointmentBooking ? "Invalid appointment request." : "Guest count must be a whole number between 1 and 999." };
  }

  const allowedKinds = parsedCtx ? parseGuestModesFromRpc(parsedCtx.guest_modes_raw) : [];
  const kindOk =
    isBookingGuestMode(bkLower) && (allowedKinds.length === 0 || allowedKinds.some((m) => m === bkLower));

  if (
    isAppointmentBooking &&
    (parsedCtx?.appointment_services?.length ?? 0) > 0 &&
    !selectedServiceId
  ) {
    return { ok: false, message: "Please choose a service for your appointment." };
  }
  const needsPreferredDateOutsideHostedCalendar =
    kindOk &&
    bkLower !== "event" &&
    ((bkLower === "appointment" && (parsedCtx?.appointment_hours?.length ?? 0) > 0) ||
      (bkLower === "table" && (parsedCtx?.tables?.length ?? 0) > 0));

  if (needsPreferredDateOutsideHostedCalendar && !requestedDate.trim()) {
    return { ok: false, message: "Choose your preferred date for this enquiry." };
  }

  if (
    isAppointmentBooking &&
    (parsedCtx?.appointment_hours?.length ?? 0) > 0 &&
    requestedDate.trim() &&
    preferredTimeRaw.trim() &&
    /\d{4}-\d{2}-\d{2}\s·\s\d{2}:\d{2}/.test(preferredTimeRaw)
  ) {
    const dow = dowSundayZeroInBusinessTZ(requestedDate, parsedCtx!.venue_time_zone);
    const hourRow = parsedCtx!.appointment_hours.find((h) => h.weekday === dow);
    if (hourRow) {
      const staffMatch = preferredStaffId ? parsedCtx!.staff_members.find((s) => s.id === preferredStaffId) : null;
      const staffWorking = parsedCtx!.staff_members
        .filter((m) => isStaffWorkingOnWeekday(m, dow))
        .map((m) => m.name);

      let breaks: AppointmentBreak[] = [];
      const { data: bizRow } = await supabase
        .from("businesses")
        .select("id")
        .ilike("booking_slug", slug.trim())
        .maybeSingle();
      if (bizRow?.id) {
        const { data: brkData } = await supabase
          .from("appointment_breaks")
          .select("weekdays, start_time, end_time")
          .eq("business_id", bizRow.id);
        breaks = (brkData ?? []) as AppointmentBreak[];
      }

      const slotCheck = validateAppointmentSlotSelection({
        preferredTime: preferredTimeRaw,
        dateYmd: requestedDate,
        row: hourRow,
        venueTimeZone: parsedCtx!.venue_time_zone,
        exceptions: parsedCtx!.appointment_slot_exceptions,
        breaks,
        bookedSlots: parsedCtx!.appointment_booked_slots ?? [],
        preferredStaffName: staffMatch?.name ?? null,
        staffWorkingThatDay: staffWorking,
        serviceDurationMinutes: selectedServiceMatch?.duration_minutes ?? null,
      });
      if (!slotCheck.ok) {
        return { ok: false, message: slotCheck.message };
      }
    }
  }

  const hostedCheck = validateHostedEventSubmission({
    ctx: parsedCtx,
    bookingKind,
    hostedEventId,
    requestedDateYmd: requestedDate,
    hostedOccurrenceStartsAt,
  });
  if (!hostedCheck.ok) {
    return { ok: false, message: hostedCheck.message };
  }

  const preferredTime = hostedCheck.preferred_time ?? preferredTimeRaw;

  const tableBookingCheck = validateTableBookingSubmission({
    ctx: parsedCtx,
    bookingKind,
    preferredTableLabel: preferredTable,
    requestedDateYmd: requestedDate,
  });
  if (!tableBookingCheck.ok) {
    return { ok: false, message: tableBookingCheck.message };
  }

  // Event capacity guard — fresh DB read to reduce overbooking races.
  if (bookingKind === "event" && hostedEventId && parsedCtx) {
    const admin = createSupabaseServiceRoleClient();
    const { data: bizRow } = await admin
      .from("businesses")
      .select("id")
      .ilike("booking_slug", slug.trim())
      .maybeSingle();
    const evt = parsedCtx.events.find((e) => e.id === hostedEventId);
    const wantedParsed = parseInt(guestCount, 10);
    const wanted = Number.isFinite(wantedParsed) && wantedParsed > 0 ? wantedParsed : 1;
    if (bizRow?.id && evt) {
      const capCheck = await assertEventCapacityForSubmit({
        eventId: hostedEventId,
        businessId: bizRow.id,
        wantedGuests: wanted,
        eventTitle: evt.title,
      });
      if (!capCheck.ok) {
        return { ok: false, message: capCheck.message };
      }
    }
  }

  const rateKeyHash = await getBookingSubmitRateFingerprint(slug.trim());

  const { data: bookingId, error } = await supabase.rpc("submit_booking_request", {
    p_slug: slug.trim(),
    p_customer_name: customerName,
    p_email: email,
    p_phone: phone,
    p_notes: notes,
    p_preferred_time: preferredTime,
    p_event_title: eventTitle,
    p_booking_kind: bookingKind,
    p_requested_date: requestedDate,
    p_guest_count: guestCount,
    p_intake_extras_json: intakeJson,
    p_rate_key_hash: rateKeyHash ?? "",
  });

  if (error) {
    const msg = error.message || "Could not send your request.";
    if (/Business not found/i.test(msg)) {
      return { ok: false, message: "This booking page is not available." };
    }
    if (/Too many submissions/i.test(msg)) {
      return { ok: false, message: "Too many submissions from this browser. Wait a short while and retry." };
    }
    if (/required|invalid|pick/i.test(msg)) {
      return { ok: false, message: msg };
    }
    return { ok: false, message: msg };
  }

  let depositCheckoutUrl: string | undefined;

  if (
    parsedCtx &&
    bookingId &&
    typeof bookingId === "string" &&
    bkLower === "table" &&
    allowedKinds.includes("table")
  ) {
    const depositCents = computeTableDepositCents({
      ctx: parsedCtx,
      preferredTableLabel: preferredTable,
      guestCount: gc,
    });

    if (depositCents && depositCents > 0) {
      try {
        const admin = createSupabaseServiceRoleClient();
        const { data: bookingRow } = await admin
          .from("booking_requests")
          .select("business_id")
          .eq("id", bookingId)
          .maybeSingle();

        if (bookingRow?.business_id) {
          const { data: biz } = await admin
            .from("businesses")
            .select("id, stripe_connect_account_id, stripe_connect_charges_enabled")
            .eq("id", bookingRow.business_id)
            .maybeSingle();

          const connectId = biz?.stripe_connect_account_id?.trim();
          if (connectId && biz?.stripe_connect_charges_enabled && biz.id) {
            const label = preferredTable.trim() || "Table deposit";
            const url = await createBookingDepositCheckoutSession({
              bookingRequestId: bookingId,
              businessId: biz.id,
              connectAccountId: connectId,
              amountCents: depositCents,
              guestEmail: email,
              description: `${parsedCtx.business_name} · ${label}`,
              slug: slug.trim(),
              checkoutKind: "table",
            });
            if (url) depositCheckoutUrl = url;
          }
        }
      } catch {
        /* deposit is additive — enquiry already saved */
      }
    }
  }

  // Appointment checkout — service price first, else flat appointment_deposit_cents.
  if (
    parsedCtx &&
    bookingId &&
    typeof bookingId === "string" &&
    bkLower === "appointment" &&
    allowedKinds.includes("appointment") &&
    !depositCheckoutUrl
  ) {
    try {
      const admin = createSupabaseServiceRoleClient();
      const { data: bookingRow } = await admin
        .from("booking_requests")
        .select("business_id")
        .eq("id", bookingId)
        .maybeSingle();

      if (bookingRow?.business_id) {
        const { data: biz } = await admin
          .from("businesses")
          .select("id, appointment_deposit_cents, stripe_connect_account_id, stripe_connect_charges_enabled")
          .eq("id", bookingRow.business_id)
          .maybeSingle();

        const servicePriceCents = selectedServiceMatch?.price_cents ?? 0;
        const flatDepositCents = Number(biz?.appointment_deposit_cents ?? 0);
        const amountCents = servicePriceCents > 0 ? servicePriceCents : flatDepositCents;
        const connectId = biz?.stripe_connect_account_id?.trim();
        if (amountCents > 0 && connectId && biz?.stripe_connect_charges_enabled && biz.id) {
          const checkoutLabel = selectedServiceMatch?.name?.trim() || "Appointment";
          const url = await createBookingDepositCheckoutSession({
            bookingRequestId: bookingId,
            businessId: biz.id,
            connectAccountId: connectId,
            amountCents,
            guestEmail: email,
            description: `${parsedCtx.business_name} · ${checkoutLabel}`,
            slug: slug.trim(),
            checkoutKind: "appointment",
          });
          if (url) depositCheckoutUrl = url;
        }
      }
    } catch {
      /* additive — booking request is already saved as pending */
    }
  }

  // Event ticket checkout — ticket price × party size when Stripe Connect is ready.
  if (
    parsedCtx &&
    bookingId &&
    typeof bookingId === "string" &&
    bkLower === "event" &&
    allowedKinds.includes("event") &&
    !depositCheckoutUrl &&
    hostedEventId
  ) {
    const evt = parsedCtx.events.find((e) => e.id === hostedEventId);
    const ticketTotal = computeEventTicketCents({
      ticketPriceCents: evt?.ticket_price_cents,
      guestCount: gc,
    });

    if (ticketTotal && ticketTotal > 0) {
      try {
        const admin = createSupabaseServiceRoleClient();
        const { data: bookingRow } = await admin
          .from("booking_requests")
          .select("business_id")
          .eq("id", bookingId)
          .maybeSingle();

        if (bookingRow?.business_id) {
          const { data: biz } = await admin
            .from("businesses")
            .select("id, stripe_connect_account_id, stripe_connect_charges_enabled")
            .eq("id", bookingRow.business_id)
            .maybeSingle();

          const connectId = biz?.stripe_connect_account_id?.trim();
          if (connectId && biz?.stripe_connect_charges_enabled && biz.id) {
            const eventLabel = (evt?.title ?? eventTitle).trim() || "Event tickets";
            const url = await createBookingDepositCheckoutSession({
              bookingRequestId: bookingId,
              businessId: biz.id,
              connectAccountId: connectId,
              amountCents: ticketTotal,
              guestEmail: email,
              description: `${parsedCtx.business_name} · ${eventLabel}`,
              slug: slug.trim(),
              checkoutKind: "event",
            });
            if (url) depositCheckoutUrl = url;
          }
        }
      } catch {
        /* additive — enquiry already saved */
      }
    }
  }

  let emailSent = false;
  let smsSent = false;
  const siteUrl = getDeploymentSiteUrl();
  const merchantName = parsedCtx?.business_name?.trim();

  const staffMatch = preferredStaffId ? parsedCtx?.staff_members.find((s) => s.id === preferredStaffId) : null;
  let paymentLabel: string | undefined;
  if (depositCheckoutUrl) {
    const tableDeposit =
      bkLower === "table"
        ? computeTableDepositCents({ ctx: parsedCtx!, preferredTableLabel: preferredTable, guestCount: gc })
        : null;
    const eventTicket =
      bkLower === "event" && hostedEventId
        ? computeEventTicketCents({
            ticketPriceCents: parsedCtx!.events.find((e) => e.id === hostedEventId)?.ticket_price_cents,
            guestCount: gc,
          })
        : null;
    const amountCents =
      selectedServiceMatch?.price_cents && selectedServiceMatch.price_cents > 0
        ? selectedServiceMatch.price_cents
        : tableDeposit && tableDeposit > 0
          ? tableDeposit
          : eventTicket && eventTicket > 0
            ? eventTicket
            : null;
    if (amountCents) paymentLabel = `Complete ${formatMoney(amountCents)} on Stripe to secure your booking.`;
  }

  const summary: SubmitBookingSummary = {
    bookingKind: bkLower,
    requestedDate: requestedDate.trim() || undefined,
    preferredTime: preferredTimeRaw.trim() ? guestFriendlyPreferredTime(preferredTimeRaw) : undefined,
    serviceName: selectedServiceMatch?.name,
    staffName: staffMatch?.name,
    guestCount: guestCount.trim() || undefined,
    paymentLabel,
  };

  if (merchantName && email) {
    const guestEmailResult = await sendBookingRequestReceivedEmail({
      guestEmail: email,
      guestName: customerName,
      merchantName,
      siteUrl,
      bookingKind: bkLower,
      requestedDate: summary.requestedDate,
      preferredTime: summary.preferredTime,
      serviceName: summary.serviceName,
      staffName: summary.staffName,
      guestCount: summary.guestCount,
      paymentNote: paymentLabel,
    });
    emailSent = guestEmailResult.ok;
    if (!guestEmailResult.ok) {
      console.error("[booking-submit] guest email failed:", guestEmailResult.message);
    }
  }

  if (merchantName && phone) {
    const guestSmsResult = await sendBookingRequestReceivedSms({
      phoneE164: phone,
      merchantName,
    });
    smsSent = guestSmsResult.ok;
    if (!guestSmsResult.ok && guestSmsResult.reason !== "not_configured") {
      console.error("[booking-submit] guest SMS failed:", guestSmsResult.message);
    }
  }

  try {
    const adminClient = createSupabaseServiceRoleClient();
    const { data: biz } = await adminClient
      .from("businesses")
      .select("owner_id, name")
      .eq("booking_slug", slug.trim())
      .maybeSingle();
    if (biz?.owner_id) {
      const { data: ownerProfile } = await adminClient
        .from("profiles")
        .select("email")
        .eq("id", biz.owner_id)
        .maybeSingle();
      if (ownerProfile?.email) {
        const merchantEmailResult = await sendNewBookingNotificationEmail({
          merchantEmail: ownerProfile.email,
          merchantName: biz.name,
          guestName: customerName,
          guestEmail: email,
          bookingKind,
          requestedDate,
          preferredTime: preferredTimeRaw,
          guestCount,
          notes,
          dashboardUrl: siteUrl,
        });
        if (!merchantEmailResult.ok) {
          console.error("[booking-submit] merchant email failed:", merchantEmailResult.message);
        }
      }
    }
  } catch (err) {
    console.error("[booking-submit] merchant notify error:", err);
  }

  return {
    ok: true,
    emailSent,
    smsSent,
    summary,
    ...(depositCheckoutUrl ? { depositCheckoutUrl } : {}),
  };
}
