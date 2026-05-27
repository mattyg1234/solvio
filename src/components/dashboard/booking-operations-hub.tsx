"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { motion } from "framer-motion";
import {
  Loader2,
  Mail,
  MessageSquare,
  Phone,
  Plus,
  Trash2,
} from "lucide-react";

import { cancelVenueCalendarBooking } from "@/app/dashboard/bookings/calendar-actions";
import { callVenueCalendarGuestAction } from "@/app/dashboard/bookings/guest-call-actions";
import {
  cancelBusinessEvent,
  deleteAppointmentWeekdayHour,
  deleteFloorPlanTable,
  deleteTableBookingQuestion,
  renameFloorPlanTableLabel,
  restoreBusinessEvent,
  saveAppointmentQuestions,
  saveFloorPlanLayout,
  softDeleteBusinessEvent,
  uncancelBusinessEvent,
  upsertAppointmentWeekdayHour,
  upsertBusinessEvent,
  upsertFloorPlanTable,
  upsertTableBookingQuestion,
} from "@/app/dashboard/bookings/inventory-actions";
import { AppointmentExceptionGrid } from "@/components/dashboard/appointment-exception-grid";
import { SaveFlashBanner } from "@/components/dashboard/save-flash-banner";
import { StripeConnectRequiredCallout } from "@/components/dashboard/stripe-connect-required-callout";
import { AppointmentWeekGrid, type AppointmentBreakRow } from "@/components/dashboard/appointment-week-grid";
import { StaffWeekPlanner } from "@/components/dashboard/staff-week-planner";
import { StaffWeekScheduleGrid } from "@/components/dashboard/staff-week-schedule-grid";
import { BookingInbox, type BookingRequestRow, telBookingHref } from "@/components/dashboard/booking-inbox";
import { ManualBookingDialog } from "@/components/dashboard/manual-booking-dialog";
import { EditBookingDialog } from "@/components/dashboard/edit-booking-dialog";
import { GuestAiCallButton } from "@/components/dashboard/guest-ai-call-dialog";
import { EventSeriesCalendarSheet, type SheetBusinessEventRow } from "@/components/dashboard/event-series-calendar-sheet";
import { FloorTableWeekHoursStrip } from "@/components/dashboard/floor-table-week-hours-strip";
import { Button, buttonVariants } from "@/components/ui/button";
import { BOOKING_GUEST_MODE_LABELS, isBookingGuestMode } from "@/lib/booking-guest-modes";
import { parseRecurrenceExtras } from "@/lib/business-event-occurrences";
import type { AppointmentWeekRow, SlotExceptionRow } from "@/lib/booking-inventory-types";
export type { AppointmentWeekRow, SlotExceptionRow } from "@/lib/booking-inventory-types";
import { cn } from "@/lib/utils";
import { formatMoneyDisplay, moneySymbol } from "@/lib/checkout-money";
import {
  coerceFloorPlanShape,
  normalizeFloorTableDimensions,
  normalizeFloorTableFillColor,
  type FloorPlanTableShape,
} from "@/lib/floor-plan-visuals";

import type { BookingGuestsSub, BookingHubPrimary, BookingOfferingsSub } from "@/lib/bookings-hub-query";
import type { StaffMember } from "@/lib/staff-members";
import {
  centsToEuroInputValue,
  parseEuroInputToCents,
  parseOptionalEuroInputToCents,
  sanitizeEuroInput,
} from "@/lib/money-input";

const STRIPE_REQUIRED_MESSAGE = "To accept payments, connect Stripe first.";

function scrollToStripeConnectPrompt() {
  document.getElementById("stripe-connect-required")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function tableDepositCentsFromInputs(
  pricingMode: "table" | "person" | "group_tier",
  priceEuro: string,
  aboveEuro: string,
  belowEuro: string,
): number {
  if (pricingMode === "group_tier") {
    return Math.max(parseEuroInputToCents(aboveEuro), parseEuroInputToCents(belowEuro));
  }
  return parseEuroInputToCents(priceEuro);
}

export type BusinessEventRow = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  recurrence: unknown;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  deleted_at: string | null;
  capacity?: number | null;
  booked_count?: number;
  ticket_price_cents?: number | null;
  show_remaining_seats?: boolean;
};

export type FloorPlanTableWeekHourRow = {
  id: string;
  floor_plan_table_id: string;
  weekday: number;
  open_time: string;
  close_time: string;
};

export type FloorPlanTableRow = {
  id: string;
  label: string;
  capacity: number;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  pricing_mode: string;
  price_cents: number;
  group_pricing: Record<string, unknown> | null;
  shape?: string | null;
  fill_color?: string | null;
  table_week_hours?: FloorPlanTableWeekHourRow[];
};

export type TableQuestionRow = {
  id: string;
  question_label: string;
  required: boolean;
  sort_order: number;
};

export type VenueCalendarBookingRow = {
  id: string;
  business_id: string;
  booking_request_id: string | null;
  title: string;
  booking_kind: string | null;
  starts_at: string;
  ends_at: string;
  guest_name: string;
  guest_email: string;
  guest_phone: string | null;
  guest_count: number | null;
  floor_plan_table_id: string | null;
  business_event_id: string | null;
  status: string;
  internal_notes: string | null;
  staff_member?: string | null;
  created_at: string;
};

const WEEKDAY_LABEL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatStoredRecurrence(rec: unknown): string {
  if (rec == null) return "";
  if (typeof rec !== "object" || Array.isArray(rec)) return "";
  const o = rec as Record<string, unknown>;
  const type = typeof o.type === "string" ? o.type : "once";
  const { skipped } = parseRecurrenceExtras(rec);
  const cancelFrag = skipped.size ? ` (${skipped.size} cancelled)` : "";
  if (type === "once") return `One-off occurrence${cancelFrag}`;
  if (type === "daily") return `Repeats daily${cancelFrag}`;
  if (type === "weekly") {
    const weekdays = Array.isArray(o.weekdays) ? (o.weekdays as unknown[]) : [];
    const names = weekdays
      .filter((x): x is number => typeof x === "number" && Number.isFinite(x))
      .map((n) => WEEKDAY_LABEL[Math.round(n)] ?? `Day ${n}`)
      .filter(Boolean);
    if (!names.length) return `Weekly (no weekdays picked)${cancelFrag}`;
    return `Every ${names.join(", ")}${cancelFrag}`;
  }
  const label = type.length ? type.charAt(0).toUpperCase() + type.slice(1) : "Custom";
  return `${label}${cancelFrag}`;
}

function smsVenueQuickText(phone: string, opener: string) {
  const digits = phone.replace(/[^\d+]/g, "");
  const body = encodeURIComponent(opener);
  return `sms:${digits}?body=${body}`;
}

function clipTime(t: string) {
  return t.length >= 5 ? t.slice(0, 5) : t;
}

type BookingOperationsHubProps = {
  businessId: string | null;
  businessName: string | null;
  venueTimeZone: string;
  publicBookingUrl?: string | null;
  schedules: AppointmentWeekRow[];
  exceptions: SlotExceptionRow[];
  events: BusinessEventRow[];
  tables: FloorPlanTableRow[];
  questions: TableQuestionRow[];
  requests: BookingRequestRow[];
  bizNameById: Record<string, string>;
  confirmedBookings: VenueCalendarBookingRow[];
  bookingFlowComplete: boolean;
  initialPrimary?: BookingHubPrimary;
  initialGuestsSub?: BookingGuestsSub;
  initialOfferingsSub?: BookingOfferingsSub;
  bookingRequestHighlight?: string | null;
  stripeReadyByBizId?: Record<string, boolean>;
  staffMembers?: StaffMember[];
  appointmentQuestions?: { label: string; required: boolean }[];
  appointmentServices?: AppointmentServiceRow[];
  breaks?: AppointmentBreakRow[];
};

export function BookingOperationsHub({
  businessId,
  businessName,
  venueTimeZone,
  publicBookingUrl = null,
  schedules,
  exceptions,
  events,
  tables,
  questions,
  requests,
  bizNameById,
  confirmedBookings,
  bookingFlowComplete,
  initialPrimary,
  initialGuestsSub,
  initialOfferingsSub,
  bookingRequestHighlight,
  stripeReadyByBizId,
  staffMembers = [],
  appointmentQuestions = [],
  appointmentServices = [],
  breaks = [],
}: BookingOperationsHubProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [primary, setPrimary] = useState<BookingHubPrimary>(initialPrimary ?? "guests");
  const [guestsSub, setGuestsSub] = useState<BookingGuestsSub>(initialGuestsSub ?? "inbox");
  const [offeringsSub, setOfferingsSub] = useState<BookingOfferingsSub>(initialOfferingsSub ?? "appointments");
  const [saveFlash, setSaveFlash] = useState<string | null>(null);
  const notifySaved = useCallback(() => setSaveFlash("Saved"), []);
  const dismissSaveFlash = useCallback(() => setSaveFlash(null), []);

  useEffect(() => {
    setPrimary(initialPrimary ?? "guests");
    setGuestsSub(initialGuestsSub ?? "inbox");
    setOfferingsSub(initialOfferingsSub ?? "appointments");
  }, [initialPrimary, initialGuestsSub, initialOfferingsSub]);

  function pushBookingHubUrl(nextPrimary: BookingHubPrimary, gv: BookingGuestsSub, ov: BookingOfferingsSub) {
    const sp = new URLSearchParams();
    sp.set("tab", nextPrimary);
    sp.set("view", nextPrimary === "guests" ? gv : ov);
    const qs = sp.toString();
    router.replace(qs.length ? `${pathname}?${qs}` : pathname);
  }

  const activeEventsCount = useMemo(
    () => events.filter((ev) => !ev.cancelled_at && !ev.deleted_at).length,
    [events],
  );

  const inventoryBare =
    bookingFlowComplete && schedules.length === 0 && tables.length === 0 && activeEventsCount === 0;

  const workspaceHeading = useMemo(() => {
    if (primary === "guests") {
      if (guestsSub === "confirmed") {
        return {
          title: "Confirmed diary",
          subtitle: "Guests already on your calendar — contact them or cancel a slot.",
        };
      }
      return {
        title: "Incoming requests",
        subtitle: "Open a row to reply, call, or use Confirm slot to add them to the diary.",
      };
    }
    if (offeringsSub === "staff") {
      return {
        title: "Staff members",
        subtitle: "Set who works each day — guests pick a preferred team member on timed bookings.",
      };
    }
    if (offeringsSub === "events") {
      return {
        title: "Event manager",
        subtitle: "Add or edit show listings — highlighted calendar dates on your guest link come from here.",
      };
    }
    if (offeringsSub === "tables") {
      return {
        title: "Tables and floor plan",
        subtitle: "Drag tables on the canvas, set capacity and colours, save layout when done.",
      };
    }
    return {
      title: "Appointment manager",
      subtitle: "Set weekday open/close times and slot length — block individual slots for breaks below.",
    };
  }, [primary, guestsSub, offeringsSub]);

  if (!businessId || !businessName) {
    return (
      <section className="rounded-[22px] border border-dashed border-[#ddd6fe] bg-white px-6 py-8 text-sm text-[#64748b]">
        Add a business from Settings to unlock appointment grids, events, and floor plans.
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-[24px] border border-[#ebe7f7]/90 bg-white shadow-sm">
      {!bookingFlowComplete ? (
        <div className="border-b border-amber-200/90 bg-gradient-to-r from-amber-50 via-[#fffbeb] to-white px-4 py-4 md:px-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="max-w-[46rem] space-y-1">
              <p className="text-sm font-semibold text-[#92400e]">Start here — choose what guests can book</p>
              <p className="text-sm leading-relaxed text-[#78716c]">
                Decide whether callers reserve tables, timed appointments, ticketed events, walk-ins—or a blend. Until this is
                complete, Solvio hides the tailored guest questions on your public link.
              </p>
            </div>
            <Link
              href="/dashboard/setup/bookings"
              className={cn(
                buttonVariants({ variant: "default" }),
                "inline-flex shrink-0 items-center justify-center rounded-full px-6 text-sm font-semibold shadow-md shadow-[#7c3aed]/20",
              )}
            >
              Open booking setup
            </Link>
          </div>
        </div>
      ) : null}

      {bookingFlowComplete && inventoryBare ? (
        <div className="border-b border-sky-200/80 bg-[#f0f9ff] px-4 py-4 md:px-6">
          <p className="text-sm leading-relaxed text-[#0c4a6e]">
            No inventory yet — use the <span className="font-semibold text-[#0f172a]">Create &amp; edit</span> tiles above to add
            appointment hours, a hosted event, or your first table.
          </p>
        </div>
      ) : null}

      <div className="border-b border-[#f1eefc] bg-[#fafbff]/60 px-4 py-5 md:px-8 md:py-6">
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setPrimary("guests");
              pushBookingHubUrl("guests", guestsSub, offeringsSub);
            }}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-semibold transition-colors",
              primary === "guests" ? "bg-[#7c3aed] text-white shadow-sm" : "bg-white text-[#64748b] ring-1 ring-[#ebe7f7] hover:text-[#0f172a]",
            )}
          >
            Guest requests
          </button>
          <button
            type="button"
            onClick={() => {
              setPrimary("offerings");
              pushBookingHubUrl("offerings", guestsSub, offeringsSub);
            }}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-semibold transition-colors",
              primary === "offerings" ? "bg-[#7c3aed] text-white shadow-sm" : "bg-white text-[#64748b] ring-1 ring-[#ebe7f7] hover:text-[#0f172a]",
            )}
          >
            Inventory & pricing
          </button>
        </div>
        <h2 className="text-xl font-semibold tracking-tight text-[#0f172a]">{workspaceHeading.title}</h2>
        <p className="mt-1 max-w-3xl text-[14px] leading-relaxed text-[#64748b]">{workspaceHeading.subtitle}</p>
      </div>

      <div className="space-y-4 px-4 py-7 md:px-6 md:py-10">
        <SaveFlashBanner message={saveFlash} onDismiss={dismissSaveFlash} />
        {primary === "guests" ? (
          <GuestsHubPanel
            guestsSub={guestsSub}
            onGuestsSub={(next) => {
              setGuestsSub(next);
              pushBookingHubUrl("guests", next, offeringsSub);
            }}
            requests={requests}
            bizNameById={bizNameById}
            confirmedBookings={confirmedBookings}
            businessId={businessId}
            businessName={businessName ?? ""}
            venueTimeZone={venueTimeZone}
            tables={tables}
            events={events}
            schedules={schedules}
            breaks={breaks}
            staffMembers={staffMembers}
            inventoryLinks={{
              tables: tables.map((t) => ({ id: t.id, label: t.label })),
              events: events
                .filter((ev) => !ev.cancelled_at && !ev.deleted_at)
                .map((ev) => ({ id: ev.id, title: ev.title })),
            }}
            bookingRequestHighlight={bookingRequestHighlight}
            stripeReadyByBizId={stripeReadyByBizId}
            publicBookingUrl={publicBookingUrl}
            bookingFlowComplete={bookingFlowComplete}
          />
        ) : (
          <OfferingsHubPanel
            offeringsSub={offeringsSub}
            onOfferingsSub={(next) => {
              setOfferingsSub(next);
              pushBookingHubUrl("offerings", guestsSub, next);
            }}
            businessId={businessId}
            schedules={schedules}
            exceptions={exceptions}
            venueTimeZone={venueTimeZone}
            events={events}
            tables={tables}
            questions={questions}
            staffMembers={staffMembers}
            appointmentQuestions={appointmentQuestions}
            appointmentServices={appointmentServices}
            breaks={breaks}
            stripeReadyByBizId={stripeReadyByBizId}
            onSaved={notifySaved}
          />
        )}
      </div>
    </section>
  );
}

function GuestsHubPanel(props: {
  guestsSub: BookingGuestsSub;
  onGuestsSub: (next: BookingGuestsSub) => void;
  requests: BookingRequestRow[];
  bizNameById: Record<string, string>;
  inventoryLinks?: {
    tables: { id: string; label: string }[];
    events: { id: string; title: string }[];
  };
  bookingRequestHighlight?: string | null;
  confirmedBookings: VenueCalendarBookingRow[];
  businessId: string | null;
  businessName: string;
  venueTimeZone: string;
  tables: FloorPlanTableRow[];
  events: BusinessEventRow[];
  schedules: AppointmentWeekRow[];
  breaks: AppointmentBreakRow[];
  staffMembers: StaffMember[];
  stripeReadyByBizId?: Record<string, boolean>;
  publicBookingUrl?: string | null;
  bookingFlowComplete?: boolean;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 rounded-full border border-[#ebe7f7] bg-[#fafbff] p-1">
        {(
          [
            { key: "inbox"    as const, label: "Incoming" },
            { key: "confirmed" as const, label: "Confirmed" },
            { key: "planner"  as const, label: "Week planner" },
          ]
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => props.onGuestsSub(t.key)}
            className={cn(
              "rounded-full px-5 py-2.5 text-[14px] font-semibold transition-colors",
              props.guestsSub === t.key ? "bg-white text-[#5b21b6] shadow-sm" : "text-[#64748b] hover:text-[#0f172a]",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {props.guestsSub === "inbox" ? (
        <BookingInbox
          requests={props.requests}
          bizNameById={props.bizNameById}
          stripeReadyByBizId={props.stripeReadyByBizId}
          inventoryLinks={props.inventoryLinks}
          highlightBookingRequestId={props.bookingRequestHighlight ?? undefined}
          publicBookingUrl={props.publicBookingUrl}
          bookingFlowComplete={props.bookingFlowComplete}
        />
      ) : props.guestsSub === "planner" ? (
        <StaffWeekPlanner
          businessId={props.businessId ?? ""}
          bookings={props.confirmedBookings}
          staffMembers={props.staffMembers}
          schedules={props.schedules}
          breaks={props.breaks}
          venueTimeZone={props.venueTimeZone}
        />
      ) : (
        <ConfirmedBookingsPanelWithContacts
          businessId={props.businessId}
          businessName={props.businessName}
          venueTimeZone={props.venueTimeZone}
          bookings={props.confirmedBookings}
          tables={props.tables}
          events={props.events}
        />
      )}
    </div>
  );
}

function OfferingsHubPanel(props: {
  offeringsSub: BookingOfferingsSub;
  onOfferingsSub: (next: BookingOfferingsSub) => void;
  businessId: string;
  schedules: AppointmentWeekRow[];
  exceptions: SlotExceptionRow[];
  venueTimeZone: string;
  events: BusinessEventRow[];
  tables: FloorPlanTableRow[];
  questions: TableQuestionRow[];
  staffMembers: StaffMember[];
  appointmentQuestions?: { label: string; required: boolean }[];
  appointmentServices?: AppointmentServiceRow[];
  breaks?: AppointmentBreakRow[];
  stripeReadyByBizId?: Record<string, boolean>;
  onSaved?: () => void;
}) {
  const inAppointmentArea = props.offeringsSub === "appointments" || props.offeringsSub === "staff";

  return (
    <div className="space-y-6">
      {inAppointmentArea ? (
        <div className="flex flex-wrap gap-2 rounded-full border border-[#ebe7f7] bg-[#fafbff] p-1">
          {(
            [
              { key: "appointments" as const, label: "Appointments" },
              { key: "staff" as const, label: "Staff members" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => props.onOfferingsSub(t.key)}
              className={cn(
                "rounded-full px-5 py-2.5 text-[14px] font-semibold transition-colors",
                props.offeringsSub === t.key ? "bg-white text-[#5b21b6] shadow-sm" : "text-[#64748b] hover:text-[#0f172a]",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      ) : null}

      {props.offeringsSub === "appointments" ? (
        <AppointmentsPanel
          businessId={props.businessId}
          schedules={props.schedules}
          exceptions={props.exceptions}
          venueTimeZone={props.venueTimeZone}
          appointmentQuestions={props.appointmentQuestions}
          appointmentServices={props.appointmentServices}
          breaks={props.breaks ?? []}
          stripeReady={Boolean(props.stripeReadyByBizId?.[props.businessId])}
          onSaved={props.onSaved}
        />
      ) : null}

      {props.offeringsSub === "staff" ? (
        <StaffWeekScheduleGrid
          businessId={props.businessId}
          staffMembers={props.staffMembers}
          openWeekdays={props.schedules.map((s) => s.weekday)}
        />
      ) : null}

      {props.offeringsSub === "events" ? (
        <EventsPanel
          businessId={props.businessId}
          events={props.events}
          venueTimeZone={props.venueTimeZone}
          stripeReady={Boolean(props.stripeReadyByBizId?.[props.businessId])}
          onSaved={props.onSaved}
        />
      ) : null}

      {props.offeringsSub === "tables" ? (
        <TablesPanel
          businessId={props.businessId}
          schedules={props.schedules}
          tables={props.tables}
          questions={props.questions}
          stripeReady={Boolean(props.stripeReadyByBizId?.[props.businessId])}
          onSaved={props.onSaved}
        />
      ) : null}
    </div>
  );
}

function confirmedKindLabel(kind: string | null | undefined) {
  if (!kind?.trim()) return "—";
  return isBookingGuestMode(kind) ? BOOKING_GUEST_MODE_LABELS[kind] : kind;
}

function ConfirmedBookingsPanelWithContacts({
  businessId,
  businessName,
  venueTimeZone,
  bookings,
  tables,
  events,
}: {
  businessId: string | null;
  businessName: string;
  venueTimeZone: string;
  bookings: VenueCalendarBookingRow[];
  tables: FloorPlanTableRow[];
  events: BusinessEventRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showCancelled, setShowCancelled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const rows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let base = showCancelled ? bookings : bookings.filter((b) => b.status !== "cancelled");
    if (q) {
      base = base.filter((b) => {
        const haystack = [
          b.guest_name,
          b.guest_email,
          b.guest_phone ?? "",
          b.title ?? "",
          b.booking_kind ?? "",
          b.internal_notes ?? "",
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      });
    }
    return [...base].sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  }, [bookings, showCancelled, searchQuery]);

  function runCancel(id: string) {
    setError(null);
    startTransition(() => {
      void (async () => {
        try {
          await cancelVenueCalendarBooking(id);
          router.refresh();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not cancel.");
        }
      })();
    });
  }

  return (
    <div className="space-y-6">
      {error ? <p className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-2 text-sm text-rose-900">{error}</p> : null}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[#0f172a]">Scheduled guests</h2>
          <p className="mt-1 text-sm text-[#64748b]">
            Everyone with a locked slot under <span className="font-semibold text-[#0f172a]">{businessName}</span>. Call, text, or
            email from here, open the Solvio message thread when it started as a request, and prep AI-assisted dial-outs inside{" "}
            <span className="font-semibold text-[#0f172a]">Calls</span>.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {businessId ? (
            <ManualBookingDialog
              businessId={businessId}
              tables={tables.map((t) => ({ id: t.id, label: t.label }))}
              events={events
                .filter((e) => !e.cancelled_at && !e.deleted_at)
                .map((e) => ({ id: e.id, title: e.title }))}
            />
          ) : null}
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-[#475569]">
            <input
              type="checkbox"
              checked={showCancelled}
              onChange={(e) => setShowCancelled(e.target.checked)}
              className="h-4 w-4 rounded border-[#cbd5e1] text-[#7c3aed]"
            />
            Show cancelled
          </label>
        </div>
      </header>

      {bookings.length > 0 ? (
        <div className="relative">
          <svg
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94a3b8]"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16z" />
          </svg>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search confirmed guests by name, email, phone, or notes…"
            className="h-11 w-full rounded-full border border-[#ebe7f7] bg-[#fafbff] pl-10 pr-4 text-[14px] outline-none placeholder:text-[#94a3b8] focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
          />
          {searchQuery ? (
            <p className="mt-2 text-xs text-[#64748b]">
              Showing <span className="font-semibold text-[#0f172a]">{rows.length}</span> of{" "}
              {showCancelled ? bookings.length : bookings.filter((b) => b.status !== "cancelled").length} bookings
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-[#f1eefc]">
        <table className="w-full min-w-[1040px] text-left text-sm">
          <thead className="border-b border-[#ebe7f7] bg-[#fafbff] text-[11px] font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Guest</th>
              <th className="px-4 py-3">Quick reach</th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-[#64748b]">
                  Nothing locked yet — under <span className="font-semibold text-[#0f172a]">Inbox requests</span>, expand a guest and
                  use <span className="font-semibold text-[#5b21b6]">Confirm slot</span>.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b border-[#f8fafc]">
                  <td className="px-4 py-3 align-top text-[#475569]">
                    <p className="font-semibold text-[#0f172a]">
                      {new Date(row.starts_at).toLocaleString(undefined, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                    <p className="text-xs text-[#94a3b8]">
                      →{" "}
                      {new Date(row.ends_at).toLocaleString(undefined, {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                  </td>
                  <td className="max-w-[200px] px-4 py-3 align-top">
                    <p className="font-semibold text-[#0f172a]">{row.guest_name}</p>
                    <p className="break-all text-xs text-[#94a3b8]">{row.guest_email}</p>
                    {row.guest_phone ? (
                      <p className="mt-1 font-mono text-[12px] text-[#475569]">{row.guest_phone}</p>
                    ) : (
                      <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.14em] text-[#cbd5e1]">No phone captured</p>
                    )}
                    {typeof row.guest_count === "number" && row.guest_count > 0 ? (
                      <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.14em] text-[#64748b]">{row.guest_count} guests</p>
                    ) : null}
                  </td>
                  <td className="max-w-[260px] px-4 py-3 align-top">
                    <div className="flex flex-col gap-1.5">
                      {row.guest_phone ? (
                        <div className="flex flex-wrap gap-1.5">
                          <Link
                            href={telBookingHref(row.guest_phone)}
                            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 rounded-full px-3 text-[11px]")}
                          >
                            <Phone className="mr-1 h-3.5 w-3.5" aria-hidden /> Call
                          </Link>
                          <Link
                            href={smsVenueQuickText(
                              row.guest_phone,
                              `Hi — it's ${businessName}. Quick note about your reservation through Solvio.`,
                            )}
                            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 rounded-full px-3 text-[11px]")}
                          >
                            <MessageSquare className="mr-1 h-3.5 w-3.5" aria-hidden /> SMS
                          </Link>
                        </div>
                      ) : (
                        <span className="text-[11px] text-[#94a3b8]">SMS/call needs a captured phone.</span>
                      )}
                      <Link
                        href={`mailto:${encodeURIComponent(row.guest_email)}`}
                        className={cn(
                          buttonVariants({ variant: "ghost", size: "sm" }),
                          "h-8 justify-start px-2 text-[11px] text-[#475569]",
                        )}
                      >
                        <Mail className="mr-1 h-3.5 w-3.5" aria-hidden /> Email
                      </Link>
                          <GuestAiCallButton
                            guestName={row.guest_name}
                            guestPhone={row.guest_phone}
                            bookingLabel={row.title || "Booking"}
                            defaultPurpose={row.status === "cancelled" ? "booking_cancelled" : "booking_updated"}
                            onCall={({ purpose, changeSummary, customScript }) =>
                              callVenueCalendarGuestAction({
                                venueCalendarBookingId: row.id,
                                purpose,
                                changeSummary,
                                customScript,
                              })
                            }
                          />
                      {row.booking_request_id ? (
                        <Link
                          href={`/dashboard/bookings?tab=guests&view=inbox&booking=${row.booking_request_id}`}
                          className={cn(
                            buttonVariants({ variant: "outline", size: "sm" }),
                            "mt-1 h-8 rounded-full border-[#ede9fe] px-3 text-[11px]",
                          )}
                        >
                          Open Solvio chat log
                        </Link>
                      ) : (
                        <p className="text-[11px] text-[#94a3b8]">Inbound chat log only exists when bookings came from Requests.</p>
                      )}
                    </div>
                  </td>
                  <td className="max-w-[200px] px-4 py-3 align-top text-[#475569]">
                    <span className="line-clamp-2">{row.title || "—"}</span>
                  </td>
                  <td className="px-4 py-3 align-top text-[#475569]">{confirmedKindLabel(row.booking_kind)}</td>
                  <td className="px-4 py-3 align-top">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                        row.status === "confirmed"
                          ? "bg-[#ecfdf5] text-emerald-800"
                          : row.status === "cancelled"
                            ? "bg-[#fef2f2] text-rose-800"
                            : "bg-[#fffbeb] text-amber-900",
                      )}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right align-top">
                    {row.status === "confirmed" ? (
                      <div className="flex flex-col items-end gap-1">
                        <EditBookingDialog
                          booking={row}
                          businessName={businessName}
                          venueTimeZone={venueTimeZone}
                          tables={tables.map((t) => ({ id: t.id, label: t.label }))}
                          events={events
                            .filter((e) => !e.cancelled_at && !e.deleted_at)
                            .map((e) => ({ id: e.id, title: e.title }))}
                          onNotifyGuest={({ purpose, changeSummary, customScript }) =>
                            callVenueCalendarGuestAction({
                              venueCalendarBookingId: row.id,
                              purpose,
                              changeSummary,
                              customScript,
                            })
                          }
                        />
                        <button
                          type="button"
                          disabled={pending}
                          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-8 rounded-full px-3 text-[11px] font-semibold text-rose-700")}
                          onClick={() => runCancel(row.id)}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-[#94a3b8]">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export type AppointmentServiceRow = {
  id: string;
  name: string;
  duration_minutes: number;
  price_cents: number;
  sort_order: number;
};

function AppointmentsPanel({
  businessId,
  schedules,
  exceptions,
  venueTimeZone,
  appointmentQuestions = [],
  appointmentServices = [],
  breaks = [],
  stripeReady = false,
  onSaved,
}: {
  businessId: string;
  schedules: AppointmentWeekRow[];
  exceptions: SlotExceptionRow[];
  venueTimeZone: string;
  appointmentQuestions?: { label: string; required: boolean }[];
  appointmentServices?: AppointmentServiceRow[];
  breaks?: AppointmentBreakRow[];
  stripeReady?: boolean;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [weekday, setWeekday] = useState(1);
  const [openTime, setOpenTime] = useState("09:00");
  const [closeTime, setCloseTime] = useState("17:00");
  const [slotMin, setSlotMin] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [services, setServices] = useState<AppointmentServiceRow[]>(appointmentServices);
  const [newServiceName, setNewServiceName] = useState("");
  const [newServiceDuration, setNewServiceDuration] = useState(60);
  const [newServicePriceEuro, setNewServicePriceEuro] = useState("");
  const [questions, setQuestions] = useState<{ label: string; required: boolean }[]>(appointmentQuestions);
  const [stripePromptHighlighted, setStripePromptHighlighted] = useState(false);

  const used = useMemo(() => new Set(schedules.map((s) => s.weekday)), [schedules]);

  useEffect(() => {
    setServices(appointmentServices);
  }, [appointmentServices]);

  useEffect(() => {
    setQuestions(appointmentQuestions);
  }, [appointmentQuestions]);

  function saveNewService() {
    if (newServiceName.trim().length < 2) {
      setError("Service name must be at least 2 characters.");
      return;
    }
    if (newServiceDuration < 5) {
      setError("Duration must be at least 5 minutes.");
      return;
    }
    const priceCents = parseEuroInputToCents(newServicePriceEuro);
    if (!stripeReady && priceCents > 0) {
      setError(STRIPE_REQUIRED_MESSAGE);
      setStripePromptHighlighted(true);
      scrollToStripeConnectPrompt();
      return;
    }
    run(async () => {
      const { createAppointmentService } = await import("@/app/dashboard/bookings/inventory-actions");
      await createAppointmentService({
        businessId,
        name: newServiceName,
        durationMinutes: newServiceDuration,
        priceCents,
      });
      setNewServiceName("");
      setNewServiceDuration(60);
      setNewServicePriceEuro("");
      router.refresh();
    });
  }

  function run(fn: () => Promise<void>) {
    setError(null);
    startTransition(() => {
      void (async () => {
        try {
          await fn();
          onSaved?.();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not save.");
        }
      })();
    });
  }

  return (
    <div className="space-y-8">
      {error ? <p className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-2 text-sm text-rose-900">{error}</p> : null}
      <header>
        <h2 className="text-lg font-semibold text-[#0f172a]">Weekly appointment windows</h2>
        <p className="mt-1 text-sm text-[#64748b]">
          Set your regular open hours below. Use the calendar to block specific days off — guests won&apos;t see slots on closed dates.
        </p>
      </header>

      <div className="overflow-x-auto rounded-2xl border border-[#f1eefc] bg-white shadow-sm md:rounded-2xl">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="border-b border-[#ebe7f7] bg-[#fafbff] text-[11px] font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">
            <tr>
              <th className="px-4 py-3">Day</th>
              <th className="px-4 py-3">Open</th>
              <th className="px-4 py-3">Close</th>
              <th className="px-4 py-3">Slots</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {schedules.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-[#64748b]">
                  No weekly rows yet — add Mon–Sat grids below.
                </td>
              </tr>
            ) : (
              schedules.map((s) => (
                <tr key={s.id} className="border-b border-[#f8fafc]">
                  <td className="px-4 py-3 font-semibold text-[#0f172a]">{WEEKDAY_LABEL[s.weekday] ?? s.weekday}</td>
                  <td className="px-4 py-3 text-[#475569]">{clipTime(s.open_time)}</td>
                  <td className="px-4 py-3 text-[#475569]">{clipTime(s.close_time)}</td>
                  <td className="px-4 py-3 text-[#475569]">{s.slot_minutes} min</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      disabled={pending}
                      className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-rose-700")}
                      onClick={() =>
                        run(async () => {
                          await deleteAppointmentWeekdayHour(businessId, s.id);
                        })
                      }
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 rounded-2xl border border-[#ede9fe] bg-[#fafbff]/90 p-5 md:grid-cols-5 md:items-end">
        <div className="space-y-1 md:col-span-1">
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">Weekday</label>
          <select
            value={weekday}
            onChange={(e) => setWeekday(Number(e.target.value))}
            className="h-11 w-full rounded-xl border border-[#ebe7f7] bg-white px-3 text-[15px]"
          >
            {WEEKDAY_LABEL.map((lbl, i) => (
              <option key={lbl} value={i} disabled={used.has(i)}>
                {lbl}
                {used.has(i) ? " · saved" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">Open</label>
          <input type="time" value={openTime} onChange={(e) => setOpenTime(e.target.value)} className="h-11 w-full rounded-xl border border-[#ebe7f7] px-3" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">Close</label>
          <input type="time" value={closeTime} onChange={(e) => setCloseTime(e.target.value)} className="h-11 w-full rounded-xl border border-[#ebe7f7] px-3" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">Slot length</label>
          <select value={slotMin} onChange={(e) => setSlotMin(Number(e.target.value))} className="h-11 w-full rounded-xl border border-[#ebe7f7] px-3">
            {[15, 30, 45, 60, 90].map((m) => (
              <option key={m} value={m}>
                {m} min
              </option>
            ))}
          </select>
        </div>
        <Button
          type="button"
          disabled={pending || used.has(weekday)}
          className="h-11 rounded-full font-semibold shadow-md shadow-[#7c3aed]/20"
          onClick={() =>
            run(async () => {
              await upsertAppointmentWeekdayHour({
                businessId,
                weekday,
                openTime,
                closeTime,
                slotMinutes: slotMin,
              });
            })
          }
        >
          <Plus className="mr-2 inline h-4 w-4" aria-hidden />
          Save day
        </Button>
      </div>

      <AppointmentWeekGrid
        businessId={businessId}
        schedules={schedules}
        breaks={breaks}
      />

      <AppointmentExceptionGrid
        businessId={businessId}
        schedules={schedules}
        exceptions={exceptions}
        venueTimeZone={venueTimeZone}
      />

      <div className="space-y-4 rounded-2xl border border-[#ede9fe] bg-[#fafbff]/90 p-5">
        <header>
          <h3 className="text-base font-semibold text-[#0f172a]">Services</h3>
          <p className="mt-1 text-sm text-[#64748b]">
            Guests select a service (haircut, color, massage, etc.) with duration and price on the public form.
          </p>
        </header>
        {!stripeReady ? (
          <StripeConnectRequiredCallout businessId={businessId} highlighted={stripePromptHighlighted} />
        ) : null}
        {services.length === 0 ? (
          <p className="text-sm text-[#94a3b8]">No services yet — guests will book a generic appointment slot.</p>
        ) : (
          <ul className="space-y-2">
            {services.map((svc) => (
              <li
                key={svc.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#f1eefc] bg-white px-3 py-2 text-sm"
              >
                <div className="flex-1">
                  <span className="font-semibold text-[#0f172a]">{svc.name}</span>
                  <p className="text-[12px] text-[#64748b]">
                    {svc.duration_minutes} min · {formatMoneyDisplay(svc.price_cents)}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-rose-700")}
                  onClick={() =>
                    run(async () => {
                      const {
                        deleteAppointmentService,
                      } = await import("@/app/dashboard/bookings/inventory-actions");
                      await deleteAppointmentService(businessId, svc.id);
                      setServices((prev) => prev.filter((s) => s.id !== svc.id));
                      router.refresh();
                    })
                  }
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="space-y-3 border-t border-[#ebe7f7] pt-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_110px_110px_auto] sm:items-end">
            <label className="block space-y-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">
              Service name
              <input
                value={newServiceName}
                onChange={(e) => setNewServiceName(e.target.value)}
                placeholder="Haircut, Color, Massage…"
                className="h-11 w-full rounded-xl border border-[#ebe7f7] bg-white px-3 text-[15px] font-normal normal-case tracking-normal text-[#0f172a]"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    saveNewService();
                  }
                }}
              />
            </label>
            <label className="block space-y-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">
              Duration (min)
              <input
                type="number"
                value={newServiceDuration}
                onChange={(e) => setNewServiceDuration(Math.max(5, Number(e.target.value)))}
                min="5"
                step="5"
                className="h-11 w-full rounded-xl border border-[#ebe7f7] bg-white px-3 text-[15px] font-normal text-[#0f172a]"
              />
            </label>
            <label className="block space-y-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">
              Price ({moneySymbol()})
              <input
                type="text"
                inputMode="decimal"
                value={newServicePriceEuro}
                onChange={(e) => setNewServicePriceEuro(sanitizeEuroInput(e.target.value))}
                placeholder={stripeReady ? "10.50" : "Free until Stripe connected"}
                className="h-11 w-full rounded-xl border border-[#ebe7f7] bg-white px-3 text-[15px] font-normal text-[#0f172a]"
              />
            </label>
            <Button
              type="button"
              disabled={pending || newServiceName.trim().length < 2}
              className="h-11 rounded-full px-5 font-semibold shadow-md shadow-[#7c3aed]/20 sm:mt-0"
              onClick={saveNewService}
            >
              {pending ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden /> : <Plus className="mr-2 inline h-4 w-4" aria-hidden />}
              Save service
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border border-[#ede9fe] bg-[#fafbff]/90 p-5">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-[#0f172a]">Custom appointment questions</h3>
            <p className="mt-1 text-sm text-[#64748b]">
              Asked on the public form when a guest books an appointment. Answers appear in Incoming requests + Confirmed diary.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            className="h-9 rounded-full text-xs font-semibold"
            onClick={() => setQuestions((prev) => [...prev, { label: "", required: false }])}
          >
            <Plus className="mr-1 inline h-3.5 w-3.5" aria-hidden />
            Add question
          </Button>
        </header>
        {questions.length === 0 ? (
          <p className="text-sm text-[#94a3b8]">No appointment questions yet — add one above (optional).</p>
        ) : (
          <ul className="space-y-2">
            {questions.map((q, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2 rounded-xl border border-[#f1eefc] bg-white px-3 py-2">
                <input
                  value={q.label}
                  onChange={(e) =>
                    setQuestions((prev) => prev.map((x, j) => (i === j ? { ...x, label: e.target.value } : x)))
                  }
                  placeholder="e.g. Any allergies?"
                  className="h-9 flex-1 min-w-[200px] rounded-lg border border-[#ebe7f7] bg-[#fafbff] px-3 text-[14px] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
                />
                <label className="flex items-center gap-1.5 text-[12px] font-medium text-[#475569]">
                  <input
                    type="checkbox"
                    checked={q.required}
                    onChange={(e) =>
                      setQuestions((prev) => prev.map((x, j) => (i === j ? { ...x, required: e.target.checked } : x)))
                    }
                    className="h-4 w-4 rounded border-[#cbd5e1] text-[#7c3aed]"
                  />
                  Required
                </label>
                <button
                  type="button"
                  onClick={() => setQuestions((prev) => prev.filter((_, j) => j !== i))}
                  className="rounded-full p-1.5 text-rose-700 hover:bg-rose-50"
                  aria-label="Remove question"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <Button
          type="button"
          disabled={pending}
          className="h-10 rounded-full font-semibold shadow-md shadow-[#7c3aed]/20"
          onClick={() =>
            run(async () => {
              await saveAppointmentQuestions(
                businessId,
                questions.filter((q) => q.label.trim().length > 0),
              );
              router.refresh();
            })
          }
        >
          Save appointment questions
        </Button>
      </div>
    </div>
  );
}

function EventsPanel({
  businessId,
  events,
  venueTimeZone,
  stripeReady = false,
  onSaved,
}: {
  businessId: string;
  events: BusinessEventRow[];
  venueTimeZone: string;
  stripeReady?: boolean;
  onSaved?: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [manageCalendarFor, setManageCalendarFor] = useState<BusinessEventRow | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [starts, setStarts] = useState("");
  const [ends, setEnds] = useState("");
  const [recPreset, setRecPreset] = useState<"once" | "daily" | "weekly">("once");
  const [weekBits, setWeekBits] = useState<number[]>([1, 3]);
  const [capacity, setCapacity] = useState<string>("");
  const [ticketPriceEur, setTicketPriceEur] = useState<string>("");
  const [showRemainingSeats, setShowRemainingSeats] = useState<boolean>(true);
  const [customQuestions, setCustomQuestions] = useState<{ label: string; required: boolean }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [stripePromptHighlighted, setStripePromptHighlighted] = useState(false);

  const visible = events.filter((e) => !e.deleted_at);

  function recurrenceJson() {
    if (recPreset === "once") return { type: "once" };
    if (recPreset === "daily") return { type: "daily" };
    return { type: "weekly", weekdays: weekBits };
  }

  function run(fn: () => Promise<void>) {
    setError(null);
    startTransition(() => {
      void (async () => {
        try {
          await fn();
          onSaved?.();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not save.");
        }
      })();
    });
  }

  function toggleWeekday(d: number) {
    setWeekBits((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)));
  }

  return (
    <div className="space-y-8">
      {error ? <p className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-2 text-sm text-rose-900">{error}</p> : null}
      <EventSeriesCalendarSheet
        event={manageCalendarFor as SheetBusinessEventRow | null}
        businessId={businessId}
        venueTimeZone={venueTimeZone}
        onClose={() => setManageCalendarFor(null)}
      />
      <header>
        <h2 className="text-lg font-semibold text-[#0f172a]">Events & series</h2>
        <p className="mt-1 text-sm text-[#64748b]">
          Cancelling a single night keeps history for voice scripts and the public booking page. Delete removes the listing from dashboards (recoverable via restore later).
        </p>
      </header>

      <div className="grid gap-4 rounded-2xl border border-[#ede9fe] bg-[#fafbff]/90 p-5 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="h-11 w-full rounded-xl border border-[#ebe7f7] px-3" placeholder='e.g. "Billy Porter Live Comedy"' />
        </div>
        <div className="space-y-2 md:col-span-2">
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="w-full rounded-xl border border-[#ebe7f7] px-3 py-2" />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">Starts</label>
          <input type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} className="h-11 w-full rounded-xl border border-[#ebe7f7] px-3" />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">Ends</label>
          <input type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} className="h-11 w-full rounded-xl border border-[#ebe7f7] px-3" />
        </div>
        <div className="space-y-2 md:col-span-2">
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">
            Capacity <span className="font-normal normal-case tracking-normal text-[#94a3b8]">(leave blank = unlimited)</span>
          </label>
          <input
            type="number"
            min={1}
            max={10000}
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            placeholder="e.g. 100"
            className="h-11 w-40 rounded-xl border border-[#ebe7f7] px-3"
          />
          <p className="text-[12px] text-[#64748b]">
            Once the booked count reaches this number, the public form blocks new bookings and tells guests how many seats are left.
          </p>
          <label className="mt-2 inline-flex cursor-pointer items-center gap-2 text-[12px] text-[#475569]">
            <input
              type="checkbox"
              checked={showRemainingSeats}
              onChange={(e) => setShowRemainingSeats(e.target.checked)}
              className="h-4 w-4 rounded border-[#cbd5e1] text-[#7c3aed]"
            />
            Show <span className="font-semibold">&ldquo;X seats left&rdquo;</span> on the public form (capacity is still enforced if off)
          </label>
        </div>
        <div className="space-y-2 md:col-span-2">
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">
            Ticket price <span className="font-normal normal-case tracking-normal text-[#94a3b8]">({moneySymbol()} — leave blank for free / RSVP)</span>
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={ticketPriceEur}
            onChange={(e) => setTicketPriceEur(sanitizeEuroInput(e.target.value))}
            placeholder="10.50"
            className="h-11 w-40 rounded-xl border border-[#ebe7f7] px-3"
          />
          <p className="text-[12px] text-[#64748b]">
            Paid events <span className="font-semibold">block free table bookings</span> on the same date — guests must buy a ticket
            instead. Free / RSVP events leave tables bookable.
          </p>
          {!stripeReady ? (
            <StripeConnectRequiredCallout businessId={businessId} highlighted={stripePromptHighlighted} className="mt-3" />
          ) : null}
        </div>
        <div className="space-y-2 md:col-span-2">
          <div className="flex items-end justify-between gap-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">
                Custom questions <span className="font-normal normal-case tracking-normal text-[#94a3b8]">(optional)</span>
              </label>
              <p className="mt-1 text-[12px] text-[#64748b]">
                Ask guests anything extra when they book this event — e.g. &ldquo;How many children?&rdquo;, &ldquo;Dietary needs?&rdquo;
                Answers show in Incoming requests and Confirmed diary.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCustomQuestions((prev) => [...prev, { label: "", required: false }])}
              className={cn(buttonVariants({ variant: "outline" }), "h-9 shrink-0 rounded-full text-xs font-semibold")}
            >
              <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
              Add question
            </button>
          </div>
          {customQuestions.length > 0 ? (
            <ul className="space-y-2">
              {customQuestions.map((q, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2 rounded-xl border border-[#f1eefc] bg-white px-3 py-2">
                  <input
                    value={q.label}
                    onChange={(e) =>
                      setCustomQuestions((prev) => prev.map((x, j) => (i === j ? { ...x, label: e.target.value } : x)))
                    }
                    placeholder="e.g. How many children?"
                    className="h-9 flex-1 min-w-[200px] rounded-lg border border-[#ebe7f7] bg-[#fafbff] px-3 text-[14px] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
                  />
                  <label className="flex items-center gap-1.5 text-[12px] font-medium text-[#475569]">
                    <input
                      type="checkbox"
                      checked={q.required}
                      onChange={(e) =>
                        setCustomQuestions((prev) =>
                          prev.map((x, j) => (i === j ? { ...x, required: e.target.checked } : x)),
                        )
                      }
                      className="h-4 w-4 rounded border-[#cbd5e1] text-[#7c3aed]"
                    />
                    Required
                  </label>
                  <button
                    type="button"
                    onClick={() => setCustomQuestions((prev) => prev.filter((_, j) => j !== i))}
                    className="rounded-full p-1.5 text-rose-700 hover:bg-rose-50"
                    aria-label="Remove question"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="space-y-2 md:col-span-2">
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">Recurrence</label>
          <select value={recPreset} onChange={(e) => setRecPreset(e.target.value as typeof recPreset)} className="h-11 w-full rounded-xl border border-[#ebe7f7] px-3 md:w-auto">
            <option value="once">One-off</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly (pick weekdays)</option>
          </select>
          <p className="mt-2 text-[12px] leading-relaxed text-[#64748b]">
            <strong className="text-[#475569]">Starts / Ends</strong> set your <strong>first</strong> occurrence. For &ldquo;2 June then every Wednesday&rdquo;, choose Weekly, tick Wednesday,
            start on that Wednesday, and reuse the usual show duration for Ends — repeats follow the weekdays you ticked.
          </p>
          {recPreset === "weekly" ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {WEEKDAY_LABEL.map((lbl, i) => (
                <button
                  key={lbl}
                  type="button"
                  onClick={() => toggleWeekday(i)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-semibold",
                    weekBits.includes(i) ? "border-[#a78bfa] bg-[#f5f3ff] text-[#5b21b6]" : "border-[#ebe7f7] text-[#64748b]",
                  )}
                >
                  {lbl}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="md:col-span-2">
          <Button
            type="button"
            disabled={pending || !title.trim() || !starts || !ends}
            className="rounded-full font-semibold shadow-md shadow-[#7c3aed]/20"
            onClick={() =>
              run(async () => {
                const capParsed = parseInt(capacity, 10);
                const ticketCents = parseOptionalEuroInputToCents(ticketPriceEur);
                if (!stripeReady && (ticketCents ?? 0) > 0) {
                  setError(STRIPE_REQUIRED_MESSAGE);
                  setStripePromptHighlighted(true);
                  scrollToStripeConnectPrompt();
                  return;
                }
                await upsertBusinessEvent({
                  businessId,
                  title,
                  description,
                  startsAt: new Date(starts).toISOString(),
                  endsAt: new Date(ends).toISOString(),
                  recurrence: recurrenceJson(),
                  capacity: Number.isFinite(capParsed) && capParsed > 0 ? capParsed : null,
                  customQuestions: customQuestions.filter((q) => q.label.trim().length > 0),
                  ticketPriceCents: ticketCents,
                  showRemainingSeats,
                });
                setTitle("");
                setDescription("");
                setStarts("");
                setEnds("");
                setCapacity("");
                setTicketPriceEur("");
                setShowRemainingSeats(true);
                setCustomQuestions([]);
              })
            }
          >
            Create event
          </Button>
        </div>
      </div>

      <ul className="space-y-3">
        {visible.map((ev) => (
          <li key={ev.id} className="rounded-2xl border border-[#f1eefc] bg-white px-4 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-[#0f172a]">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setManageCalendarFor(ev)}
                    className={cn(
                      "text-left text-[inherit] underline decoration-[#ddd6fe] decoration-2 underline-offset-2 hover:decoration-[#a78bfa]",
                      pending && "opacity-60",
                    )}
                  >
                    {ev.title}
                  </button>
                  {ev.cancelled_at ? (
                    <span className="ml-2 inline-flex shrink-0 flex-wrap align-middle rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-rose-700">
                      Cancelled
                    </span>
                  ) : null}
                  {typeof ev.capacity === "number" && ev.capacity > 0 ? (
                    (() => {
                      const booked = ev.booked_count ?? 0;
                      const remaining = Math.max(0, ev.capacity - booked);
                      const tone =
                        remaining === 0
                          ? "bg-rose-50 text-rose-800 ring-rose-100"
                          : remaining <= Math.max(1, Math.floor(ev.capacity * 0.1))
                            ? "bg-amber-50 text-amber-900 ring-amber-100"
                            : "bg-emerald-50 text-emerald-800 ring-emerald-100";
                      return (
                        <span className={cn("ml-2 inline-flex shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1", tone)}>
                          {remaining === 0 ? "Sold out" : `${booked}/${ev.capacity} booked`}
                        </span>
                      );
                    })()
                  ) : null}
                  {typeof ev.ticket_price_cents === "number" && ev.ticket_price_cents > 0 ? (
                    <span className="ml-2 inline-flex shrink-0 rounded-full bg-[#f5f3ff] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#5b21b6] ring-1 ring-[#ddd6fe]">
                      {formatMoneyDisplay(ev.ticket_price_cents)} ticket
                    </span>
                  ) : null}
                </p>
                <p className="mt-1 text-xs text-[#64748b]">
                  {new Date(ev.starts_at).toLocaleString()} → {new Date(ev.ends_at).toLocaleString()}
                  <span className="mt-1 block text-[13px] font-semibold uppercase tracking-[0.08em] text-[#5b21b6]/90">
                    {formatStoredRecurrence(ev.recurrence)}
                  </span>
                </p>
                {ev.description ? <p className="mt-2 text-sm text-[#475569]">{ev.description}</p> : null}
                {ev.cancelled_at && ev.cancellation_reason ? (
                  <p className="mt-2 text-sm text-rose-800">Reason: {ev.cancellation_reason}</p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  className="rounded-full text-xs font-semibold text-[#5b21b6] border-[#ddd6fe]"
                  onClick={() => setManageCalendarFor(ev)}
                >
                  Manage calendar
                </Button>
                {!ev.cancelled_at ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    className="rounded-full text-xs font-semibold text-rose-700"
                    onClick={() =>
                      run(async () => {
                        const reason = window.prompt("Cancellation reason for callers / AI?");
                        await cancelBusinessEvent(businessId, ev.id, reason);
                      })
                    }
                  >
                    Cancel
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    className="rounded-full text-xs font-semibold"
                    onClick={() =>
                      run(async () => {
                        await uncancelBusinessEvent(businessId, ev.id);
                      })
                    }
                  >
                    Restore
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  className="rounded-full text-xs font-semibold text-[#64748b]"
                  onClick={() =>
                    run(async () => {
                      await softDeleteBusinessEvent(businessId, ev.id);
                    })
                  }
                >
                  Delete
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  className="rounded-full text-xs font-semibold text-[#475569]"
                  onClick={() =>
                    run(async () => {
                      await restoreBusinessEvent(businessId, ev.id);
                    })
                  }
                >
                  Undelete
                </Button>
              </div>
            </div>
          </li>
        ))}
        {visible.length === 0 ? <li className="text-sm text-[#94a3b8]">No active events.</li> : null}
      </ul>
    </div>
  );
}

function tierEuroDefaults(table: FloorPlanTableRow): {
  threshold: string;
  aboveEuro: string;
  belowEuro: string;
} {
  const gp = table.group_pricing;
  const fallback = { threshold: "10", aboveEuro: "100", belowEuro: "50" };
  if (!gp || typeof gp !== "object" || Array.isArray(gp)) return fallback;
  const o = gp as Record<string, unknown>;
  const tpRaw = typeof o.thresholdPeople === "number" ? o.thresholdPeople : Number.parseInt(String(o.thresholdPeople ?? ""), 10);
  const threshold = Number.isFinite(tpRaw) ? String(tpRaw) : fallback.threshold;
  const aboveEuro =
    typeof o.atOrAboveCents === "number" && Number.isFinite(o.atOrAboveCents)
      ? (o.atOrAboveCents / 100).toFixed(2)
      : fallback.aboveEuro;
  const belowEuro =
    typeof o.belowCents === "number" && Number.isFinite(o.belowCents)
      ? (o.belowCents / 100).toFixed(2)
      : fallback.belowEuro;
  return { threshold, aboveEuro, belowEuro };
}

function SavedFloorTableDetailForm({
  businessId,
  table,
  stripeReady = false,
  onPaidSaveBlocked,
}: {
  businessId: string;
  table: FloorPlanTableRow;
  stripeReady?: boolean;
  onPaidSaveBlocked?: () => void;
}) {
  const snapshotKey = `${table.id}|${table.label}|${table.capacity}|${coerceFloorPlanShape(table.shape)}|${normalizeFloorTableFillColor(table.fill_color) ?? ""}|${Math.round(table.width)}|${Math.round(table.height)}|${table.pricing_mode}|${table.price_cents}|${JSON.stringify(table.group_pricing ?? null)}`;

  const [pending, startTransition] = useTransition();
  const [capacity, setCapacity] = useState(table.capacity);
  const [error, setError] = useState<string | null>(null);
  const [shape, setShape] = useState<FloorPlanTableShape>(() => coerceFloorPlanShape(table.shape));
  const [widthPx, setWidthPx] = useState(Math.round(table.width));
  const [heightPx, setHeightPx] = useState(Math.round(table.height));
  const [hexText, setHexText] = useState(normalizeFloorTableFillColor(table.fill_color) ?? "");
  const pmInit =
    table.pricing_mode === "person"
      ? "person"
      : table.pricing_mode === "group_tier"
        ? "group_tier"
        : "table";
  const [pricingMode, setPricingMode] = useState<"table" | "person" | "group_tier">(pmInit);
  const [priceEuro, setPriceEuro] = useState(() => centsToEuroInputValue(table.price_cents));
  const teInit = tierEuroDefaults(table);
  const [threshold, setThreshold] = useState(teInit.threshold);
  const [aboveEuro, setAboveEuro] = useState(teInit.aboveEuro);
  const [belowEuro, setBelowEuro] = useState(teInit.belowEuro);

  useEffect(() => {
    setCapacity(table.capacity);
    setShape(coerceFloorPlanShape(table.shape));
    setWidthPx(Math.round(table.width));
    setHeightPx(Math.round(table.height));
    setHexText(normalizeFloorTableFillColor(table.fill_color) ?? "");
    const pm =
      table.pricing_mode === "person"
        ? "person"
        : table.pricing_mode === "group_tier"
          ? "group_tier"
          : "table";
    setPricingMode(pm);
    setPriceEuro(centsToEuroInputValue(table.price_cents));
    const te = tierEuroDefaults(table);
    setThreshold(te.threshold);
    setAboveEuro(te.aboveEuro);
    setBelowEuro(te.belowEuro);
  }, [snapshotKey, table]);

  function runSave(fn: () => Promise<void>) {
    setError(null);
    startTransition(() => {
      void (async () => {
        try {
          await fn();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not save.");
        }
      })();
    });
  }

  const pickerValue = normalizeFloorTableFillColor(hexText) ?? "#EEF2FF";

  return (
    <div className="mt-4 space-y-4 rounded-xl border border-dashed border-[#dcd6fb] bg-[#fcfbff]/80 px-4 py-3">
      {error ? <p className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-900">{error}</p> : null}
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">Edit capacity, shape & pricing</p>
      <div className="grid gap-3 md:grid-cols-6 md:items-end">
        <div className="space-y-2 md:col-span-1">
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">Capacity</label>
          <input type="number" min={1} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} className="h-11 w-full rounded-xl border border-[#ebe7f7] px-3" />
        </div>
        <div className="space-y-2 md:col-span-1">
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">Shape</label>
          <select
            value={shape}
            onChange={(e) => setShape(e.target.value as FloorPlanTableShape)}
            className="h-11 w-full rounded-xl border border-[#ebe7f7] px-3"
          >
            <option value="rectangle">Rectangle</option>
            <option value="square">Square</option>
            <option value="circle">Circle</option>
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2 md:col-span-2">
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">Fill</label>
            <div className="flex gap-2">
              <input
                type="color"
                aria-label="Table fill colour picker"
                className="h-11 w-14 cursor-pointer rounded-lg border border-[#ebe7f7] bg-white p-1"
                value={pickerValue}
                onChange={(e) =>
                  setHexText(normalizeFloorTableFillColor(e.target.value) ?? "")
                }
              />
              <input
                value={hexText}
                onChange={(e) => setHexText(e.target.value)}
                placeholder="#EEF2FF or empty for default"
                className="h-11 min-w-[9rem] flex-1 rounded-xl border border-[#ebe7f7] px-3 font-mono text-sm"
              />
            </div>
          </div>
        </div>
        <div className="space-y-2 md:col-span-1">
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">Width (px)</label>
          <input type="number" min={48} value={widthPx} onChange={(e) => setWidthPx(Number(e.target.value))} className="h-11 w-full rounded-xl border border-[#ebe7f7] px-3" />
        </div>
        <div className="space-y-2 md:col-span-1">
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">Height (px)</label>
          <input type="number" min={48} value={heightPx} onChange={(e) => setHeightPx(Number(e.target.value))} className="h-11 w-full rounded-xl border border-[#ebe7f7] px-3" />
        </div>
        <div className="space-y-2 md:col-span-2">
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">Pricing mode</label>
          <select
            value={pricingMode}
            onChange={(e) => setPricingMode(e.target.value as typeof pricingMode)}
            className="h-11 w-full rounded-xl border border-[#ebe7f7] px-3"
          >
            <option value="table">Flat per table ({moneySymbol()})</option>
            <option value="person">Per person ({moneySymbol()})</option>
            <option value="group_tier">Tier by group size</option>
          </select>
        </div>
        {pricingMode !== "group_tier" ? (
          <div className="space-y-2 md:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">Amount ({moneySymbol()})</label>
            <input
              type="text"
              inputMode="decimal"
              value={priceEuro}
              onChange={(e) => setPriceEuro(sanitizeEuroInput(e.target.value))}
              placeholder="10.50"
              className="h-11 w-full rounded-xl border border-[#ebe7f7] px-3"
            />
          </div>
        ) : (
          <div className="flex flex-wrap gap-3 md:col-span-6">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#64748b]">If ≥ guests</label>
              <input value={threshold} onChange={(e) => setThreshold(e.target.value)} className="h-11 w-24 rounded-xl border border-[#ebe7f7] px-3" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#64748b]">Charge {moneySymbol()}</label>
              <input
                type="text"
                inputMode="decimal"
                value={aboveEuro}
                onChange={(e) => setAboveEuro(sanitizeEuroInput(e.target.value))}
                placeholder="100"
                className="h-11 w-24 rounded-xl border border-[#ebe7f7] px-3"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#64748b]">Else {moneySymbol()}</label>
              <input
                type="text"
                inputMode="decimal"
                value={belowEuro}
                onChange={(e) => setBelowEuro(sanitizeEuroInput(e.target.value))}
                placeholder="50"
                className="h-11 w-24 rounded-xl border border-[#ebe7f7] px-3"
              />
            </div>
          </div>
        )}
      </div>
      <Button
        type="button"
        disabled={pending}
        className="rounded-full font-semibold"
        onClick={() =>
          runSave(async () => {
            const paidCents = tableDepositCentsFromInputs(pricingMode, priceEuro, aboveEuro, belowEuro);
            if (!stripeReady && paidCents > 0) {
              setError(STRIPE_REQUIRED_MESSAGE);
              onPaidSaveBlocked?.();
              return;
            }
            const price_cents =
              pricingMode === "group_tier" ? parseEuroInputToCents(belowEuro) : parseEuroInputToCents(priceEuro);
            const group_pricing =
              pricingMode === "group_tier"
                ? {
                    thresholdPeople: Number.parseInt(threshold, 10) || 10,
                    atOrAboveCents: parseEuroInputToCents(aboveEuro),
                    belowCents: parseEuroInputToCents(belowEuro),
                  }
                : null;
            await upsertFloorPlanTable({
              businessId,
              id: table.id,
              label: table.label,
              capacity,
              positionX: table.position_x,
              positionY: table.position_y,
              width: widthPx,
              height: heightPx,
              shape,
              fillColor: hexText.trim().length === 0 ? null : hexText.trim(),
              pricingMode,
              priceCents: price_cents,
              groupPricing: group_pricing,
            });
          })
        }
      >
        {pending ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden /> : null}
        Save changes
      </Button>
      <p className="text-[11px] text-[#94a3b8]">
        Square/circle footprints normalize to equal width/height on save. Use “Save layout positions” below the canvas after dragging.
      </p>
    </div>
  );
}

function SavedFloorTableRow({
  businessId,
  table,
  schedules,
  pending,
  run,
  stripeReady = false,
  onPaidSaveBlocked,
}: {
  businessId: string;
  table: FloorPlanTableRow;
  schedules: AppointmentWeekRow[];
  pending: boolean;
  run: (fn: () => Promise<void>) => void;
  stripeReady?: boolean;
  onPaidSaveBlocked?: () => void;
}) {
  const [labelDraft, setLabelDraft] = useState(table.label);
  const labelDirty = labelDraft.trim() !== table.label;

  useEffect(() => {
    setLabelDraft(table.label);
  }, [table.label]);

  function saveLabel() {
    const trimmed = labelDraft.trim();
    if (!trimmed) return;
    run(async () => {
      await renameFloorPlanTableLabel(businessId, table.id, trimmed);
    });
  }

  return (
    <li className="rounded-xl border border-[#f1eefc] px-3 py-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-[12rem] flex-1 flex-wrap items-end gap-2">
          <div className="min-w-[10rem] flex-1 space-y-1">
            <label htmlFor={`table-name-${table.id}`} className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">
              Table name
            </label>
            <input
              id={`table-name-${table.id}`}
              value={labelDraft}
              onChange={(e) => setLabelDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  saveLabel();
                }
              }}
              className="h-11 w-full rounded-xl border border-[#ebe7f7] bg-white px-3 text-[15px] font-semibold text-[#0f172a] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={pending || !labelDirty || !labelDraft.trim()}
            className="rounded-full font-semibold"
            onClick={() => saveLabel()}
          >
            Save name
          </Button>
        </div>
        <button
          type="button"
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-rose-700")}
          disabled={pending}
          onClick={() =>
            run(async () => {
              await deleteFloorPlanTable(businessId, table.id);
            })
          }
        >
          Remove
        </button>
      </div>
      <p className="mt-2 text-xs text-[#64748b]">
        {coerceFloorPlanShape(table.shape)} · cap {table.capacity} · {formatMoneyDisplay(table.price_cents)} ·{" "}
        {String(table.pricing_mode ?? "").replace(/_/g, " ")}
      </p>
      <FloorTableWeekHoursStrip businessId={businessId} table={table} venueSchedules={schedules} />
      <SavedFloorTableDetailForm
        businessId={businessId}
        table={table}
        stripeReady={stripeReady}
        onPaidSaveBlocked={onPaidSaveBlocked}
      />
    </li>
  );
}

function TablesPanel({
  businessId,
  schedules,
  tables,
  questions,
  stripeReady = false,
  onSaved,
}: {
  businessId: string;
  schedules: AppointmentWeekRow[];
  tables: FloorPlanTableRow[];
  questions: TableQuestionRow[];
  stripeReady?: boolean;
  onSaved?: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});

  useEffect(() => {
    setPositions(Object.fromEntries(tables.map((t) => [t.id, { x: t.position_x, y: t.position_y }])));
  }, [tables]);

  const [label, setLabel] = useState("Table 1");
  const [capacity, setCapacity] = useState(4);
  const [pricingMode, setPricingMode] = useState<"table" | "person" | "group_tier">("table");
  const [priceEuro, setPriceEuro] = useState("50");
  const [threshold, setThreshold] = useState("10");
  const [aboveEuro, setAboveEuro] = useState("100");
  const [belowEuro, setBelowEuro] = useState("50");
  const [qLabel, setQLabel] = useState("How many children?");
  const [addShape, setAddShape] = useState<FloorPlanTableShape>("rectangle");
  const [addFillHex, setAddFillHex] = useState("");
  const [addWidth, setAddWidth] = useState(120);
  const [addHeight, setAddHeight] = useState(80);
  const [error, setError] = useState<string | null>(null);
  const [stripePromptHighlighted, setStripePromptHighlighted] = useState(false);

  function blockPaidSaveWithoutStripe() {
    setStripePromptHighlighted(true);
    scrollToStripeConnectPrompt();
  }

  function run(fn: () => Promise<void>) {
    setError(null);
    startTransition(() => {
      void (async () => {
        try {
          await fn();
          onSaved?.();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not save.");
        }
      })();
    });
  }

  function saveLayout() {
    const updates = tables.map((t) => ({
      id: t.id,
      positionX: positions[t.id]?.x ?? t.position_x,
      positionY: positions[t.id]?.y ?? t.position_y,
    }));
    run(async () => {
      await saveFloorPlanLayout(businessId, updates);
    });
  }

  return (
    <div className="space-y-10">
      {error ? <p className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-2 text-sm text-rose-900">{error}</p> : null}
      <header>
        <h2 className="text-lg font-semibold text-[#0f172a]">Tables & layout</h2>
        <p className="mt-1 text-sm text-[#64748b]">
          Drag tables on the canvas to mirror your room. Rename any saved table below — the floor preview updates after you save. Add optional weekday windows under each listing to override venue appointment grids for guests on that specific table only.
        </p>
      </header>
      {!stripeReady ? (
        <StripeConnectRequiredCallout businessId={businessId} highlighted={stripePromptHighlighted} />
      ) : null}

      <div className="relative h-[340px] overflow-hidden rounded-2xl border border-[#ebe7f7] bg-[#f8fafc]">
        <p className="absolute left-3 top-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#94a3b8]">Floor preview</p>
        {tables.map((t) => {
          const tabShape = coerceFloorPlanShape(t.shape);
          const fill = normalizeFloorTableFillColor(t.fill_color ?? undefined);
          const dims = normalizeFloorTableDimensions(tabShape, t.width, t.height);
          const isCircle = tabShape === "circle";
          return (
            <motion.div
              key={t.id}
              drag
              dragMomentum={false}
              className={cn(
                "absolute cursor-grab border-2 border-[#c4b5fd] px-3 py-2 text-xs font-semibold text-[#312e81] shadow-md active:cursor-grabbing",
                isCircle ? "flex items-center justify-center text-center leading-tight" : "rounded-xl",
                fill ? "" : "bg-white/95",
              )}
              style={{
                width: dims.width,
                height: dims.height,
                left: positions[t.id]?.x ?? t.position_x,
                top: positions[t.id]?.y ?? t.position_y,
                borderRadius: isCircle ? "50%" : "0.75rem",
                backgroundColor: fill ? fill : undefined,
              }}
              onDragEnd={(_, info) => {
                setPositions((prev) => ({
                  ...prev,
                  [t.id]: {
                    x: (prev[t.id]?.x ?? t.position_x) + info.delta.x,
                    y: (prev[t.id]?.y ?? t.position_y) + info.delta.y,
                  },
                }));
              }}
            >
              <span className={isCircle ? "line-clamp-3" : ""}>
                {t.label}
                <span className="block text-[10px] font-normal text-[#64748b]">Cap {t.capacity}</span>
              </span>
            </motion.div>
          );
        })}
        {tables.length === 0 ? (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-[#94a3b8]">Add a table below to start arranging.</p>
        ) : null}
      </div>

      <Button type="button" variant="secondary" className="rounded-full font-semibold" disabled={pending || tables.length === 0} onClick={() => saveLayout()}>
        {pending ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden /> : null}
        Save layout positions
      </Button>

      <div className="grid gap-4 rounded-2xl border border-[#ede9fe] bg-[#fafbff]/90 p-5 md:grid-cols-6 md:items-end">
        <div className="space-y-2 md:col-span-2">
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">Table name</label>
          <input value={label} onChange={(e) => setLabel(e.target.value)} className="h-11 w-full rounded-xl border border-[#ebe7f7] px-3" />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">Capacity</label>
          <input type="number" min={1} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} className="h-11 w-full rounded-xl border border-[#ebe7f7] px-3" />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">Shape</label>
          <select value={addShape} onChange={(e) => setAddShape(e.target.value as FloorPlanTableShape)} className="h-11 w-full rounded-xl border border-[#ebe7f7] px-3">
            <option value="rectangle">Rectangle</option>
            <option value="square">Square</option>
            <option value="circle">Circle</option>
          </select>
        </div>
        <div className="space-y-2 md:col-span-2">
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">Fill colour</label>
          <div className="flex gap-2">
            <input
              type="color"
              aria-label="Pick fill colour"
              value={normalizeFloorTableFillColor(addFillHex) ?? "#EEF2FF"}
              onChange={(e) => setAddFillHex(normalizeFloorTableFillColor(e.target.value) ?? "")}
              className="h-11 w-14 cursor-pointer rounded-lg border border-[#ebe7f7] bg-white p-1"
            />
            <input
              value={addFillHex}
              onChange={(e) => setAddFillHex(e.target.value)}
              placeholder="#Hex or blank"
              className="h-11 min-w-[7rem] flex-1 rounded-xl border border-[#ebe7f7] px-3 font-mono text-sm"
            />
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">Width (px)</label>
          <input type="number" min={48} value={addWidth} onChange={(e) => setAddWidth(Number(e.target.value))} className="h-11 w-full rounded-xl border border-[#ebe7f7] px-3" />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">Height (px)</label>
          <input type="number" min={48} value={addHeight} onChange={(e) => setAddHeight(Number(e.target.value))} className="h-11 w-full rounded-xl border border-[#ebe7f7] px-3" />
        </div>
        <div className="space-y-2 md:col-span-2">
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">Pricing</label>
          <select value={pricingMode} onChange={(e) => setPricingMode(e.target.value as typeof pricingMode)} className="h-11 w-full rounded-xl border border-[#ebe7f7] px-3">
            <option value="table">Flat per table ({moneySymbol()})</option>
            <option value="person">Per person ({moneySymbol()})</option>
            <option value="group_tier">Tier by group size</option>
          </select>
        </div>
        {pricingMode !== "group_tier" ? (
          <div className="space-y-2 md:col-span-4">
            <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">Amount ({moneySymbol()})</label>
            <input
              type="text"
              inputMode="decimal"
              value={priceEuro}
              onChange={(e) => setPriceEuro(sanitizeEuroInput(e.target.value))}
              placeholder="10.50"
              className="h-11 w-full max-w-[200px] rounded-xl border border-[#ebe7f7] px-3"
            />
          </div>
        ) : (
          <div className="flex flex-wrap gap-3 md:col-span-6">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#64748b]">If ≥ guests</label>
              <input value={threshold} onChange={(e) => setThreshold(e.target.value)} className="h-11 w-24 rounded-xl border border-[#ebe7f7] px-3" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#64748b]">Charge {moneySymbol()}</label>
              <input
                type="text"
                inputMode="decimal"
                value={aboveEuro}
                onChange={(e) => setAboveEuro(sanitizeEuroInput(e.target.value))}
                placeholder="100"
                className="h-11 w-24 rounded-xl border border-[#ebe7f7] px-3"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#64748b]">Else {moneySymbol()}</label>
              <input
                type="text"
                inputMode="decimal"
                value={belowEuro}
                onChange={(e) => setBelowEuro(sanitizeEuroInput(e.target.value))}
                placeholder="50"
                className="h-11 w-24 rounded-xl border border-[#ebe7f7] px-3"
              />
            </div>
          </div>
        )}
        <div className="md:col-span-6">
          <Button
            type="button"
            disabled={pending || !label.trim()}
            className="rounded-full font-semibold shadow-md shadow-[#7c3aed]/20"
            onClick={() =>
              run(async () => {
                const paidCents = tableDepositCentsFromInputs(pricingMode, priceEuro, aboveEuro, belowEuro);
                if (!stripeReady && paidCents > 0) {
                  setError(STRIPE_REQUIRED_MESSAGE);
                  blockPaidSaveWithoutStripe();
                  return;
                }
                const price_cents =
                  pricingMode === "group_tier"
                    ? parseEuroInputToCents(belowEuro)
                    : parseEuroInputToCents(priceEuro);
                const group_pricing =
                  pricingMode === "group_tier"
                    ? {
                        thresholdPeople: Number.parseInt(threshold, 10) || 10,
                        atOrAboveCents: parseEuroInputToCents(aboveEuro),
                        belowCents: parseEuroInputToCents(belowEuro),
                      }
                    : null;
                await upsertFloorPlanTable({
                  businessId,
                  label,
                  capacity,
                  positionX: 40 + tables.length * 24,
                  positionY: 60 + tables.length * 12,
                  width: addWidth,
                  height: addHeight,
                  shape: addShape,
                  fillColor: addFillHex.trim().length ? addFillHex.trim() : null,
                  pricingMode,
                  priceCents: price_cents,
                  groupPricing: group_pricing,
                });
              })
            }
          >
            Add table
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-[#64748b]">Saved tables</h3>
        <ul className="space-y-4 text-sm">
          {tables.map((t) => (
            <SavedFloorTableRow
              key={t.id}
              businessId={businessId}
              table={t}
              schedules={schedules}
              pending={pending}
              run={run}
              stripeReady={stripeReady}
              onPaidSaveBlocked={blockPaidSaveWithoutStripe}
            />
          ))}
          {tables.length === 0 ? <li className="text-[#94a3b8]">No tables saved.</li> : null}
        </ul>
      </div>

      <div className="space-y-4 rounded-2xl border border-[#f1eefc] bg-white p-5">
        <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-[#64748b]">Custom booking questions</h3>
        <p className="text-sm text-[#64748b]">Shown on hosted table bookings — birthdays, allergies, kid counts…</p>
        <div className="flex flex-wrap gap-2">
          <input value={qLabel} onChange={(e) => setQLabel(e.target.value)} className="h-11 flex-1 rounded-xl border border-[#ebe7f7] px-3" />
          <Button
            type="button"
            className="rounded-full font-semibold"
            disabled={pending || !qLabel.trim()}
            onClick={() =>
              run(async () => {
                await upsertTableBookingQuestion({
                  businessId,
                  questionLabel: qLabel,
                  required: false,
                  sortOrder: questions.length,
                });
                setQLabel("");
              })
            }
          >
            Add question
          </Button>
        </div>
        <ul className="space-y-2 text-sm">
          {questions.map((q) => (
            <li key={q.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#fafbff] px-3 py-2">
              <span>{q.question_label}</span>
              <button
                type="button"
                className="text-xs font-semibold text-rose-700"
                disabled={pending}
                onClick={() =>
                  run(async () => {
                    await deleteTableBookingQuestion(businessId, q.id);
                  })
                }
              >
                Remove
              </button>
            </li>
          ))}
          {questions.length === 0 ? <li className="text-[#94a3b8]">No extra prompts yet.</li> : null}
        </ul>
      </div>
    </div>
  );
}
