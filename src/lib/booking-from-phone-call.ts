import { formatMoney } from "@/lib/checkout-money";
import { normalizePhoneE164 } from "@/lib/normalize-phone";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export type CallBookingDetails = {
  guestName: string;
  guestEmail?: string;
  dateYmd: string;
  timeLocal: string;
  partySize: number;
  notes?: string;
  bookingKind?: string;
  eventTitle?: string;
};

function formatDepositLabel(cents: number): string {
  return formatMoney(cents);
}

/** Best-effort parse "7:30pm" / "19:30" / "8 PM" → {hours, minutes}. */
export function parseCallTimeLocal(text: string | null | undefined): { h: number; m: number } | null {
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

function parseDateYmd(raw: string): string | null {
  const trimmed = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const d = new Date(`${trimmed}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return trimmed;
}

function fallbackGuestEmail(guestName: string, phoneE164: string): string {
  const slug = phoneE164.replace(/\D/g, "").slice(-12) || "guest";
  const namePart = guestName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 24);
  return `${namePart || "guest"}.${slug}@pay.solviosystems.com`;
}

function bookingWindowFromDetails(details: CallBookingDetails): { startsAt: string; endsAt: string } | null {
  const dateYmd = parseDateYmd(details.dateYmd);
  if (!dateYmd) return null;
  const time = parseCallTimeLocal(details.timeLocal) ?? { h: 19, m: 0 };
  const startsLocal = new Date(
    `${dateYmd}T${String(time.h).padStart(2, "0")}:${String(time.m).padStart(2, "0")}:00`,
  );
  if (Number.isNaN(startsLocal.getTime())) return null;
  const endsLocal = new Date(startsLocal.getTime() + 60 * 60 * 1000);
  return { startsAt: startsLocal.toISOString(), endsAt: endsLocal.toISOString() };
}

function formatWhenForSms(details: CallBookingDetails): string {
  const dateYmd = parseDateYmd(details.dateYmd);
  const time = parseCallTimeLocal(details.timeLocal);
  if (!dateYmd) return details.timeLocal.trim() || "your requested time";
  const d = new Date(`${dateYmd}T12:00:00Z`);
  const dateStr = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  if (!time) return dateStr;
  const t = new Date(`${dateYmd}T${String(time.h).padStart(2, "0")}:${String(time.m).padStart(2, "0")}:00`);
  const timeStr = t.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${dateStr} at ${timeStr}`;
}

export function parseCallBookingDetailsFromToolArgs(args: Record<string, unknown> | undefined): CallBookingDetails | null {
  if (!args) return null;
  const guestName = typeof args.guestName === "string" ? args.guestName.trim() : "";
  const dateYmd =
    (typeof args.dateYmd === "string" ? args.dateYmd.trim() : "") ||
    (typeof args.date === "string" ? args.date.trim() : "");
  const timeLocal =
    (typeof args.timeLocal === "string" ? args.timeLocal.trim() : "") ||
    (typeof args.time === "string" ? args.time.trim() : "") ||
    (typeof args.preferredTime === "string" ? args.preferredTime.trim() : "");
  const partyRaw = args.partySize ?? args.guestCount ?? args.party_size;
  const partySize =
    typeof partyRaw === "number"
      ? Math.round(partyRaw)
      : typeof partyRaw === "string"
        ? Number.parseInt(partyRaw, 10)
        : NaN;

  if (!guestName || !dateYmd || !timeLocal || !Number.isFinite(partySize) || partySize < 1) {
    return null;
  }

  return {
    guestName,
    guestEmail: typeof args.guestEmail === "string" ? args.guestEmail.trim() : undefined,
    dateYmd,
    timeLocal,
    partySize,
    notes: typeof args.notes === "string" ? args.notes.trim() : undefined,
    bookingKind: typeof args.bookingKind === "string" ? args.bookingKind.trim().toLowerCase() : "table",
    eventTitle: typeof args.eventTitle === "string" ? args.eventTitle.trim() : undefined,
  };
}

export async function resolveBusinessIdForVapiToolCall(params: {
  metadata: Record<string, unknown>;
  assistantId?: string;
  phoneNumberId?: string;
}): Promise<string | null> {
  const fromMeta = typeof params.metadata.solvio_business_id === "string" ? params.metadata.solvio_business_id.trim() : "";
  if (fromMeta) return fromMeta;

  const admin = createSupabaseServiceRoleClient();

  const assistantId = params.assistantId?.trim();
  if (assistantId) {
    const { data: rows } = await admin
      .from("businesses")
      .select("id")
      .filter("voice_receptionist_details->>vapi_assistant_id", "eq", assistantId)
      .limit(1);
    if (rows?.[0]?.id) return rows[0].id as string;
  }

  const phoneNumberId = params.phoneNumberId?.trim();
  if (phoneNumberId) {
    const { data: row } = await admin
      .from("businesses")
      .select("id")
      .eq("vapi_phone_number_id", phoneNumberId)
      .maybeSingle();
    if (row?.id) return row.id as string;
  }

  return null;
}

export async function createBookingFromPhoneCall(params: {
  businessId: string;
  businessName: string;
  guestPhoneE164: string;
  details: CallBookingDetails;
  vapiCallId?: string;
}): Promise<
  | { ok: true; bookingRequestId: string; venueCalendarBookingId: string }
  | { ok: false; message: string }
> {
  const phone = normalizePhoneE164(params.guestPhoneE164) ?? params.guestPhoneE164.trim();
  if (!phone.startsWith("+")) {
    return { ok: false, message: "Guest phone must include country code (+44…)." };
  }

  const window = bookingWindowFromDetails(params.details);
  if (!window) {
    return { ok: false, message: "Could not parse booking date/time — use YYYY-MM-DD and a time like 8pm." };
  }

  const guestName = params.details.guestName.trim();
  const guestEmail =
    params.details.guestEmail && params.details.guestEmail.includes("@")
      ? params.details.guestEmail.trim().toLowerCase()
      : fallbackGuestEmail(guestName, phone);

  const bookingKind = params.details.bookingKind?.trim() || "table";
  const title =
    params.details.eventTitle?.trim() ||
    `${guestName} · ${bookingKind === "table" ? "table for " + params.details.partySize : bookingKind}`;

  const admin = createSupabaseServiceRoleClient();

  const { count: overlapCount } = await admin
    .from("venue_calendar_bookings")
    .select("*", { count: "exact", head: true })
    .eq("business_id", params.businessId)
    .neq("status", "cancelled")
    .lt("starts_at", window.endsAt)
    .gt("ends_at", window.startsAt);

  if (typeof overlapCount === "number" && overlapCount > 0) {
    return {
      ok: false,
      message: "That slot overlaps another booking — ask the guest for a different time.",
    };
  }

  const { data: reqRow, error: reqErr } = await admin
    .from("booking_requests")
    .insert({
      business_id: params.businessId,
      customer_name: guestName,
      email: guestEmail,
      phone,
      notes: params.details.notes?.trim() || null,
      preferred_time: params.details.timeLocal.trim(),
      requested_date: parseDateYmd(params.details.dateYmd),
      guest_count: params.details.partySize,
      booking_kind: bookingKind,
      event_title: title.slice(0, 480),
      source: "voice",
      payment_status: "none",
    })
    .select("id")
    .single();

  if (reqErr || !reqRow?.id) {
    return { ok: false, message: reqErr?.message ?? "Could not save the booking enquiry." };
  }

  const { data: vcRow, error: vcErr } = await admin
    .from("venue_calendar_bookings")
    .insert({
      business_id: params.businessId,
      booking_request_id: reqRow.id,
      title: title.slice(0, 480),
      booking_kind: bookingKind,
      starts_at: window.startsAt,
      ends_at: window.endsAt,
      guest_name: guestName,
      guest_email: guestEmail,
      guest_phone: phone,
      guest_count: params.details.partySize,
      status: "tentative",
      internal_notes: params.vapiCallId ? `Created on AI call ${params.vapiCallId} — awaiting deposit.` : "Awaiting deposit from AI call.",
    })
    .select("id")
    .single();

  if (vcErr || !vcRow?.id) {
    return { ok: false, message: vcErr?.message ?? "Could not add the booking to the calendar." };
  }

  await admin.from("booking_messages").insert({
    booking_request_id: reqRow.id,
    business_id: params.businessId,
    direction: "outbound",
    channel: "note",
    body: `Booking captured on phone call — ${formatWhenForSms(params.details)}, party of ${params.details.partySize}.`,
    metadata: {
      delivery: "vapi_deposit_tool",
      ...(params.vapiCallId ? { vapi_call_id: params.vapiCallId } : {}),
      venue_calendar_booking_id: vcRow.id,
    },
  });

  return {
    ok: true,
    bookingRequestId: reqRow.id as string,
    venueCalendarBookingId: vcRow.id as string,
  };
}

export function buildDepositSmsBody(params: {
  businessName: string;
  guestName: string;
  amountCents: number;
  checkoutUrl: string;
  callDetails?: CallBookingDetails;
  bookingWhenLabel?: string;
}): string {
  const biz = params.businessName.trim() || "Your venue";
  const guest = params.guestName.trim() || "there";
  const when = params.callDetails
    ? formatWhenForSms(params.callDetails)
    : params.bookingWhenLabel?.trim() || "your booking";

  const partyLine =
    params.callDetails && params.callDetails.partySize > 0
      ? `Party of ${params.callDetails.partySize}. `
      : "";

  const notesLine = params.callDetails?.notes?.trim() ? `Notes: ${params.callDetails.notes.trim()}. ` : "";

  return [
    `Hi ${guest} — ${biz}`,
    `${partyLine}${when}.`.replace(/\s+/g, " "),
    notesLine.trim(),
    `Secure deposit ${formatDepositLabel(params.amountCents)} to confirm:`,
    params.checkoutUrl,
    "Pay on Stripe — your table is held once payment completes.",
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export { formatDepositLabel as formatDepositEuro };
