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

/**
 * Manually add a confirmed booking to the diary — for walk-ins, phone bookings,
 * or anyone who paid at the bar in cash. Skips the booking_request flow entirely.
 */
export async function addManualVenueCalendarBooking(params: {
  businessId: string;
  guestName: string;
  guestEmail?: string;
  guestPhone?: string;
  guestCount?: number;
  bookingKind: "table" | "appointment" | "event" | "walk_in";
  startsAtIso: string;
  endsAtIso: string;
  title?: string;
  floorPlanTableId?: string | null;
  businessEventId?: string | null;
  internalNotes?: string;
  paymentNote?: "cash" | "card_offline" | "comped" | "unpaid" | "";
}) {
  const { supabase, user } = await requireUser();

  const businessId = params.businessId.trim();
  const guestName = params.guestName.trim();
  if (!businessId) throw new Error("Missing business.");
  if (guestName.length < 1) throw new Error("Guest name is required.");

  const { data: biz } = await supabase
    .from("businesses")
    .select("id,name")
    .eq("id", businessId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!biz) throw new Error("You cannot schedule for this venue.");

  const starts = new Date(params.startsAtIso);
  const ends = new Date(params.endsAtIso);
  if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime())) {
    throw new Error("Invalid start or end time.");
  }
  if (ends.getTime() <= starts.getTime()) {
    throw new Error("End must be after start.");
  }

  const floorPlanTableId = params.floorPlanTableId?.trim() || null;
  const businessEventId = params.businessEventId?.trim() || null;

  if (floorPlanTableId) {
    const { data: tbl } = await supabase
      .from("floor_plan_tables")
      .select("id,business_id")
      .eq("id", floorPlanTableId)
      .maybeSingle();
    if (!tbl || tbl.business_id !== businessId) {
      throw new Error("That table belongs to another venue.");
    }
  }
  if (businessEventId) {
    const { data: ev } = await supabase
      .from("business_events")
      .select("id,business_id,capacity,title")
      .eq("id", businessEventId)
      .maybeSingle();
    if (!ev || ev.business_id !== businessId) {
      throw new Error("That hosted event belongs to another venue.");
    }
    // Enforce event capacity: sum existing confirmed guest_counts and reject if this booking pushes over.
    if (typeof ev.capacity === "number" && ev.capacity > 0) {
      const { data: existing } = await supabase
        .from("venue_calendar_bookings")
        .select("guest_count")
        .eq("business_event_id", businessEventId)
        .neq("status", "cancelled");
      const taken = (existing ?? []).reduce(
        (sum: number, row: { guest_count: number | null }) =>
          sum + (typeof row.guest_count === "number" && row.guest_count > 0 ? row.guest_count : 1),
        0,
      );
      const remaining = ev.capacity - taken;
      const wantedGuests = Number.isFinite(params.guestCount) && (params.guestCount ?? 0) > 0 ? params.guestCount! : 1;
      if (remaining <= 0) {
        throw new Error(`${ev.title} is sold out — no seats remaining.`);
      }
      if (wantedGuests > remaining) {
        throw new Error(
          `${ev.title} only has ${remaining} seat${remaining === 1 ? "" : "s"} left — adjust party size to ${remaining} or fewer.`,
        );
      }
    }
  }

  const startIso = starts.toISOString();
  const endIso = ends.toISOString();

  const { count } = await supabase
    .from("venue_calendar_bookings")
    .select("*", { count: "exact", head: true })
    .eq("business_id", businessId)
    .neq("status", "cancelled")
    .lt("starts_at", endIso)
    .gt("ends_at", startIso);

  // Event bookings overlap by design (everyone at the same show); skip overlap check then.
  if (!businessEventId && typeof count === "number" && count > 0) {
    throw new Error("Overlaps another confirmed slot — pick a different time or cancel the other booking first.");
  }

  const trimmedTitle =
    params.title?.trim() ||
    `${guestName} · ${params.bookingKind ?? "booking"}`;
  const safeTitle = trimmedTitle.slice(0, 480);

  const noteParts: string[] = [];
  if (params.paymentNote && params.paymentNote.length) {
    const map: Record<string, string> = {
      cash: "Paid in cash at venue.",
      card_offline: "Paid by card offline (POS / terminal).",
      comped: "Comped — no charge.",
      unpaid: "Unpaid — collect on arrival.",
    };
    if (map[params.paymentNote]) noteParts.push(map[params.paymentNote]);
  }
  if (params.internalNotes?.trim()) {
    noteParts.push(params.internalNotes.trim());
  }
  const internalNotes = noteParts.join(" • ").slice(0, 4000) || null;

  const { error: insErr } = await supabase.from("venue_calendar_bookings").insert({
    business_id: businessId,
    booking_request_id: null,
    title: safeTitle,
    booking_kind: params.bookingKind,
    starts_at: startIso,
    ends_at: endIso,
    guest_name: guestName,
    guest_email: params.guestEmail?.trim() || "",
    guest_phone: params.guestPhone?.trim() || null,
    guest_count: Number.isFinite(params.guestCount) && (params.guestCount ?? 0) > 0 ? params.guestCount : null,
    status: "confirmed",
    floor_plan_table_id: floorPlanTableId,
    business_event_id: businessEventId,
    internal_notes: internalNotes,
  });

  if (insErr) {
    throw new Error(insErr.message);
  }

  revBookings();
}

/**
 * Edit a confirmed booking's time, table, event, guest count, or notes.
 * Keeps the booking_request_id intact so the original audit trail is preserved.
 */
export async function editVenueCalendarBooking(params: {
  bookingId: string;
  startsAtIso: string;
  endsAtIso: string;
  guestName?: string;
  guestPhone?: string;
  guestEmail?: string;
  guestCount?: number;
  floorPlanTableId?: string | null;
  businessEventId?: string | null;
  internalNotes?: string;
}) {
  const { supabase, user } = await requireUser();
  const bookingId = params.bookingId.trim();
  if (!bookingId) throw new Error("Missing booking.");

  const starts = new Date(params.startsAtIso);
  const ends = new Date(params.endsAtIso);
  if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime())) {
    throw new Error("Invalid start or end time.");
  }
  if (ends.getTime() <= starts.getTime()) {
    throw new Error("End must be after start.");
  }

  const { data: row, error: fetchErr } = await supabase
    .from("venue_calendar_bookings")
    .select("id,business_id,business_event_id,floor_plan_table_id,guest_count")
    .eq("id", bookingId)
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
  if (!biz) throw new Error("You cannot edit bookings for that venue.");

  const newFloorPlanTableId =
    params.floorPlanTableId !== undefined ? params.floorPlanTableId?.trim() || null : row.floor_plan_table_id;
  const newBusinessEventId =
    params.businessEventId !== undefined ? params.businessEventId?.trim() || null : row.business_event_id;

  // Validate table belongs to this venue
  if (newFloorPlanTableId && newFloorPlanTableId !== row.floor_plan_table_id) {
    const { data: tbl } = await supabase
      .from("floor_plan_tables")
      .select("id,business_id")
      .eq("id", newFloorPlanTableId)
      .maybeSingle();
    if (!tbl || tbl.business_id !== row.business_id) {
      throw new Error("That table belongs to another venue.");
    }
  }

  // Validate event + enforce capacity (excluding this booking from the count)
  if (newBusinessEventId) {
    const { data: ev } = await supabase
      .from("business_events")
      .select("id,business_id,capacity,title")
      .eq("id", newBusinessEventId)
      .maybeSingle();
    if (!ev || ev.business_id !== row.business_id) {
      throw new Error("That hosted event belongs to another venue.");
    }
    if (typeof ev.capacity === "number" && ev.capacity > 0) {
      const { data: others } = await supabase
        .from("venue_calendar_bookings")
        .select("id,guest_count")
        .eq("business_event_id", newBusinessEventId)
        .neq("status", "cancelled")
        .neq("id", bookingId);
      const taken = (others ?? []).reduce(
        (s: number, r: { guest_count: number | null }) =>
          s + (typeof r.guest_count === "number" && r.guest_count > 0 ? r.guest_count : 1),
        0,
      );
      const remaining = ev.capacity - taken;
      const wanted = Number.isFinite(params.guestCount) && (params.guestCount ?? 0) > 0 ? params.guestCount! : row.guest_count ?? 1;
      if (wanted > remaining) {
        throw new Error(
          `${ev.title} only has ${Math.max(0, remaining)} seat${remaining === 1 ? "" : "s"} left — adjust party size to ${Math.max(0, remaining)} or fewer.`,
        );
      }
    }
  }

  const startIso = starts.toISOString();
  const endIso = ends.toISOString();

  // Overlap check (excluding self; skip for event bookings since they share a time slot)
  if (!newBusinessEventId) {
    const { count } = await supabase
      .from("venue_calendar_bookings")
      .select("*", { count: "exact", head: true })
      .eq("business_id", row.business_id)
      .neq("status", "cancelled")
      .neq("id", bookingId)
      .lt("starts_at", endIso)
      .gt("ends_at", startIso);
    if (typeof count === "number" && count > 0) {
      throw new Error("Overlaps another confirmed slot — pick a different time or cancel the other booking first.");
    }
  }

  const patch: Record<string, unknown> = {
    starts_at: startIso,
    ends_at: endIso,
    floor_plan_table_id: newFloorPlanTableId,
    business_event_id: newBusinessEventId,
    updated_at: new Date().toISOString(),
  };
  if (params.guestName !== undefined) patch.guest_name = params.guestName.trim() || "Guest";
  if (params.guestEmail !== undefined) patch.guest_email = params.guestEmail.trim();
  if (params.guestPhone !== undefined) patch.guest_phone = params.guestPhone.trim() || null;
  if (params.guestCount !== undefined && Number.isFinite(params.guestCount) && (params.guestCount ?? 0) > 0) {
    patch.guest_count = params.guestCount;
  }
  if (params.internalNotes !== undefined) {
    patch.internal_notes = params.internalNotes.trim().slice(0, 4000) || null;
  }

  const { error: updErr } = await supabase
    .from("venue_calendar_bookings")
    .update(patch)
    .eq("id", bookingId);
  if (updErr) throw new Error(updErr.message);

  revBookings();
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
