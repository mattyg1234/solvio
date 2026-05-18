"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { coerceValidIanaTimeZone } from "@/lib/safe-timezone";
import { sendBookingConfirmedEmail } from "@/lib/notifications/booking-emails";
import { sendBookingSms } from "@/lib/notifications/booking-sms";
import { getSiteUrl } from "@/lib/site-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function revBookings() {
  revalidatePath("/dashboard/bookings");
}

async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  return { supabase, user };
}

export async function createVenueCalendarBookingFromRequest(params: {
  bookingRequestId: string;
  startsAtIso: string;
  endsAtIso: string;
  title?: string;
  internalNotes?: string;
  floorPlanTableId?: string | null;
  businessEventId?: string | null;
}) {
  const { supabase, user } = await requireUser();
  const starts = new Date(params.startsAtIso);
  const ends = new Date(params.endsAtIso);
  if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime())) {
    throw new Error("Invalid start or end time.");
  }
  if (ends.getTime() <= starts.getTime()) {
    throw new Error("End must be after start.");
  }

  const { data: req, error: reqErr } = await supabase
    .from("booking_requests")
    .select("id,business_id,customer_name,email,phone,booking_kind,event_title,guest_count")
    .eq("id", params.bookingRequestId)
    .maybeSingle();

  if (reqErr || !req?.business_id) {
    throw new Error(reqErr?.message ?? "Request not found.");
  }

  const { data: biz } = await supabase
    .from("businesses")
    .select("id,name,time_zone")
    .eq("id", req.business_id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!biz) {
    throw new Error("You cannot schedule for this venue.");
  }

  const floorPlanTableId = params.floorPlanTableId?.trim() || null;
  const businessEventId = params.businessEventId?.trim() || null;

  if (floorPlanTableId) {
    const { data: tbl } = await supabase
      .from("floor_plan_tables")
      .select("id,business_id")
      .eq("id", floorPlanTableId)
      .maybeSingle();
    if (!tbl || tbl.business_id !== req.business_id) {
      throw new Error("That table belongs to another venue.");
    }
  }

  if (businessEventId) {
    const { data: ev } = await supabase
      .from("business_events")
      .select("id,business_id")
      .eq("id", businessEventId)
      .maybeSingle();
    if (!ev || ev.business_id !== req.business_id) {
      throw new Error("That hosted event belongs to another venue.");
    }
  }

  const startIso = starts.toISOString();
  const endIso = ends.toISOString();

  const { count } = await supabase
    .from("venue_calendar_bookings")
    .select("*", { count: "exact", head: true })
    .eq("business_id", req.business_id)
    .neq("status", "cancelled")
    .lt("starts_at", endIso)
    .gt("ends_at", startIso);

  if (typeof count === "number" && count > 0) {
    throw new Error("Overlaps another confirmed slot — tweak the times or cancel the other booking first.");
  }

  const trimmedTitle =
    params.title?.trim() ||
    req.event_title?.trim() ||
    `${req.customer_name.trim()} · ${req.booking_kind?.trim() || "booking"}`;
  const safeTitle = trimmedTitle.slice(0, 480);

  const merchantName = (biz?.name ?? "Your venue").toString();

  const { error: insErr } = await supabase.from("venue_calendar_bookings").insert({
    business_id: req.business_id,
    booking_request_id: req.id,
    title: safeTitle,
    booking_kind: req.booking_kind,
    starts_at: startIso,
    ends_at: endIso,
    guest_name: req.customer_name,
    guest_email: req.email,
    guest_phone: req.phone,
    guest_count: req.guest_count,
    status: "confirmed",
    floor_plan_table_id: floorPlanTableId,
    business_event_id: businessEventId,
    internal_notes: params.internalNotes?.trim() ? params.internalNotes.trim().slice(0, 4000) : null,
  });

  if (insErr) {
    throw new Error(insErr.message);
  }

  revBookings();

  const tz = coerceValidIanaTimeZone(biz.time_zone ?? "");
  const siteUrl = (await getSiteUrl()).replace(/\/$/, "");

  await sendBookingConfirmedEmail({
    guestEmail: req.email,
    guestName: req.customer_name,
    merchantName,
    title: safeTitle,
    startsIso: startIso,
    endsIso: endIso,
    timeZone: tz,
    siteUrl,
  }).catch(() => {});

  if (req.phone?.trim()) {
    const sms = `Confirmed: ${merchantName.slice(0, 60)} · ${safeTitle.slice(0, 80)}. Details emailed (${tz}).`;
    await sendBookingSms({ phoneE164: req.phone.trim(), body: sms }).catch(() => {});
  }
}

export async function cancelVenueCalendarBooking(bookingId: string) {
  const { supabase, user } = await requireUser();
  if (!bookingId.trim()) {
    throw new Error("Missing booking.");
  }

  const { data: row, error: fetchErr } = await supabase
    .from("venue_calendar_bookings")
    .select("id,business_id")
    .eq("id", bookingId.trim())
    .maybeSingle();

  if (fetchErr || !row?.business_id) {
    throw new Error(fetchErr?.message ?? "Booking not found.");
  }

  const { data: biz } = await supabase
    .from("businesses")
    .select("id")
    .eq("id", row.business_id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!biz) {
    throw new Error("Unauthorized.");
  }

  const { error: updErr } = await supabase
    .from("venue_calendar_bookings")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", bookingId.trim());

  if (updErr) {
    throw new Error(updErr.message);
  }

  revBookings();
}
