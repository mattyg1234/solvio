import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { BookingLinkManager } from "@/components/dashboard/booking-link-manager";
import { BookingsOverviewCalendar } from "@/components/dashboard/bookings-overview-calendar";
import {
  BookingOperationsHub,
  type AppointmentWeekRow,
  type BusinessEventRow,
  type FloorPlanTableRow,
  type FloorPlanTableWeekHourRow,
  type SlotExceptionRow,
  type TableQuestionRow,
  type VenueCalendarBookingRow,
} from "@/components/dashboard/booking-operations-hub";
import type { AppointmentBreakRow } from "@/components/dashboard/appointment-week-grid";
import type { BookingRequestRow } from "@/components/dashboard/booking-inbox";
import { BookingsCommandCenter } from "@/components/dashboard/bookings-command-center";
import { buttonVariants } from "@/components/ui/button";
import { parseBookingsHubQuery } from "@/lib/bookings-hub-query";
import { parseStaffMembers } from "@/lib/staff-members";
import { coerceValidIanaTimeZone } from "@/lib/safe-timezone";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site-url";
import { cn } from "@/lib/utils";

type BookingPageSearchRaw = Record<string, string | string[] | undefined>;

async function resolveBookingSearchParams(
  raw: Promise<BookingPageSearchRaw> | BookingPageSearchRaw | undefined,
): Promise<BookingPageSearchRaw> {
  if (raw == null) return {};
  if (typeof (raw as { then?: unknown }).then === "function") {
    return await (raw as Promise<BookingPageSearchRaw>);
  }
  return raw as BookingPageSearchRaw;
}

function firstQueryString(raw: BookingPageSearchRaw, key: "tab" | "view" | "booking"): string | undefined {
  const v = raw[key];
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return undefined;
}

export const metadata: Metadata = {
  title: "Bookings · Dashboard · Solvio",
};

export default async function DashboardBookingsPage({
  searchParams,
}: {
  searchParams?: Promise<BookingPageSearchRaw> | BookingPageSearchRaw;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const siteUrl = await getSiteUrl();
  const spat = await resolveBookingSearchParams(searchParams);
  const hub = parseBookingsHubQuery({
    tab: firstQueryString(spat, "tab"),
    view: firstQueryString(spat, "view"),
    booking: firstQueryString(spat, "booking"),
  });

  const { data: businessesRaw } = await supabase
    .from("businesses")
    .select(
      "id,name,booking_slug,time_zone,booking_flow_completed_at,booking_flow_details,stripe_connect_account_id,stripe_connect_charges_enabled",
    )
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true });

  const businesses =
    businessesRaw?.map((b) => ({
      id: b.id,
      name: b.name,
      booking_slug: b.booking_slug as string | null,
    })) ?? [];

  const stripeReadyByBizId = Object.fromEntries(
    (businessesRaw ?? []).map((b) => [
      b.id,
      Boolean(b.stripe_connect_account_id && b.stripe_connect_charges_enabled),
    ]),
  );

  const businessIds = businesses.map((b) => b.id);
  const bizNameById = Object.fromEntries(businesses.map((b) => [b.id, b.name]));
  const primaryBizId = businesses[0]?.id ?? null;
  const primaryBizName = businesses[0]?.name ?? null;
  const primaryVenueTz = coerceValidIanaTimeZone(businessesRaw?.[0]?.time_zone ?? "");

  const primaryBookingFlowComplete = Boolean(businessesRaw?.[0]?.booking_flow_completed_at);
  const flowDetailsRaw = businessesRaw?.[0]?.booking_flow_details;
  const staffMembers = parseStaffMembers(
    flowDetailsRaw && typeof flowDetailsRaw === "object" && !Array.isArray(flowDetailsRaw)
      ? (flowDetailsRaw as Record<string, unknown>).staff_members
      : undefined,
  );
  const appointmentQuestions: { label: string; required: boolean }[] = (() => {
    const raw =
      flowDetailsRaw && typeof flowDetailsRaw === "object" && !Array.isArray(flowDetailsRaw)
        ? (flowDetailsRaw as Record<string, unknown>).appointment_questions
        : null;
    if (!Array.isArray(raw)) return [];
    const out: { label: string; required: boolean }[] = [];
    for (const item of raw) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const o = item as Record<string, unknown>;
      const label = typeof o.label === "string" ? o.label.trim() : "";
      if (!label || label.length > 240) continue;
      out.push({ label, required: Boolean(o.required) });
    }
    return out;
  })();
  type BookingRow = {
    id: string;
    business_id: string;
    customer_name: string;
    email: string;
    phone: string | null;
    notes: string | null;
    preferred_time: string | null;
    event_title: string | null;
    booking_kind: string | null;
    requested_date: string | null;
    guest_count: number | null;
    intake_extras: unknown | null;
    payment_status: string | null;
    deposit_amount_cents: number | null;
    created_at: string;
  };

  let requests: BookingRow[] = [];

  if (businessIds.length > 0) {
    const { data: reqData } = await supabase
      .from("booking_requests")
      .select(
        "id,business_id,customer_name,email,phone,notes,preferred_time,event_title,booking_kind,requested_date,guest_count,intake_extras,payment_status,deposit_amount_cents,created_at",
      )
      .in("business_id", businessIds)
      .order("created_at", { ascending: false })
      .limit(100);

    requests = (reqData ?? []) as BookingRow[];
  }

  let schedules: AppointmentWeekRow[] = [];
  let exceptions: SlotExceptionRow[] = [];
  let hostedEvents: BusinessEventRow[] = [];
  let floorTables: FloorPlanTableRow[] = [];
  let tableQuestions: TableQuestionRow[] = [];
  let confirmedBookings: VenueCalendarBookingRow[] = [];
  let breaks: AppointmentBreakRow[] = [];

  const calendarSince = new Date();
  calendarSince.setDate(calendarSince.getDate() - 90);
  const calendarSinceIso = calendarSince.toISOString();
  const calendarUntil = new Date();
  calendarUntil.setDate(calendarUntil.getDate() + 180);
  const calendarUntilIso = calendarUntil.toISOString();

  if (primaryBizId) {
    const [ah, se, ev, tb, qu, vc, tbwh, bk] = await Promise.all([
      supabase.from("appointment_weekday_hours").select("*").eq("business_id", primaryBizId).order("weekday"),
      supabase.from("appointment_slot_exceptions").select("*").eq("business_id", primaryBizId).order("exception_date", { ascending: false }).limit(80),
      supabase.from("business_events").select("*").eq("business_id", primaryBizId).order("starts_at", { ascending: true }).limit(80),
      supabase.from("floor_plan_tables").select("*").eq("business_id", primaryBizId).order("label"),
      supabase.from("booking_table_questions").select("*").eq("business_id", primaryBizId).order("sort_order"),
      supabase
        .from("venue_calendar_bookings")
        .select("*")
        .eq("business_id", primaryBizId)
        .gte("starts_at", calendarSinceIso)
        .lte("starts_at", calendarUntilIso)
        .order("starts_at", { ascending: true })
        .limit(500),
      supabase.from("floor_plan_table_weekday_hours").select("*").eq("business_id", primaryBizId).order("weekday"),
      supabase.from("appointment_breaks").select("*").eq("business_id", primaryBizId).order("created_at"),
    ]);

    schedules = (ah.data ?? []) as AppointmentWeekRow[];
    exceptions = (se.data ?? []) as SlotExceptionRow[];
    hostedEvents = (ev.data ?? []) as BusinessEventRow[];
    breaks = (bk.data ?? []) as AppointmentBreakRow[];

    const tableHoursByFloorId = new Map<string, FloorPlanTableWeekHourRow[]>();
    for (const row of tbwh?.data ?? []) {
      const r = row as FloorPlanTableWeekHourRow;
      const prev = tableHoursByFloorId.get(r.floor_plan_table_id) ?? [];
      prev.push(r);
      tableHoursByFloorId.set(r.floor_plan_table_id, prev);
    }

    floorTables = ((tb.data ?? []) as FloorPlanTableRow[]).map((row) => ({
      ...row,
      group_pricing:
        row.group_pricing && typeof row.group_pricing === "object" && !Array.isArray(row.group_pricing)
          ? (row.group_pricing as Record<string, unknown>)
          : null,
      table_week_hours: tableHoursByFloorId.get(row.id),
    }));

    tableQuestions = (qu.data ?? []) as TableQuestionRow[];
    confirmedBookings = (vc.data ?? []) as VenueCalendarBookingRow[];
  }

  const inboxRequests = (requests as BookingRequestRow[]).map((r) => ({
    ...r,
    intake_extras:
      r.intake_extras != null && typeof r.intake_extras === "object"
        ? (JSON.parse(JSON.stringify(r.intake_extras)) as unknown)
        : r.intake_extras,
  })) as BookingRequestRow[];

  // Compute booked_count per event from confirmed venue bookings already loaded above.
  const bookedCountByEventId = new Map<string, number>();
  for (const row of confirmedBookings) {
    if (!row.business_event_id || row.status === "cancelled") continue;
    const prev = bookedCountByEventId.get(row.business_event_id) ?? 0;
    bookedCountByEventId.set(
      row.business_event_id,
      prev + (typeof row.guest_count === "number" && row.guest_count > 0 ? row.guest_count : 1),
    );
  }

  const hostedEventsForClient = hostedEvents.map((ev) => {
    let recurrence: unknown = ev.recurrence;
    if (recurrence != null && typeof recurrence === "object") {
      try {
        recurrence = JSON.parse(JSON.stringify(recurrence));
      } catch {
        recurrence = { type: "once" };
      }
    }
    return {
      ...ev,
      recurrence,
      booked_count: bookedCountByEventId.get(ev.id) ?? 0,
    };
  });

  const confirmedActiveCount = confirmedBookings.filter((b) => b.status !== "cancelled").length;

  return (
    <div className="space-y-8">
      <Link
        href="/dashboard"
        className={cn(
          buttonVariants({ variant: "ghost" }),
          "inline-flex h-10 items-center gap-2 px-2 text-sm font-semibold text-[#64748b] hover:text-[#0f172a]",
        )}
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Overview
      </Link>

      {primaryBizId && primaryBizName ? (
        <div id="booking-calendar" className="scroll-mt-6">
          <BookingsOverviewCalendar
            businessId={primaryBizId}
            businessName={primaryBizName}
            venueTimeZone={primaryVenueTz}
            events={hostedEventsForClient.map((ev) => ({
              id: ev.id,
              title: ev.title,
              starts_at: ev.starts_at,
              ends_at: ev.ends_at,
              recurrence: ev.recurrence,
              cancelled_at: ev.cancelled_at,
              deleted_at: ev.deleted_at,
              capacity: ev.capacity,
            }))}
            bookings={confirmedBookings.map((b) => ({
              id: b.id,
              title: b.title,
              booking_kind: b.booking_kind,
              starts_at: b.starts_at,
              ends_at: b.ends_at,
              guest_name: b.guest_name,
              guest_email: b.guest_email,
              guest_phone: b.guest_phone,
              guest_count: b.guest_count,
              floor_plan_table_id: b.floor_plan_table_id,
              business_event_id: b.business_event_id,
              status: b.status,
              internal_notes: b.internal_notes,
            }))}
            tables={floorTables.map((t) => ({ id: t.id, label: t.label }))}
            eventOptions={hostedEventsForClient
              .filter((e) => !e.cancelled_at && !e.deleted_at)
              .map((e) => ({ id: e.id, title: e.title }))}
          />
        </div>
      ) : null}

      <BookingsCommandCenter
        inboxCount={inboxRequests.length}
        confirmedCount={confirmedActiveCount}
        activePrimary={hub.primary}
        activeGuestsSub={hub.guestsSub}
        activeOfferingsSub={hub.offeringsSub}
        bookingFlowComplete={primaryBookingFlowComplete}
      />

      <div id="bookings-workspace" className="scroll-mt-6">
        <BookingOperationsHub
          businessId={primaryBizId}
          businessName={primaryBizName}
          venueTimeZone={primaryVenueTz}
          schedules={schedules}
          exceptions={exceptions}
          events={hostedEventsForClient}
          tables={floorTables}
          questions={tableQuestions}
          requests={inboxRequests}
          bizNameById={bizNameById}
          confirmedBookings={confirmedBookings}
          bookingFlowComplete={primaryBookingFlowComplete}
          initialPrimary={hub.primary}
          initialGuestsSub={hub.guestsSub}
          initialOfferingsSub={hub.offeringsSub}
          bookingRequestHighlight={hub.bookingHighlight}
          stripeReadyByBizId={stripeReadyByBizId}
          staffMembers={staffMembers}
          appointmentQuestions={appointmentQuestions}
          breaks={breaks}
        />
      </div>

      <section id="booking-links" className="scroll-mt-28 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-[#0f172a]">Guest booking link</h2>
          <p className="mt-1 text-[14px] text-[#64748b]">
            Your link is permanent and generated from your business name — copy it to share with customers.
          </p>
        </div>
        <BookingLinkManager businesses={businesses} siteUrl={siteUrl} />
      </section>
    </div>
  );
}
