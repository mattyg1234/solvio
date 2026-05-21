"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  buildBookingGuestAssistantOverrides,
  composeBookingGuestCallScript,
  formatBookingWhen,
  type BookingGuestCallPurpose,
} from "@/lib/booking-guest-call";
import type { GuestCallPaymentContext } from "@/lib/booking-guest-call-tools";
import { normalizePhoneE164WithFallbacks, type BookingPhoneDialCode } from "@/lib/normalize-phone";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { startOutboundCall } from "@/lib/vapi-outbound";
import { getSolvioOutboundPhoneNumberId } from "@/lib/voice-platform-env";

export type GuestCallActionResult = { ok: true; callId: string; message: string } | { ok: false; message: string };

type BusinessVoiceRow = {
  id: string;
  name: string;
  time_zone: string | null;
  phone_number_country: string | null;
  vapi_phone_number_id: string | null;
  voice_receptionist_details: unknown;
  booking_slug: string | null;
  stripe_connect_account_id: string | null;
  stripe_connect_charges_enabled: boolean | null;
};

function defaultDialForBusinessCountry(country: string | null | undefined): BookingPhoneDialCode {
  switch (country?.trim().toUpperCase()) {
    case "US":
    case "CA":
      return "+1";
    case "ES":
      return "+34";
    case "IE":
      return "+353";
    case "FR":
      return "+33";
    case "DE":
      return "+49";
    case "IT":
      return "+39";
    case "AU":
      return "+61";
    case "GB":
    default:
      return "+44";
  }
}

function parseReceptionist(details: unknown): { assistantId: string; name: string } {
  if (!details || typeof details !== "object") return { assistantId: "", name: "" };
  const o = details as Record<string, unknown>;
  return {
    assistantId: typeof o.vapi_assistant_id === "string" ? o.vapi_assistant_id.trim() : "",
    name: typeof o.receptionist_name === "string" ? o.receptionist_name.trim() : "",
  };
}

async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

async function loadOwnedBusiness(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
  businessId: string,
): Promise<BusinessVoiceRow | null> {
  const { data } = await supabase
    .from("businesses")
    .select(
      "id,name,time_zone,phone_number_country,vapi_phone_number_id,voice_receptionist_details,booking_slug,stripe_connect_account_id,stripe_connect_charges_enabled",
    )
    .eq("id", businessId)
    .eq("owner_id", userId)
    .maybeSingle();
  return (data as BusinessVoiceRow | null) ?? null;
}

function paymentContextForCall(business: BusinessVoiceRow, purpose: BookingGuestCallPurpose): GuestCallPaymentContext | undefined {
  if (purpose === "booking_cancelled") return undefined;
  const connectId = business.stripe_connect_account_id?.trim();
  if (!connectId || !business.stripe_connect_charges_enabled || !business.booking_slug?.trim()) {
    return undefined;
  }
  return { businessName: business.name };
}

async function placeGuestCall(params: {
  business: BusinessVoiceRow;
  guestName: string;
  guestPhone: string;
  bookingTitle: string;
  startsAt: string;
  endsAt: string;
  purpose: BookingGuestCallPurpose;
  changeSummary?: string;
  customScript?: string;
  venueCalendarBookingId?: string;
  bookingRequestId?: string;
}): Promise<GuestCallActionResult> {
  const phone = normalizePhoneE164WithFallbacks(
    params.guestPhone,
    defaultDialForBusinessCountry(params.business.phone_number_country),
  );
  if (!phone) {
    return {
      ok: false,
      message:
        "Guest phone isn't valid for calling — edit the booking and save a mobile with country code (e.g. +44 7700 900123).",
    };
  }

  const { assistantId, name: receptionistName } = parseReceptionist(params.business.voice_receptionist_details);
  if (!assistantId) {
    return {
      ok: false,
      message: "Set up your AI receptionist first (Dashboard → Your AI receptionist), then try again.",
    };
  }

  const outboundId = params.business.vapi_phone_number_id?.trim() || getSolvioOutboundPhoneNumberId();
  if (!outboundId) {
    return {
      ok: false,
      message:
        "Outbound calling isn't configured yet. Claim a phone number under Phone numbers, or set SOLVIO_VAPI_OUTBOUND_PHONE_NUMBER_ID on the deployment.",
    };
  }

  const when = formatBookingWhen(params.startsAt, params.endsAt, params.business.time_zone ?? undefined);
  const script = composeBookingGuestCallScript({
    businessName: params.business.name,
    guestName: params.guestName,
    bookingTitle: params.bookingTitle,
    bookingWhen: when,
    purpose: params.purpose,
    changeSummary: params.changeSummary,
    customScript: params.customScript,
    receptionistName,
  });

  const payment = paymentContextForCall(params.business, params.purpose);

  const callRes = await startOutboundCall({
    assistantId,
    toPhoneE164: phone,
    phoneNumberId: outboundId,
    metadata: {
      solvio_business_id: params.business.id,
      solvio_call_purpose: params.purpose,
      solvio_guest_phone: phone,
      ...(params.venueCalendarBookingId ? { solvio_venue_calendar_booking_id: params.venueCalendarBookingId } : {}),
      ...(params.bookingRequestId ? { solvio_booking_request_id: params.bookingRequestId } : {}),
    },
    assistantOverrides: buildBookingGuestAssistantOverrides(script, payment),
  });

  if (!callRes.ok) return callRes;

  const admin = createSupabaseServiceRoleClient();
  await admin.from("voice_call_logs").insert({
    business_id: params.business.id,
    direction: "outbound",
    vapi_call_id: callRes.callId,
    caller_phone: phone,
    caller_name: params.guestName,
    started_at: new Date().toISOString(),
    call_purpose: params.purpose,
    venue_calendar_booking_id: params.venueCalendarBookingId ?? null,
    booking_request_id: params.bookingRequestId ?? null,
    transcript_summary: script.logBody.slice(0, 500),
  });

  if (params.venueCalendarBookingId) {
    await admin.from("venue_calendar_booking_messages").insert({
      venue_calendar_booking_id: params.venueCalendarBookingId,
      business_id: params.business.id,
      direction: "outbound",
      channel: "voice",
      body: script.logBody,
      vapi_call_id: callRes.callId,
      metadata: { purpose: params.purpose, delivery: "vapi_outbound" },
    });
  }

  if (params.bookingRequestId) {
    await admin.from("booking_messages").insert({
      booking_request_id: params.bookingRequestId,
      business_id: params.business.id,
      direction: "outbound",
      channel: "voice",
      body: script.logBody,
      metadata: { purpose: params.purpose, delivery: "vapi_outbound", vapi_call_id: callRes.callId },
    });
  }

  revalidatePath("/dashboard/bookings");
  revalidatePath("/dashboard/calls");

  return {
    ok: true,
    callId: callRes.callId,
    message: payment
      ? `Calling ${params.guestName} now — your receptionist can create the booking and text a secure deposit link during the call.`
      : `Calling ${params.guestName} now — your receptionist will share the update.`,
  };
}

/** Place an AI outbound call to a confirmed calendar guest. */
export async function callVenueCalendarGuestAction(params: {
  venueCalendarBookingId: string;
  purpose: BookingGuestCallPurpose;
  changeSummary?: string;
  customScript?: string;
}): Promise<GuestCallActionResult> {
  const { supabase, user } = await requireUser();
  const bookingId = params.venueCalendarBookingId.trim();
  if (!bookingId) return { ok: false, message: "Missing booking." };

  const { data: row } = await supabase
    .from("venue_calendar_bookings")
    .select("id,business_id,guest_name,guest_phone,title,starts_at,ends_at,status")
    .eq("id", bookingId)
    .maybeSingle();

  if (!row?.business_id) return { ok: false, message: "Booking not found." };
  if (row.status === "cancelled" && params.purpose !== "booking_cancelled" && params.purpose !== "custom") {
    return { ok: false, message: "This booking is cancelled — use “Booking cancelled” or a custom script." };
  }
  if (!row.guest_phone?.trim()) {
    return { ok: false, message: "No phone number on this booking — add one under Edit first." };
  }

  const business = await loadOwnedBusiness(supabase, user.id, row.business_id);
  if (!business) return { ok: false, message: "Unauthorized." };

  return placeGuestCall({
    business,
    guestName: row.guest_name,
    guestPhone: row.guest_phone,
    bookingTitle: row.title,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    purpose: params.purpose,
    changeSummary: params.changeSummary,
    customScript: params.customScript,
    venueCalendarBookingId: row.id,
  });
}

/** Place an AI outbound call for an inbox booking request (enquiry follow-up). */
export async function callBookingRequestGuestAction(params: {
  bookingRequestId: string;
  purpose: BookingGuestCallPurpose;
  changeSummary?: string;
  customScript?: string;
}): Promise<GuestCallActionResult> {
  const { supabase, user } = await requireUser();
  const requestId = params.bookingRequestId.trim();
  if (!requestId) return { ok: false, message: "Missing request." };

  const { data: req } = await supabase
    .from("booking_requests")
    .select("id,business_id,customer_name,phone,event_title,preferred_time")
    .eq("id", requestId)
    .maybeSingle();

  if (!req?.business_id) return { ok: false, message: "Request not found." };
  if (!req.phone?.trim()) {
    return { ok: false, message: "No phone on this request." };
  }

  const business = await loadOwnedBusiness(supabase, user.id, req.business_id);
  if (!business) return { ok: false, message: "Unauthorized." };

  const now = new Date();
  const ends = new Date(now.getTime() + 60 * 60 * 1000);

  return placeGuestCall({
    business,
    guestName: req.customer_name,
    guestPhone: req.phone,
    bookingTitle: req.event_title?.trim() || "your enquiry",
    startsAt: now.toISOString(),
    endsAt: ends.toISOString(),
    purpose: params.purpose,
    changeSummary: params.changeSummary || req.preferred_time?.trim() || undefined,
    customScript: params.customScript,
    bookingRequestId: req.id,
  });
}
