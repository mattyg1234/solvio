"use server";

import { getBookingSubmitRateFingerprint } from "@/lib/booking-submit-fingerprint";
import { parseBookingPublicContext, parseGuestModesFromRpc } from "@/lib/booking-public-context";
import { isBookingGuestMode } from "@/lib/booking-guest-modes";
import { validateHostedEventSubmission } from "@/lib/booking-hosted-submit";
import { validateTableBookingSubmission } from "@/lib/booking-table-rules";
import { sendBookingRequestReceivedEmail } from "@/lib/notifications/booking-emails";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site-url";

export type SubmitBookingState = { ok: true } | { ok: false; message: string };

function mergeGuestIntakeNotes(base: string, lines: string[]): string {
  const cleaned = lines.map((l) => l.trim()).filter(Boolean);
  if (!cleaned.length) return base;
  const block = ["--- Guest intake extras ---", ...cleaned.map((l) => `• ${l}`)].join("\n");
  const trimmed = base.trim();
  return trimmed ? `${trimmed}\n\n${block}` : block;
}

export async function submitBookingRequestAction(
  slug: string,
  _prev: SubmitBookingState | null,
  formData: FormData,
): Promise<SubmitBookingState> {
  const customerName = String(formData.get("customer_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const preferredTimeRaw = String(formData.get("preferred_time") ?? "").trim();
  let notes = String(formData.get("notes") ?? "").trim();
  const eventTitle = String(formData.get("event_title") ?? "").trim();
  const bookingKind = String(formData.get("booking_kind") ?? "").trim().toLowerCase();
  const requestedDate = String(formData.get("requested_date") ?? "").trim();
  const guestCount = String(formData.get("guest_count") ?? "").trim();
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

  const seatingNotes = String(formData.get("seating_notes") ?? "").trim();
  if (seatingNotes) {
    intakeExtras.seating_notes = seatingNotes;
    intakeLines.push(`Seating notes: ${seatingNotes}`);
  }

  notes = mergeGuestIntakeNotes(notes, intakeLines);

  if (!slug.trim()) {
    return { ok: false, message: "Invalid booking link." };
  }

  const rateKeyHash = await getBookingSubmitRateFingerprint(slug.trim());
  let intakeJson = "{}";
  try {
    intakeJson =
      typeof intakeExtras === "object"
        ? JSON.stringify(Object.fromEntries(Object.entries(intakeExtras).filter(([, v]) => v != null)))
        : "{}";
  } catch {
    intakeJson = "{}";
  }

  const supabase = await createSupabaseServerClient();
  const { data: ctxRaw } = await supabase.rpc("get_booking_public_context", { p_slug: slug.trim() });
  const parsedCtx = parseBookingPublicContext(ctxRaw);

  const bkLower = bookingKind.trim().toLowerCase();
  if (!guestCount.trim()) {
    return { ok: false, message: "Please enter how many people are coming." };
  }
  const gc = Number.parseInt(guestCount, 10);
  if (!Number.isFinite(gc) || gc < 1 || gc > 999) {
    return { ok: false, message: "Guest count must be a whole number between 1 and 999." };
  }

  const allowedKinds = parsedCtx ? parseGuestModesFromRpc(parsedCtx.guest_modes_raw) : [];
  const kindOk =
    isBookingGuestMode(bkLower) && (allowedKinds.length === 0 || allowedKinds.some((m) => m === bkLower));
  const needsPreferredDateOutsideHostedCalendar =
    kindOk &&
    bkLower !== "event" &&
    ((bkLower === "appointment" && (parsedCtx?.appointment_hours?.length ?? 0) > 0) ||
      (bkLower === "table" && (parsedCtx?.tables?.length ?? 0) > 0));

  if (needsPreferredDateOutsideHostedCalendar && !requestedDate.trim()) {
    return { ok: false, message: "Choose your preferred date for this enquiry." };
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

  const { error } = await supabase.rpc("submit_booking_request", {
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

  try {
    const siteUrl = (await getSiteUrl()).replace(/\/$/, "");
    const merchantName = parsedCtx?.business_name?.trim();
    if (merchantName && email) {
      await sendBookingRequestReceivedEmail({
        guestEmail: email,
        guestName: customerName,
        merchantName,
        siteUrl,
      });
    }
  } catch {
    /* email is additive */
  }

  return { ok: true };
}
