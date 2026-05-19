"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  cancelEventOccurrence,
  clearInstanceOverride,
  restoreEventOccurrence,
  setInstanceOverride,
} from "@/lib/business-event-occurrences";
import type { FloorPlanTableShape } from "@/lib/floor-plan-visuals";
import { normalizeFloorTableDimensions, normalizeFloorTableFillColor } from "@/lib/floor-plan-visuals";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function getOwnedSupabase(businessId: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  const { data: row } = await supabase
    .from("businesses")
    .select("id")
    .eq("id", businessId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!row) {
    throw new Error("Business not found.");
  }
  return supabase;
}

function revBookings() {
  revalidatePath("/dashboard/bookings");
}

/** Upsert weekly row for one weekday (0=Sun … 6=Sat). Times as HH:MM (24h). */
export async function upsertAppointmentWeekdayHour(params: {
  businessId: string;
  weekday: number;
  openTime: string;
  closeTime: string;
  slotMinutes: number;
}) {
  const supabase = await getOwnedSupabase(params.businessId);
  await supabase
    .from("appointment_weekday_hours")
    .delete()
    .eq("business_id", params.businessId)
    .eq("weekday", params.weekday);

  const { error } = await supabase.from("appointment_weekday_hours").insert({
    business_id: params.businessId,
    weekday: params.weekday,
    open_time: params.openTime,
    close_time: params.closeTime,
    slot_minutes: params.slotMinutes,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  revBookings();
}

export async function deleteAppointmentWeekdayHour(businessId: string, rowId: string) {
  const supabase = await getOwnedSupabase(businessId);
  const { error } = await supabase.from("appointment_weekday_hours").delete().eq("id", rowId).eq("business_id", businessId);
  if (error) throw new Error(error.message);
  revBookings();
}

export async function addAppointmentSlotException(params: {
  businessId: string;
  exceptionDate: string;
  slotStart: string | null;
  kind: "removed" | "cancelled";
  reason?: string | null;
}) {
  const supabase = await getOwnedSupabase(params.businessId);
  const { error } = await supabase.from("appointment_slot_exceptions").insert({
    business_id: params.businessId,
    exception_date: params.exceptionDate,
    slot_start: params.slotStart && params.slotStart.length > 0 ? params.slotStart : null,
    kind: params.kind,
    reason: params.reason?.trim() || null,
  });
  if (error) throw new Error(error.message);
  revBookings();
}

export async function deleteAppointmentSlotException(businessId: string, rowId: string) {
  const supabase = await getOwnedSupabase(businessId);
  const { error } = await supabase.from("appointment_slot_exceptions").delete().eq("id", rowId).eq("business_id", businessId);
  if (error) throw new Error(error.message);
  revBookings();
}

/**
 * Replace every exception saved for `exceptionDate`, then optionally insert closures.
 * `clear` — remove all exceptions for that date only.
 */
export async function replaceAppointmentSlotExceptionsForDate(params: {
  businessId: string;
  exceptionDate: string;
  kind: "removed" | "cancelled";
  reason?: string | null;
  mode: "clear" | "slots" | "whole_day";
  /** HH:MM per blocked slot start (weekly template aligns these). Required when mode === "slots". */
  slotStartsHm?: string[];
}) {
  const supabase = await getOwnedSupabase(params.businessId);
  const ds = params.exceptionDate.trim();
  await supabase.from("appointment_slot_exceptions").delete().eq("business_id", params.businessId).eq("exception_date", ds);

  if (params.mode === "clear") {
    revBookings();
    return;
  }

  const reasonTrim = params.reason?.trim() || null;

  if (params.mode === "whole_day") {
    const { error } = await supabase.from("appointment_slot_exceptions").insert({
      business_id: params.businessId,
      exception_date: ds,
      slot_start: null,
      kind: params.kind,
      reason: reasonTrim,
    });
    if (error) throw new Error(error.message);
    revBookings();
    return;
  }

  const uniqueHm = [...new Set((params.slotStartsHm ?? []).map((x) => x.trim()).filter(Boolean))].sort();
  if (!uniqueHm.length) {
    revBookings();
    return;
  }

  const rows = uniqueHm.map((hm) => ({
    business_id: params.businessId,
    exception_date: ds,
    slot_start: /^(\d{2}:\d{2})$/.test(hm) ? `${hm}:00` : hm,
    kind: params.kind,
    reason: reasonTrim,
  }));

  const { error } = await supabase.from("appointment_slot_exceptions").insert(rows);
  if (error) throw new Error(error.message);
  revBookings();
}

export async function upsertBusinessEvent(params: {
  businessId: string;
  id?: string | null;
  title: string;
  description?: string | null;
  startsAt: string;
  endsAt: string;
  recurrence: Record<string, unknown>;
}) {
  const supabase = await getOwnedSupabase(params.businessId);

  if (params.id) {
    const { error } = await supabase
      .from("business_events")
      .update({
        title: params.title.trim(),
        description: params.description?.trim() || null,
        starts_at: params.startsAt,
        ends_at: params.endsAt,
        recurrence: params.recurrence,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.id)
      .eq("business_id", params.businessId);
    if (error) throw new Error(error.message);
    revBookings();
    return;
  }

  const { error } = await supabase.from("business_events").insert({
    business_id: params.businessId,
    title: params.title.trim(),
    description: params.description?.trim() || null,
    starts_at: params.startsAt,
    ends_at: params.endsAt,
    recurrence: params.recurrence,
    cancelled_at: null,
    cancellation_reason: null,
    deleted_at: null,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  revBookings();
}

export async function cancelBusinessEvent(businessId: string, eventId: string, reason?: string | null) {
  const supabase = await getOwnedSupabase(businessId);
  const { error } = await supabase
    .from("business_events")
    .update({
      cancelled_at: new Date().toISOString(),
      cancellation_reason: reason?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", eventId)
    .eq("business_id", businessId);
  if (error) throw new Error(error.message);
  revBookings();
}

export async function uncancelBusinessEvent(businessId: string, eventId: string) {
  const supabase = await getOwnedSupabase(businessId);
  const { error } = await supabase
    .from("business_events")
    .update({
      cancelled_at: null,
      cancellation_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", eventId)
    .eq("business_id", businessId);
  if (error) throw new Error(error.message);
  revBookings();
}

/** Soft-delete — hidden from listings / AI scripts unless you restore later. */
export async function softDeleteBusinessEvent(businessId: string, eventId: string) {
  const supabase = await getOwnedSupabase(businessId);
  const { error } = await supabase
    .from("business_events")
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", eventId)
    .eq("business_id", businessId);
  if (error) throw new Error(error.message);
  revBookings();
}

export async function restoreBusinessEvent(businessId: string, eventId: string) {
  const supabase = await getOwnedSupabase(businessId);
  const { error } = await supabase
    .from("business_events")
    .update({ deleted_at: null, updated_at: new Date().toISOString() })
    .eq("id", eventId)
    .eq("business_id", businessId);
  if (error) throw new Error(error.message);
  revBookings();
}

function asRecurrenceRecord(v: unknown): Record<string, unknown> {
  if (v !== null && typeof v === "object" && !Array.isArray(v)) {
    return { ...(v as Record<string, unknown>) };
  }
  return { type: "once" };
}

/** Cancel or reinstate a single calendar night while keeping recurrence metadata. */
export async function toggleBusinessEventOccurrenceSkipped(params: {
  businessId: string;
  eventId: string;
  dateYmd: string;
  skip: boolean;
  reason?: string | null;
}) {
  const supabase = await getOwnedSupabase(params.businessId);
  const { data, error: selErr } = await supabase
    .from("business_events")
    .select("recurrence")
    .eq("business_id", params.businessId)
    .eq("id", params.eventId)
    .maybeSingle();
  if (selErr) throw new Error(selErr.message);
  if (!data) throw new Error("Event not found.");
  const base = asRecurrenceRecord(data.recurrence);
  const ymd = params.dateYmd.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) throw new Error("Invalid date.");

  const nextRec = params.skip
    ? cancelEventOccurrence(base, ymd, params.reason)
    : restoreEventOccurrence(base, ymd);

  const { error } = await supabase
    .from("business_events")
    .update({
      recurrence: nextRec,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.eventId)
    .eq("business_id", params.businessId);
  if (error) throw new Error(error.message);
  revBookings();
}

export async function upsertBusinessEventInstanceOverrideTimes(params: {
  businessId: string;
  eventId: string;
  dateYmd: string;
  startsAtIso: string;
  endsAtIso: string;
}) {
  const supabase = await getOwnedSupabase(params.businessId);
  const { data, error: selErr } = await supabase
    .from("business_events")
    .select("recurrence")
    .eq("business_id", params.businessId)
    .eq("id", params.eventId)
    .maybeSingle();
  if (selErr) throw new Error(selErr.message);
  if (!data) throw new Error("Event not found.");
  const ymd = params.dateYmd.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) throw new Error("Invalid date.");
  const s = Date.parse(params.startsAtIso);
  const e = Date.parse(params.endsAtIso);
  if (Number.isNaN(s) || Number.isNaN(e) || e <= s) {
    throw new Error("Pick a valid end time after start.");
  }
  const base = asRecurrenceRecord(data.recurrence);
  const nextRec = setInstanceOverride(base, ymd, new Date(s).toISOString(), new Date(e).toISOString());

  const { error } = await supabase
    .from("business_events")
    .update({
      recurrence: nextRec,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.eventId)
    .eq("business_id", params.businessId);
  if (error) throw new Error(error.message);
  revBookings();
}

export async function clearBusinessEventInstanceOverride(params: {
  businessId: string;
  eventId: string;
  dateYmd: string;
}) {
  const supabase = await getOwnedSupabase(params.businessId);
  const { data, error: selErr } = await supabase
    .from("business_events")
    .select("recurrence")
    .eq("business_id", params.businessId)
    .eq("id", params.eventId)
    .maybeSingle();
  if (selErr) throw new Error(selErr.message);
  if (!data) throw new Error("Event not found.");
  const ymd = params.dateYmd.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) throw new Error("Invalid date.");
  const base = asRecurrenceRecord(data.recurrence);
  const nextRec = clearInstanceOverride(base, ymd);

  const { error } = await supabase
    .from("business_events")
    .update({
      recurrence: nextRec,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.eventId)
    .eq("business_id", params.businessId);
  if (error) throw new Error(error.message);
  revBookings();
}

export async function upsertFloorPlanTable(params: {
  businessId: string;
  id?: string | null;
  label: string;
  capacity: number;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  shape?: FloorPlanTableShape;
  fillColor?: string | null;
  pricingMode: "table" | "person" | "group_tier";
  priceCents: number;
  groupPricing?: Record<string, unknown> | null;
}) {
  const supabase = await getOwnedSupabase(params.businessId);
  const shape = params.shape ?? "rectangle";
  const dims = normalizeFloorTableDimensions(shape, params.width, params.height);
  const row = {
    business_id: params.businessId,
    label: params.label.trim(),
    capacity: params.capacity,
    position_x: params.positionX,
    position_y: params.positionY,
    width: dims.width,
    height: dims.height,
    shape,
    fill_color: normalizeFloorTableFillColor(params.fillColor ?? undefined),
    pricing_mode: params.pricingMode,
    price_cents: params.priceCents,
    group_pricing: (params.groupPricing ?? null) as unknown as Record<string, unknown> | null,
    updated_at: new Date().toISOString(),
  };

  if (params.id) {
    const { error } = await supabase.from("floor_plan_tables").update(row).eq("id", params.id).eq("business_id", params.businessId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("floor_plan_tables").insert(row);
    if (error) throw new Error(error.message);
  }
  revBookings();
}

export async function saveFloorPlanLayout(
  businessId: string,
  updates: { id: string; positionX: number; positionY: number }[],
) {
  const supabase = await getOwnedSupabase(businessId);
  const now = new Date().toISOString();
  for (const u of updates) {
    const { error } = await supabase
      .from("floor_plan_tables")
      .update({ position_x: u.positionX, position_y: u.positionY, updated_at: now })
      .eq("id", u.id)
      .eq("business_id", businessId);
    if (error) throw new Error(error.message);
  }
  revBookings();
}

export async function deleteFloorPlanTable(businessId: string, tableId: string) {
  const supabase = await getOwnedSupabase(businessId);
  const { error } = await supabase.from("floor_plan_tables").delete().eq("id", tableId).eq("business_id", businessId);
  if (error) throw new Error(error.message);
  revBookings();
}

function coerceTimeHmToPg(s: string): string {
  const t = s.trim();
  if (/^\d{2}:\d{2}$/.test(t)) return `${t}:00`;
  return t.slice(0, 8);
}

/** Replace weekday windows — omitting / clearing restores venue-wide appointment-hour inheritance. */
export async function replaceFloorPlanTableWeekdayHours(params: {
  businessId: string;
  tableId: string;
  rows: { weekday: number; openTime: string; closeTime: string }[];
}) {
  const supabase = await getOwnedSupabase(params.businessId);

  const { data: tbl, error: selErr } = await supabase
    .from("floor_plan_tables")
    .select("id")
    .eq("business_id", params.businessId)
    .eq("id", params.tableId)
    .maybeSingle();
  if (selErr) throw new Error(selErr.message);
  if (!tbl) throw new Error("Table not found.");

  const { error: delErr } = await supabase
    .from("floor_plan_table_weekday_hours")
    .delete()
    .eq("floor_plan_table_id", params.tableId)
    .eq("business_id", params.businessId);
  if (delErr) throw new Error(delErr.message);

  const now = new Date().toISOString();
  const valid = [...params.rows].filter(
    (r) =>
      typeof r.weekday === "number" &&
      Number.isFinite(r.weekday) &&
      r.weekday >= 0 &&
      r.weekday <= 6 &&
      r.openTime.trim().length > 0 &&
      r.closeTime.trim().length > 0,
  );

  if (valid.length === 0) {
    revBookings();
    return;
  }

  const insertRows = valid.map((r) => ({
    floor_plan_table_id: params.tableId,
    business_id: params.businessId,
    weekday: r.weekday,
    open_time: coerceTimeHmToPg(r.openTime),
    close_time: coerceTimeHmToPg(r.closeTime),
    updated_at: now,
  }));

  const { error } = await supabase.from("floor_plan_table_weekday_hours").insert(insertRows);
  if (error) throw new Error(error.message);
  revBookings();
}

export async function upsertTableBookingQuestion(params: {
  businessId: string;
  id?: string | null;
  questionLabel: string;
  required: boolean;
  sortOrder: number;
}) {
  const supabase = await getOwnedSupabase(params.businessId);
  const row = {
    business_id: params.businessId,
    question_label: params.questionLabel.trim(),
    required: params.required,
    sort_order: params.sortOrder,
  };
  if (params.id) {
    const { error } = await supabase.from("booking_table_questions").update(row).eq("id", params.id).eq("business_id", params.businessId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("booking_table_questions").insert(row);
    if (error) throw new Error(error.message);
  }
  revBookings();
}

export async function deleteTableBookingQuestion(businessId: string, questionId: string) {
  const supabase = await getOwnedSupabase(businessId);
  const { error } = await supabase.from("booking_table_questions").delete().eq("id", questionId).eq("business_id", businessId);
  if (error) throw new Error(error.message);
  revBookings();
}
