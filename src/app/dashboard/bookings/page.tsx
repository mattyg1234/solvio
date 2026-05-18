import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CalendarClock } from "lucide-react";

import { BookingLinkManager } from "@/components/dashboard/booking-link-manager";
import {
  BookingOperationsHub,
  type AppointmentWeekRow,
  type BusinessEventRow,
  type FloorPlanTableRow,
  type SlotExceptionRow,
  type TableQuestionRow,
  type VenueCalendarBookingRow,
} from "@/components/dashboard/booking-operations-hub";
import type { BookingRequestRow } from "@/components/dashboard/booking-inbox";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { suggestBookingSlug } from "@/lib/booking-slug";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site-url";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Bookings · Dashboard · Solvio",
};

export default async function DashboardBookingsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const siteUrl = await getSiteUrl();

  const { data: businessesRaw } = await supabase
    .from("businesses")
    .select("id,name,booking_slug,time_zone")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true });

  const businesses =
    businessesRaw?.map((b) => ({
      id: b.id,
      name: b.name,
      booking_slug: b.booking_slug as string | null,
    })) ?? [];

  const businessIds = businesses.map((b) => b.id);
  const bizNameById = Object.fromEntries(businesses.map((b) => [b.id, b.name]));
  const primaryBizId = businesses[0]?.id ?? null;
  const primaryBizName = businesses[0]?.name ?? null;
  const rawFirstTz = typeof businessesRaw?.[0]?.time_zone === "string" ? businessesRaw[0].time_zone.trim() : "";
  const primaryVenueTz = rawFirstTz.length > 0 ? rawFirstTz : "UTC";

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
    created_at: string;
  };

  let requests: BookingRow[] = [];

  if (businessIds.length > 0) {
    const { data: reqData } = await supabase
      .from("booking_requests")
      .select(
        "id,business_id,customer_name,email,phone,notes,preferred_time,event_title,booking_kind,requested_date,guest_count,intake_extras,created_at",
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

  const calendarSince = new Date();
  calendarSince.setDate(calendarSince.getDate() - 14);
  const calendarSinceIso = calendarSince.toISOString();

  if (primaryBizId) {
    const [ah, se, ev, tb, qu, vc] = await Promise.all([
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
        .order("starts_at", { ascending: true })
        .limit(200),
    ]);

    schedules = (ah.data ?? []) as AppointmentWeekRow[];
    exceptions = (se.data ?? []) as SlotExceptionRow[];
    hostedEvents = (ev.data ?? []) as BusinessEventRow[];
    floorTables = ((tb.data ?? []) as FloorPlanTableRow[]).map((row) => ({
      ...row,
      group_pricing:
        row.group_pricing && typeof row.group_pricing === "object" && !Array.isArray(row.group_pricing)
          ? (row.group_pricing as Record<string, unknown>)
          : null,
    }));
    tableQuestions = (qu.data ?? []) as TableQuestionRow[];
    confirmedBookings = (vc.data ?? []) as VenueCalendarBookingRow[];
  }

  const inboxRequests = requests as BookingRequestRow[];
  const bookingTips =
    businesses.length === 0
      ? null
      : businesses.some((b) => !b.booking_slug)
        ? businesses.map((b) => ({
            id: b.id,
            name: b.name,
            suggested: suggestBookingSlug(b.name, b.id),
          }))
        : null;

  return (
    <div className="space-y-10">
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

      <section className="relative overflow-hidden rounded-[28px] border border-[#ebe7f7]/90 bg-white p-8 shadow-sm md:p-10">
        <div className="pointer-events-none absolute -right-16 top-8 h-40 w-40 rounded-full bg-[#ede9fe]/80 blur-3xl" aria-hidden />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-3">
            <Badge className="rounded-full bg-[#ede9fe] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#5b21b6] hover:bg-[#ede9fe]">
              Customer booking links
            </Badge>
            <h1 className="text-[clamp(1.45rem,3vw,2rem)] font-semibold tracking-tight text-[#0f172a]">
              Host intake on Solvio — keep every email & number
            </h1>
            <p className="max-w-2xl text-[15px] leading-relaxed text-[#64748b]">
              Publish a link your guests share like any URL. Requests stay in Solvio so you can follow up by phone or SMS now,
              and plug automated voice messages when you&apos;re ready.
            </p>
          </div>
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#f5f3ff] text-[#7c3aed] ring-1 ring-[#ebe7f7]">
            <CalendarClock className="h-7 w-7" aria-hidden />
          </span>
        </div>
      </section>

      <BookingLinkManager businesses={businesses} siteUrl={siteUrl} />

      {bookingTips?.length ? (
        <Card className="rounded-[22px] border border-dashed border-[#ddd6fe] bg-[#fafbff]/90 shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-[#0f172a]">Publish tips</CardTitle>
            <CardDescription className="text-[13px] leading-relaxed text-[#64748b]">
              These suggested paths match how Solvio generates defaults — tweak anything readable before going live.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 pb-6">
            <ul className="space-y-2 text-sm text-[#475569]">
              {bookingTips.map((t) => (
                <li key={t.id}>
                  <span className="font-semibold text-[#0f172a]">{t.name}:</span>{" "}
                  <code className="rounded-md bg-[#f1f5f9] px-2 py-0.5 text-[13px] text-[#5b21b6]">{t.suggested}</code>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <BookingOperationsHub
        businessId={primaryBizId}
        businessName={primaryBizName}
        venueTimeZone={primaryVenueTz}
        schedules={schedules}
        exceptions={exceptions}
        events={hostedEvents}
        tables={floorTables}
        questions={tableQuestions}
        requests={inboxRequests}
        bizNameById={bizNameById}
        confirmedBookings={confirmedBookings}
      />

      <Card className="rounded-[22px] border border-dashed border-[#ddd6fe] bg-[#fafbff]/80 shadow-none">
        <CardHeader>
          <CardTitle className="text-base text-[#0f172a]">Delivery roadmap</CardTitle>
          <CardDescription className="text-[14px] leading-relaxed text-[#64748b]">
            Messages you queue here become structured SMS/email/call logs instantly — ideal for audits today. Wire Twilio/SendGrid later so the same drafts hit carriers automatically and inbound replies append without manual paste.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
