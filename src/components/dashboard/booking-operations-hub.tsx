"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { motion } from "framer-motion";
import {
  CalendarOff,
  Loader2,
  Mail,
  MessageSquare,
  Mic2,
  Phone,
  Plus,
  Trash2,
} from "lucide-react";

import { cancelVenueCalendarBooking } from "@/app/dashboard/bookings/calendar-actions";
import {
  cancelBusinessEvent,
  deleteAppointmentSlotException,
  deleteAppointmentWeekdayHour,
  deleteFloorPlanTable,
  deleteTableBookingQuestion,
  restoreBusinessEvent,
  saveFloorPlanLayout,
  softDeleteBusinessEvent,
  uncancelBusinessEvent,
  upsertAppointmentWeekdayHour,
  upsertBusinessEvent,
  upsertFloorPlanTable,
  upsertTableBookingQuestion,
} from "@/app/dashboard/bookings/inventory-actions";
import { AppointmentExceptionGrid } from "@/components/dashboard/appointment-exception-grid";
import { BookingInbox, type BookingRequestRow, telBookingHref } from "@/components/dashboard/booking-inbox";
import { EventSeriesCalendarSheet, type SheetBusinessEventRow } from "@/components/dashboard/event-series-calendar-sheet";
import { FloorTableWeekHoursStrip } from "@/components/dashboard/floor-table-week-hours-strip";
import { Button, buttonVariants } from "@/components/ui/button";
import { BOOKING_GUEST_MODE_LABELS, isBookingGuestMode } from "@/lib/booking-guest-modes";
import { parseRecurrenceExtras } from "@/lib/business-event-occurrences";
import type { AppointmentWeekRow, SlotExceptionRow } from "@/lib/booking-inventory-types";
export type { AppointmentWeekRow, SlotExceptionRow } from "@/lib/booking-inventory-types";
import { cn } from "@/lib/utils";
import {
  coerceFloorPlanShape,
  normalizeFloorTableDimensions,
  normalizeFloorTableFillColor,
  type FloorPlanTableShape,
} from "@/lib/floor-plan-visuals";

import type { BookingGuestsSub, BookingHubPrimary, BookingOfferingsSub } from "@/lib/bookings-hub-query";

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
  created_at: string;
};

const WEEKDAY_LABEL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatStoredRecurrence(rec: unknown): string {
  if (rec == null) return "";
  if (typeof rec !== "object" || Array.isArray(rec)) return "";
  const o = rec as Record<string, unknown>;
  const type = typeof o.type === "string" ? o.type : "once";
  const { skipped } = parseRecurrenceExtras(rec);
  const skipFrag = skipped.size ? ` (${skipped.size} skipped)` : "";
  if (type === "once") return `One-off occurrence${skipFrag}`;
  if (type === "daily") return `Repeats daily${skipFrag}`;
  if (type === "weekly") {
    const weekdays = Array.isArray(o.weekdays) ? (o.weekdays as unknown[]) : [];
    const names = weekdays
      .filter((x): x is number => typeof x === "number" && Number.isFinite(x))
      .map((n) => WEEKDAY_LABEL[Math.round(n)] ?? `Day ${n}`)
      .filter(Boolean);
    if (!names.length) return `Weekly (no weekdays picked)${skipFrag}`;
    return `Every ${names.join(", ")}${skipFrag}`;
  }
  const label = type.length ? type.charAt(0).toUpperCase() + type.slice(1) : "Custom";
  return `${label}${skipFrag}`;
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
};

export function BookingOperationsHub({
  businessId,
  businessName,
  venueTimeZone,
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
}: BookingOperationsHubProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [primary, setPrimary] = useState<BookingHubPrimary>(initialPrimary ?? "guests");
  const [guestsSub, setGuestsSub] = useState<BookingGuestsSub>(initialGuestsSub ?? "inbox");
  const [offeringsSub, setOfferingsSub] = useState<BookingOfferingsSub>(initialOfferingsSub ?? "appointments");

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
    if (offeringsSub === "events") {
      return {
        title: "Hosted events",
        subtitle: "Add or edit show listings — purple calendar dates on your guest link come from here.",
      };
    }
    if (offeringsSub === "tables") {
      return {
        title: "Tables & floor plan",
        subtitle: "Drag tables on the canvas, set capacity and colours, save layout when done.",
      };
    }
    return {
      title: "Appointment hours",
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
        <h2 className="text-xl font-semibold tracking-tight text-[#0f172a]">{workspaceHeading.title}</h2>
        <p className="mt-1 max-w-3xl text-[14px] leading-relaxed text-[#64748b]">{workspaceHeading.subtitle}</p>
      </div>

      <div className="px-4 py-7 md:px-6 md:py-10">
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
            businessName={businessName}
            inventoryLinks={{
              tables: tables.map((t) => ({ id: t.id, label: t.label })),
              events: events
                .filter((ev) => !ev.cancelled_at && !ev.deleted_at)
                .map((ev) => ({ id: ev.id, title: ev.title })),
            }}
            bookingRequestHighlight={bookingRequestHighlight}
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
  businessName: string;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 rounded-full border border-[#ebe7f7] bg-[#fafbff] p-1">
        <button
          type="button"
          onClick={() => props.onGuestsSub("inbox")}
          className={cn(
            "rounded-full px-5 py-2.5 text-[14px] font-semibold transition-colors",
            props.guestsSub === "inbox" ? "bg-white text-[#5b21b6] shadow-sm" : "text-[#64748b] hover:text-[#0f172a]",
          )}
        >
          Incoming
        </button>
        <button
          type="button"
          onClick={() => props.onGuestsSub("confirmed")}
          className={cn(
            "rounded-full px-5 py-2.5 text-[14px] font-semibold transition-colors",
            props.guestsSub === "confirmed" ? "bg-white text-[#5b21b6] shadow-sm" : "text-[#64748b] hover:text-[#0f172a]",
          )}
        >
          Confirmed
        </button>
      </div>

      {props.guestsSub === "inbox" ? (
        <BookingInbox
          requests={props.requests}
          bizNameById={props.bizNameById}
          inventoryLinks={props.inventoryLinks}
          highlightBookingRequestId={props.bookingRequestHighlight ?? undefined}
        />
      ) : (
        <ConfirmedBookingsPanelWithContacts businessName={props.businessName} bookings={props.confirmedBookings} />
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
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 rounded-full border border-[#ebe7f7] bg-[#fafbff] p-1">
        {(
          [
            { key: "appointments" as const, label: "Appointments" },
            { key: "events" as const, label: "Events" },
            { key: "tables" as const, label: "Tables" },
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

      {props.offeringsSub === "appointments" ? (
        <AppointmentsPanel
          businessId={props.businessId}
          schedules={props.schedules}
          exceptions={props.exceptions}
          venueTimeZone={props.venueTimeZone}
        />
      ) : null}

      {props.offeringsSub === "events" ? (
        <EventsPanel businessId={props.businessId} events={props.events} venueTimeZone={props.venueTimeZone} />
      ) : null}

      {props.offeringsSub === "tables" ? (
        <TablesPanel businessId={props.businessId} schedules={props.schedules} tables={props.tables} questions={props.questions} />
      ) : null}
    </div>
  );
}

function confirmedKindLabel(kind: string | null | undefined) {
  if (!kind?.trim()) return "—";
  return isBookingGuestMode(kind) ? BOOKING_GUEST_MODE_LABELS[kind] : kind;
}

function ConfirmedBookingsPanelWithContacts({
  businessName,
  bookings,
}: {
  businessName: string;
  bookings: VenueCalendarBookingRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showCancelled, setShowCancelled] = useState(false);

  const rows = useMemo(() => {
    const base = showCancelled ? bookings : bookings.filter((b) => b.status !== "cancelled");
    return [...base].sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  }, [bookings, showCancelled]);

  function runCancel(id: string) {
    startTransition(() => {
      void (async () => {
        try {
          await cancelVenueCalendarBooking(id);
          router.refresh();
        } catch (e) {
          alert(e instanceof Error ? e.message : "Could not cancel.");
        }
      })();
    });
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[#0f172a]">Scheduled guests</h2>
          <p className="mt-1 text-sm text-[#64748b]">
            Everyone with a locked slot under <span className="font-semibold text-[#0f172a]">{businessName}</span>. Call, text, or
            email from here, open the Solvio message thread when it started as a request, and prep AI-assisted dial-outs inside{" "}
            <span className="font-semibold text-[#0f172a]">Calls</span>.
          </p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-[#475569]">
          <input
            type="checkbox"
            checked={showCancelled}
            onChange={(e) => setShowCancelled(e.target.checked)}
            className="h-4 w-4 rounded border-[#cbd5e1] text-[#7c3aed]"
          />
          Show cancelled
        </label>
      </header>

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
                      <Link
                        href="/dashboard/calls"
                        className={cn(
                          buttonVariants({ variant: "ghost", size: "sm" }),
                          "h-8 justify-start px-2 text-[11px] text-[#5b21b6]",
                        )}
                      >
                        <Mic2 className="mr-1 h-3.5 w-3.5" aria-hidden /> AI Calls workspace
                      </Link>
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
                      <button
                        type="button"
                        disabled={pending}
                        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "font-semibold text-rose-700")}
                        onClick={() => runCancel(row.id)}
                      >
                        Cancel slot
                      </button>
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

function AppointmentsPanel({
  businessId,
  schedules,
  exceptions,
  venueTimeZone,
}: {
  businessId: string;
  schedules: AppointmentWeekRow[];
  exceptions: SlotExceptionRow[];
  venueTimeZone: string;
}) {
  const [pending, startTransition] = useTransition();
  const [weekday, setWeekday] = useState(1);
  const [openTime, setOpenTime] = useState("09:00");
  const [closeTime, setCloseTime] = useState("17:00");
  const [slotMin, setSlotMin] = useState(30);

  const used = useMemo(() => new Set(schedules.map((s) => s.weekday)), [schedules]);

  function run(fn: () => Promise<void>) {
    startTransition(() => {
      void (async () => {
        try {
          await fn();
        } catch (e) {
          alert(e instanceof Error ? e.message : "Could not save.");
        }
      })();
    });
  }

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-lg font-semibold text-[#0f172a]">Weekly appointment windows</h2>
        <p className="mt-1 text-sm text-[#64748b]">
          Slot length feeds the squares below — blocked slots hide from your public booking page; cancelled keeps a paper trail for callers.
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

      <AppointmentExceptionGrid
        businessId={businessId}
        schedules={schedules}
        exceptions={exceptions}
        venueTimeZone={venueTimeZone}
      />

      <div className="space-y-3 rounded-2xl border border-[#f1eefc] bg-white p-5">
        <div className="flex flex-wrap items-center gap-2">
          <CalendarOff className="h-5 w-5 text-[#7c3aed]" aria-hidden />
          <h3 className="text-base font-semibold text-[#0f172a]">Stored exceptions</h3>
        </div>
        <p className="text-sm text-[#64748b]">
          Deleting clears the rule instantly. Saving new shading for a calendar date replaces rows for <span className="font-semibold">that date only</span>.
        </p>
        <ul className="space-y-2 text-sm">
          {exceptions.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#f1eefc] px-3 py-2">
              <span className="text-[#0f172a]">
                {x.exception_date}
                {x.slot_start ? ` · ${clipTime(x.slot_start)}` : " · whole day"} — <span className="font-semibold">{x.kind}</span>
                {x.reason ? <span className="text-[#64748b]"> — {x.reason}</span> : null}
              </span>
              <button
                type="button"
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-rose-700")}
                disabled={pending}
                onClick={() =>
                  run(async () => {
                    await deleteAppointmentSlotException(businessId, x.id);
                  })
                }
              >
                Delete
              </button>
            </li>
          ))}
          {exceptions.length === 0 ? <li className="text-[#94a3b8]">Nothing saved yet.</li> : null}
        </ul>
      </div>
    </div>
  );
}

function EventsPanel({
  businessId,
  events,
  venueTimeZone,
}: {
  businessId: string;
  events: BusinessEventRow[];
  venueTimeZone: string;
}) {
  const [pending, startTransition] = useTransition();
  const [manageCalendarFor, setManageCalendarFor] = useState<BusinessEventRow | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [starts, setStarts] = useState("");
  const [ends, setEnds] = useState("");
  const [recPreset, setRecPreset] = useState<"once" | "daily" | "weekly">("once");
  const [weekBits, setWeekBits] = useState<number[]>([1, 3]);

  const visible = events.filter((e) => !e.deleted_at);

  function recurrenceJson() {
    if (recPreset === "once") return { type: "once" };
    if (recPreset === "daily") return { type: "daily" };
    return { type: "weekly", weekdays: weekBits };
  }

  function run(fn: () => Promise<void>) {
    startTransition(() => {
      void (async () => {
        try {
          await fn();
        } catch (e) {
          alert(e instanceof Error ? e.message : "Could not save.");
        }
      })();
    });
  }

  function toggleWeekday(d: number) {
    setWeekBits((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)));
  }

  return (
    <div className="space-y-8">
      <EventSeriesCalendarSheet
        event={manageCalendarFor as SheetBusinessEventRow | null}
        businessId={businessId}
        venueTimeZone={venueTimeZone}
        onClose={() => setManageCalendarFor(null)}
      />
      <header>
        <h2 className="text-lg font-semibold text-[#0f172a]">Events & series</h2>
        <p className="mt-1 text-sm text-[#64748b]">
          Cancellation keeps history for scripts (“sorry, Thursday is off”). Delete removes it from dashboards (recoverable via restore later).
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
                await upsertBusinessEvent({
                  businessId,
                  title,
                  description,
                  startsAt: new Date(starts).toISOString(),
                  endsAt: new Date(ends).toISOString(),
                  recurrence: recurrenceJson(),
                });
                setTitle("");
                setDescription("");
                setStarts("");
                setEnds("");
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

function SavedFloorTableDetailForm({ businessId, table }: { businessId: string; table: FloorPlanTableRow }) {
  const snapshotKey = `${table.id}|${table.label}|${table.capacity}|${coerceFloorPlanShape(table.shape)}|${normalizeFloorTableFillColor(table.fill_color) ?? ""}|${Math.round(table.width)}|${Math.round(table.height)}|${table.pricing_mode}|${table.price_cents}|${JSON.stringify(table.group_pricing ?? null)}`;

  const [pending, startTransition] = useTransition();
  const [label, setLabel] = useState(table.label);
  const [capacity, setCapacity] = useState(table.capacity);
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
  const [priceEuro, setPriceEuro] = useState((table.price_cents / 100).toFixed(2));
  const teInit = tierEuroDefaults(table);
  const [threshold, setThreshold] = useState(teInit.threshold);
  const [aboveEuro, setAboveEuro] = useState(teInit.aboveEuro);
  const [belowEuro, setBelowEuro] = useState(teInit.belowEuro);

  useEffect(() => {
    setLabel(table.label);
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
    setPriceEuro((table.price_cents / 100).toFixed(2));
    const te = tierEuroDefaults(table);
    setThreshold(te.threshold);
    setAboveEuro(te.aboveEuro);
    setBelowEuro(te.belowEuro);
  }, [snapshotKey, table]);

  function euroToCentsScratch(s: string) {
    const n = Number.parseFloat(s.replace(",", "."));
    if (Number.isNaN(n)) return 0;
    return Math.round(n * 100);
  }

  function runSave(fn: () => Promise<void>) {
    startTransition(() => {
      void (async () => {
        try {
          await fn();
        } catch (e) {
          alert(e instanceof Error ? e.message : "Could not save.");
        }
      })();
    });
  }

  const pickerValue = normalizeFloorTableFillColor(hexText) ?? "#EEF2FF";

  return (
    <div className="mt-4 space-y-4 rounded-xl border border-dashed border-[#dcd6fb] bg-[#fcfbff]/80 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">Edit table details</p>
      <div className="grid gap-3 md:grid-cols-6 md:items-end">
        <div className="space-y-2 md:col-span-2">
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">Name</label>
          <input value={label} onChange={(e) => setLabel(e.target.value)} className="h-11 w-full rounded-xl border border-[#ebe7f7] px-3" />
        </div>
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
            <option value="table">Flat per table (€)</option>
            <option value="person">Per person (€)</option>
            <option value="group_tier">Tier by group size</option>
          </select>
        </div>
        {pricingMode !== "group_tier" ? (
          <div className="space-y-2 md:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">Amount (€)</label>
            <input value={priceEuro} onChange={(e) => setPriceEuro(e.target.value)} className="h-11 w-full rounded-xl border border-[#ebe7f7] px-3" />
          </div>
        ) : (
          <div className="flex flex-wrap gap-3 md:col-span-6">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#64748b]">If ≥ guests</label>
              <input value={threshold} onChange={(e) => setThreshold(e.target.value)} className="h-11 w-24 rounded-xl border border-[#ebe7f7] px-3" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#64748b]">Charge €</label>
              <input value={aboveEuro} onChange={(e) => setAboveEuro(e.target.value)} className="h-11 w-24 rounded-xl border border-[#ebe7f7] px-3" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#64748b]">Else €</label>
              <input value={belowEuro} onChange={(e) => setBelowEuro(e.target.value)} className="h-11 w-24 rounded-xl border border-[#ebe7f7] px-3" />
            </div>
          </div>
        )}
      </div>
      <Button
        type="button"
        disabled={pending || !label.trim()}
        className="rounded-full font-semibold"
        onClick={() =>
          runSave(async () => {
            const trimmed = label.trim();
            const price_cents =
              pricingMode === "group_tier" ? euroToCentsScratch(belowEuro) : euroToCentsScratch(priceEuro);
            const group_pricing =
              pricingMode === "group_tier"
                ? {
                    thresholdPeople: Number.parseInt(threshold, 10) || 10,
                    atOrAboveCents: euroToCentsScratch(aboveEuro),
                    belowCents: euroToCentsScratch(belowEuro),
                  }
                : null;
            await upsertFloorPlanTable({
              businessId,
              id: table.id,
              label: trimmed,
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

function TablesPanel({
  businessId,
  schedules,
  tables,
  questions,
}: {
  businessId: string;
  schedules: AppointmentWeekRow[];
  tables: FloorPlanTableRow[];
  questions: TableQuestionRow[];
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

  function euroToCents(s: string) {
    const n = Number.parseFloat(s.replace(",", "."));
    if (Number.isNaN(n)) return 0;
    return Math.round(n * 100);
  }

  function run(fn: () => Promise<void>) {
    startTransition(() => {
      void (async () => {
        try {
          await fn();
        } catch (e) {
          alert(e instanceof Error ? e.message : "Could not save.");
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
      <header>
        <h2 className="text-lg font-semibold text-[#0f172a]">Tables & layout</h2>
        <p className="mt-1 text-sm text-[#64748b]">
          Drag tables on the canvas to mirror your room. Add optional weekday windows under each listing to override venue appointment grids for guests on that specific table only.
        </p>
      </header>

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
            <option value="table">Flat per table (€)</option>
            <option value="person">Per person (€)</option>
            <option value="group_tier">Tier by group size</option>
          </select>
        </div>
        {pricingMode !== "group_tier" ? (
          <div className="space-y-2 md:col-span-4">
            <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">Amount (€)</label>
            <input value={priceEuro} onChange={(e) => setPriceEuro(e.target.value)} className="h-11 w-full max-w-[200px] rounded-xl border border-[#ebe7f7] px-3" />
          </div>
        ) : (
          <div className="flex flex-wrap gap-3 md:col-span-6">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#64748b]">If ≥ guests</label>
              <input value={threshold} onChange={(e) => setThreshold(e.target.value)} className="h-11 w-24 rounded-xl border border-[#ebe7f7] px-3" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#64748b]">Charge €</label>
              <input value={aboveEuro} onChange={(e) => setAboveEuro(e.target.value)} className="h-11 w-24 rounded-xl border border-[#ebe7f7] px-3" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#64748b]">Else €</label>
              <input value={belowEuro} onChange={(e) => setBelowEuro(e.target.value)} className="h-11 w-24 rounded-xl border border-[#ebe7f7] px-3" />
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
                const price_cents =
                  pricingMode === "group_tier"
                    ? euroToCents(belowEuro)
                    : euroToCents(priceEuro);
                const group_pricing =
                  pricingMode === "group_tier"
                    ? {
                        thresholdPeople: Number.parseInt(threshold, 10) || 10,
                        atOrAboveCents: euroToCents(aboveEuro),
                        belowCents: euroToCents(belowEuro),
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
            <li key={t.id} className="rounded-xl border border-[#f1eefc] px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[#0f172a]">
                  {t.label} · {coerceFloorPlanShape(t.shape)} · cap {t.capacity} · {(t.price_cents / 100).toFixed(2)} € ·{" "}
                  {String(t.pricing_mode ?? "").replace(/_/g, " ")}
                </span>
                <button
                  type="button"
                  className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-rose-700")}
                  disabled={pending}
                  onClick={() =>
                    run(async () => {
                      await deleteFloorPlanTable(businessId, t.id);
                    })
                  }
                >
                  Remove
                </button>
              </div>
              <FloorTableWeekHoursStrip businessId={businessId} table={t} venueSchedules={schedules} />
              <SavedFloorTableDetailForm businessId={businessId} table={t} />
            </li>
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
