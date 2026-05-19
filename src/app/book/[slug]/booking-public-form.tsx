"use client";

import { useActionState, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { CalendarCheck, Loader2, MapPin, Mic2, PartyPopper, Sparkles, UtensilsCrossed } from "lucide-react";

import { submitBookingRequestAction, type SubmitBookingState } from "./actions";
import {
  type BookingGuestMode,
} from "@/lib/booking-guest-modes";
import {
  BOOKING_PUBLIC_WEEKDAY_SHORT,
  type BookingPublicContextPayload,
  formatPublicTablePriceEUR,
  type PublicAppointmentHour,
  type PublicBusinessEvent,
  type PublicFloorTable,
} from "@/lib/booking-public-context";
import { coerceFloorPlanShape, normalizeFloorTableDimensions, normalizeFloorTableFillColor } from "@/lib/floor-plan-visuals";
import type { ExpandedOccurrence } from "@/lib/business-event-occurrences";
import { expandHostedEventOccurrences, formatHostedOccurrencePreferredSummary } from "@/lib/booking-hosted-submit";
import {
  datesWithUpcomingHostedOccurrences,
  effectiveBarsForFloorTable,
  isWeekdayInsideTableBookingWindows,
  tableBlockedByHostedShowMessage,
} from "@/lib/booking-table-rules";
import { EventOccurrenceMonthCalendar } from "./event-occurrence-calendar";
import {
  type AppointmentSlotChoice,
  buildAppointmentSlotChoices,
  dowSundayZeroInBusinessTZ,
} from "@/lib/booking-appointment-slots";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const initialState: SubmitBookingState | null = null;

function hostedEventPickKey(evt: PublicBusinessEvent): string {
  if (evt.id) return `id:${evt.id}`;
  return `legacy:${evt.starts_at}:${evt.title}`;
}

const FLOW_KIND_HINT: Record<string, string> = {
  restaurant_tables: "Pick a date and table — or switch to Events for hosted show nights.",
  hosted_events: "Browse upcoming hosted events and pick the date that works for you.",
  salon_appointments: "Choose a date and time slot from the venue calendar.",
  walk_in_waitlist: "Tell us when you plan to arrive and how many are in your party.",
  mixed: "Start by choosing how you want to book below.",
};

const MODE_PICKER: {
  mode: BookingGuestMode;
  label: string;
  blurb: string;
  Icon: typeof PartyPopper;
}[] = [
  { mode: "event", label: "Events", blurb: "Hosted shows — pick the act, then a purple calendar date", Icon: PartyPopper },
  { mode: "table", label: "Tables", blurb: "Reserve seating for a regular visit", Icon: UtensilsCrossed },
  { mode: "appointment", label: "Appointments", blurb: "Timed slots from the weekly schedule", Icon: Mic2 },
  { mode: "walk_in", label: "Walk-in", blurb: "Join the waitlist or ask about availability", Icon: Sparkles },
];

function FormSection({
  step,
  title,
  children,
  className,
}: {
  step: number;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-3 rounded-2xl border border-[#ebe7f7] bg-white px-4 py-4 md:px-5 md:py-5", className)}>
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#ede9fe] text-sm font-bold text-[#5b21b6]">
          {step}
        </span>
        <h2 className="text-[15px] font-semibold text-[#0f172a]">{title}</h2>
      </div>
      {children}
    </section>
  );
}

type BookingPublicFormProps = {
  slug: string;
  context: BookingPublicContextPayload;
  guestModes: BookingGuestMode[];
};

function TableFloorPreview({ tables }: { tables: PublicFloorTable[] }) {
  if (!tables.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const t of tables) {
    minX = Math.min(minX, t.position_x);
    minY = Math.min(minY, t.position_y);
    maxX = Math.max(maxX, t.position_x + t.width);
    maxY = Math.max(maxY, t.position_y + t.height);
  }
  const pad = 24;
  minX -= pad;
  minY -= pad;
  maxX += pad;
  maxY += pad;
  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);

  return (
    <div
      className="relative mt-4 aspect-[16/10] w-full overflow-hidden rounded-2xl border border-[#ebe7f7] bg-[#f8fafc]"
      aria-hidden
    >
      <div className="absolute inset-x-3 top-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">
        <MapPin className="h-3.5 w-3.5" />
        Layout preview
      </div>
      {tables.map((t) => {
        const sh = coerceFloorPlanShape(t.shape);
        const fill = normalizeFloorTableFillColor(t.fill_color ?? undefined);
        const dims = normalizeFloorTableDimensions(sh, t.width, t.height);
        const isCircle = sh === "circle";
        const left = ((t.position_x - minX) / w) * 100;
        const top = ((t.position_y - minY) / h) * 100;
        const pw = (dims.width / w) * 100;
        const ph = (dims.height / h) * 100;
        return (
          <div
            key={t.id ?? `${t.label}-${t.position_x}-${t.position_y}`}
            className={cn(
              "absolute flex items-center justify-center border border-[#c4b5fd]/70 px-1 text-center text-[10px] font-semibold leading-tight shadow-sm shadow-[#ede9fe]/60",
              isCircle ? "" : "rounded-xl",
              fill ? "text-[#0f172a]" : "bg-white/95 text-[#5b21b6]",
            )}
            style={{
              left: `${left}%`,
              top: `${top}%`,
              width: `${pw}%`,
              height: `${ph}%`,
              borderRadius: isCircle ? "50%" : undefined,
              backgroundColor: fill ? fill : undefined,
            }}
          >
            <span className={cn(isCircle ? "line-clamp-2" : "", "leading-tight")}>{t.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export function BookingPublicForm({ slug, context, guestModes }: BookingPublicFormProps) {
  const bound = submitBookingRequestAction.bind(null, slug);
  const [state, formAction, pending] = useActionState(bound, initialState);

  const businessName = context.business_name;
  const guestMessage = context.guest_message;
  const bookingFlowKind = context.booking_flow_kind;

  const primaryKind = guestModes.length === 1 ? guestModes[0] : null;
  const [kind, setKind] = useState<BookingGuestMode | "">(() => primaryKind ?? (guestModes[0] ?? ""));
  const [eventTitle, setEventTitle] = useState("");
  const [requestedDate, setRequestedDate] = useState("");
  const [pickedHostedEventKey, setPickedHostedEventKey] = useState("");
  const [hostedOccurrenceSel, setHostedOccurrenceSel] = useState<ExpandedOccurrence | null>(null);
  const [preferredTable, setPreferredTable] = useState("");

  const guestModesKey = guestModes.join(",");

  useEffect(() => {
    if (primaryKind) setKind(primaryKind);
    else if (guestModes.length > 0) setKind(guestModes[0] ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- guestModesKey tracks mode set from server context
  }, [primaryKind, guestModesKey]);

  const effectiveKind = primaryKind ?? kind;

  const venueTz = context.venue_time_zone?.trim() || "UTC";
  const structuredAppointmentBooking =
    effectiveKind === "appointment" && guestModes.includes("appointment") && context.appointment_hours.length > 0;

  const appointmentSchedule = useMemo((): {
    hourRow: PublicAppointmentHour | undefined;
    slots: AppointmentSlotChoice[];
  } => {
    if (!structuredAppointmentBooking || !requestedDate.trim()) {
      return { hourRow: undefined, slots: [] };
    }
    const dowCal = dowSundayZeroInBusinessTZ(requestedDate, venueTz);
    const hourRow = context.appointment_hours.find((h) => h.weekday === dowCal);
    const slots = buildAppointmentSlotChoices(requestedDate.trim(), hourRow, venueTz, context.appointment_slot_exceptions);
    return { hourRow, slots };
  }, [context.appointment_hours, context.appointment_slot_exceptions, requestedDate, structuredAppointmentBooking, venueTz]);

  const appointmentSlotsList = appointmentSchedule.slots;

  const sortedQuestions = useMemo(
    () => [...context.table_questions].sort((a, b) => a.sort_order - b.sort_order || a.question_label.localeCompare(b.question_label)),
    [context.table_questions],
  );

  const showTablesPanel = effectiveKind === "table" && context.tables.length > 0;
  const showTableQuestions = effectiveKind === "table" && sortedQuestions.length > 0;
  const upcomingActiveEvents = context.events.filter((e) => !e.cancelled);

  const pickedHostedEvent = useMemo(() => {
    const key = pickedHostedEventKey.trim();
    if (!key.length) return null;
    return upcomingActiveEvents.find((e) => hostedEventPickKey(e) === key) ?? null;
  }, [pickedHostedEventKey, upcomingActiveEvents]);

  const hostedCalendarOccurrences = useMemo(() => {
    if (!pickedHostedEvent) return [];
    return expandHostedEventOccurrences(pickedHostedEvent, venueTz);
  }, [pickedHostedEvent, venueTz]);

  const hostedBookableOccurrences = useMemo(
    () => hostedCalendarOccurrences.filter((o) => !o.skipped),
    [hostedCalendarOccurrences],
  );

  const hostedEventSubmissionBlocked =
    effectiveKind === "event" &&
    guestModes.includes("event") &&
    upcomingActiveEvents.length > 0 &&
    !pickedHostedEventKey.trim().length;

  const hostedCalendarMode =
    effectiveKind === "event" && guestModes.includes("event") && Boolean(pickedHostedEvent) && hostedCalendarOccurrences.length > 0;

  const hostedCalendarSelectionBlocked =
    hostedCalendarMode && !(hostedOccurrenceSel?.starts_at && hostedOccurrenceSel.starts_at.trim().length > 0);

  const hostedListingNoUpcomingShows =
    effectiveKind === "event" && guestModes.includes("event") && Boolean(pickedHostedEvent) && hostedCalendarOccurrences.length === 0;

  const isEventBooking = effectiveKind === "event" && guestModes.includes("event");
  /** Never show native `<input type="date">` while a hosted listing is tied to the enquiry — use the violet calendar or a strict YYYY-MM-DD fallback instead. */
  const suppressGenericPreferredDateGuestsRow = isEventBooking && pickedHostedEvent != null;

  useEffect(() => {
    setHostedOccurrenceSel(null);
  }, [pickedHostedEventKey]);

  useEffect(() => {
    if (effectiveKind !== "event") {
      setPickedHostedEventKey("");
      setHostedOccurrenceSel(null);
    }
  }, [effectiveKind]);

  useEffect(() => {
    if (effectiveKind !== "table") setPreferredTable("");
  }, [effectiveKind]);

  const blockedHostedTableNights = useMemo(
    () => datesWithUpcomingHostedOccurrences(context.events, venueTz),
    [context.events, venueTz],
  );

  const eventsTabAvailable = guestModes.includes("event");

  const tableBlockedForHostedShow = useMemo(() => {
    if (!(effectiveKind === "table" && guestModes.includes("table"))) return false;
    const d = requestedDate.trim();
    if (!d) return false;
    return blockedHostedTableNights.has(d);
  }, [blockedHostedTableNights, effectiveKind, guestModes, requestedDate]);

  const tableHostedShowBlockMessage = useMemo(() => {
    const d = requestedDate.trim();
    if (!tableBlockedForHostedShow || !d) return null;
    return tableBlockedByHostedShowMessage({
      dateYmd: d,
      events: context.events,
      venueTz,
      eventsTabAvailable,
    });
  }, [context.events, eventsTabAvailable, requestedDate, tableBlockedForHostedShow, venueTz]);

  const bookingPreferredDateHardRequired =
    structuredAppointmentBooking || (effectiveKind === "table" && guestModes.includes("table"));

  const tableSelectionHintMessage = useMemo(() => {
    if (!(effectiveKind === "table" && guestModes.includes("table"))) return null;
    const d = requestedDate.trim();
    if (!d) return null;

    if (blockedHostedTableNights.has(d)) {
      return tableBlockedByHostedShowMessage({
        dateYmd: d,
        events: context.events,
        venueTz,
        eventsTabAvailable,
      });
    }

    const bars = effectiveBarsForFloorTable(preferredTable, context);
    const inside = isWeekdayInsideTableBookingWindows(d, venueTz, bars);
    if (inside === false) {
      const dow = BOOKING_PUBLIC_WEEKDAY_SHORT[dowSundayZeroInBusinessTZ(d, venueTz)];
      const labelTail = preferredTable.trim() ? ` for ${preferredTable.trim()}` : "";
      return `${dow}${labelTail} isn’t accepting table enquiries — pick another evening or widen custom hours inside Solvio bookings.`;
    }
    return null;
  }, [
    blockedHostedTableNights,
    context,
    effectiveKind,
    guestModes,
    eventsTabAvailable,
    preferredTable,
    requestedDate,
    venueTz,
  ]);

  useEffect(() => {
    if (state?.ok && "depositCheckoutUrl" in state && state.depositCheckoutUrl) {
      window.location.assign(state.depositCheckoutUrl);
    }
  }, [state]);

  const flowHint =
    (bookingFlowKind && FLOW_KIND_HINT[bookingFlowKind]) ||
    "Choose the booking type that fits — your details go straight to the team.";

  if (state?.ok && "depositCheckoutUrl" in state && state.depositCheckoutUrl) {
    return (
      <div className="mx-auto max-w-lg rounded-[28px] border border-[#ebe7f7] bg-white p-8 text-center md:p-10">
        <Loader2 className="mx-auto h-10 w-10 animate-spin text-[#7c3aed]" aria-hidden />
        <h2 className="mt-6 text-xl font-semibold text-[#0f172a]">Redirecting to secure payment…</h2>
        <p className="mt-3 text-[15px] text-[#64748b]">Your enquiry is saved. Complete the deposit on Stripe to hold your table.</p>
      </div>
    );
  }

  if (state?.ok && !("depositCheckoutUrl" in state && state.depositCheckoutUrl)) {
    return (
      <div className="mx-auto max-w-lg rounded-[28px] border border-[#ebe7f7] bg-white p-8 text-center shadow-[0_28px_90px_-58px_rgba(124,58,237,0.28)] md:p-10">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#ecfdf5] text-emerald-600 ring-1 ring-emerald-100">
          <CalendarCheck className="h-8 w-8" aria-hidden />
        </span>
        <h2 className="mt-6 text-xl font-semibold tracking-tight text-[#0f172a]">Request received</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-[#64748b]">
          {businessName} has your booking details on file and will confirm using the email or phone you shared.
        </p>
        <p className="mt-8 text-center text-sm text-[#94a3b8]">
          Powered by{" "}
          <Link href="/" className="font-semibold text-[#7c3aed] underline-offset-4 hover:underline">
            Solvio
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-lg">
      <div className="mb-6 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#94a3b8]">Book with {businessName}</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[#0f172a]">Request a booking</h1>
        {guestMessage ? (
          <p className="mt-3 whitespace-pre-wrap text-[14px] leading-relaxed text-[#64748b]">{guestMessage}</p>
        ) : (
          <p className="mt-2 text-[14px] leading-relaxed text-[#64748b]">{flowHint}</p>
        )}
      </div>

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="hosted_event_id" value={pickedHostedEvent?.id ?? ""} />
        <input type="hidden" name="hosted_occurrence_starts_at" value={hostedOccurrenceSel?.starts_at ?? ""} />
        {primaryKind ? <input type="hidden" name="booking_kind" value={primaryKind} /> : null}

        {state?.ok === false ? (
          <p className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-900">{state.message}</p>
        ) : null}

        {!primaryKind ? (
          <FormSection step={1} title="How would you like to book?" className="border-[#ddd6fe] bg-[#fafbff]">
            <input type="hidden" name="booking_kind" value={effectiveKind === "" ? guestModes[0] ?? "" : effectiveKind} required />
            <div className="grid gap-3 sm:grid-cols-2" role="tablist" aria-label="Booking type">
              {MODE_PICKER.filter((m) => guestModes.includes(m.mode)).map(({ mode, label, blurb, Icon }) => {
                const chosen = effectiveKind === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    role="tab"
                    aria-selected={chosen}
                    className={cn(
                      "flex min-h-[5.5rem] flex-col items-start gap-2 rounded-xl border px-4 py-4 text-left transition-all",
                      chosen
                        ? "border-[#7c3aed] bg-[#f5f3ff] shadow-sm ring-2 ring-[#ddd6fe]/80"
                        : "border-[#ebe7f7] bg-white hover:border-[#c4b5fd]",
                    )}
                    onClick={() => setKind(mode)}
                  >
                    <span className="flex items-center gap-2 text-[#7c3aed]">
                      <Icon className="h-5 w-5 shrink-0" aria-hidden />
                      <span className="text-[15px] font-semibold text-[#0f172a]">{label}</span>
                    </span>
                    <span className="text-[12px] leading-snug text-[#64748b]">{blurb}</span>
                  </button>
                );
              })}
            </div>
          </FormSection>
        ) : null}

        {effectiveKind === "event" && guestModes.includes("event") && upcomingActiveEvents.length > 0 ? (
          <FormSection step={primaryKind ? 1 : 2} title="Which show?">
            <select
              aria-label="Choose a hosted event"
              value={pickedHostedEventKey}
              required
              className="h-12 w-full rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-4 text-[15px] text-[#0f172a] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
              onChange={(e) => {
                const next = e.target.value;
                setPickedHostedEventKey(next);
                if (!next) return;
                const evt = upcomingActiveEvents.find((x) => hostedEventPickKey(x) === next);
                if (evt) setEventTitle(evt.title);
              }}
            >
              <option value="">Select an event…</option>
              {upcomingActiveEvents.map((evt) => (
                <option key={hostedEventPickKey(evt)} value={hostedEventPickKey(evt)}>
                  {evt.title}
                </option>
              ))}
            </select>
            <input type="hidden" name="event_title" value={eventTitle} />
          </FormSection>
        ) : effectiveKind === "event" ? (
          <FormSection step={primaryKind ? 1 : 2} title="Which show?">
            <input
              id="event_title"
              name="event_title"
              value={eventTitle}
              onChange={(e) => setEventTitle(e.target.value)}
              required
              placeholder="Event or show name"
              className="h-12 w-full rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-4 text-[15px] text-[#0f172a] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
            />
          </FormSection>
        ) : (
          <input type="hidden" name="event_title" value={eventTitle} />
        )}

        {hostedCalendarMode ? (
          <FormSection step={primaryKind ? 2 : 3} title="Pick your show night" className="border-[#ddd6fe] bg-[#fafbff]">
            <p className="text-[13px] leading-relaxed text-[#64748b]">
              Only <span className="font-semibold text-[#5b21b6]">purple dates</span> are bookable for this event. Grey days are not running this show.
            </p>
            <input type="hidden" name="requested_date" value={hostedOccurrenceSel?.dateYmd ?? ""} required />
            <input
              type="hidden"
              name="preferred_time"
              value={hostedOccurrenceSel ? formatHostedOccurrencePreferredSummary(hostedOccurrenceSel, venueTz) : ""}
              required
            />
            <EventOccurrenceMonthCalendar
              timeZone={venueTz}
              occurrences={hostedCalendarOccurrences}
              selected={hostedOccurrenceSel}
              onSelect={(o) => setHostedOccurrenceSel(o)}
            />
            {hostedBookableOccurrences.length === 0 ? (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] leading-relaxed text-rose-900">
                Every upcoming show night for this listing is cancelled. Check the struck-through dates above for details, or pick another event.
              </p>
            ) : null}
            {!hostedOccurrenceSel ? (
              <p className="rounded-xl border border-amber-200 bg-[#fffbeb] px-4 py-3 text-[13px] text-[#92400e]">
                Tap a purple date to continue.
              </p>
            ) : null}
          </FormSection>
        ) : null}

        {hostedListingNoUpcomingShows ? (
          <p className="rounded-xl border border-amber-200 bg-[#fffbeb] px-4 py-3 text-[13px] leading-relaxed text-[#92400e]">
            This hosted listing doesn’t have any upcoming show nights in the diary yet. Leave a preferred date and time window below instead, or jot it in the notes.
          </p>
        ) : null}

        {pickedHostedEvent && isEventBooking && !hostedCalendarMode ? (
          <section className="space-y-2 rounded-2xl border border-[#f1eefc] bg-[#fafbff] px-4 py-4">
            <label htmlFor="hosted_fallback_requested_date" className="text-sm font-semibold text-[#0f172a]">
              Show night date <span className="font-normal text-rose-600">*</span>
            </label>
            <p className="text-[11px] leading-relaxed text-[#64748b]">
              This listing couldn’t paint a clickable calendar yet — enter the performance date strictly as{' '}
              <span className="font-mono font-semibold text-[#475569]">YYYY-MM-DD</span> so it matches venue records (no typed
              DD/MM guesses).
            </p>
            <input
              id="hosted_fallback_requested_date"
              name="requested_date"
              required
              pattern="\d{4}-\d{2}-\d{2}"
              placeholder="YYYY-MM-DD"
              className="h-11 w-full max-w-sm rounded-xl border border-[#ebe7f7] bg-white px-4 font-mono text-[15px] text-[#0f172a] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
            />
          </section>
        ) : null}

        {!suppressGenericPreferredDateGuestsRow ? (
          <FormSection
            step={primaryKind ? 1 : effectiveKind === "event" ? 4 : 2}
            title={effectiveKind === "table" ? "Which evening?" : "Which date?"}
          >
            <label htmlFor="requested_date" className="sr-only">
              Preferred date
            </label>
            <input
              id="requested_date"
              name="requested_date"
              type="date"
              value={requestedDate}
              required={Boolean(bookingPreferredDateHardRequired && !hostedCalendarMode)}
              max="9999-12-31"
              onChange={(e) => setRequestedDate(e.target.value)}
              onBlur={(e) => setRequestedDate(e.target.value)}
              className="h-12 w-full rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-4 text-[15px] text-[#0f172a] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
            />
            {tableBlockedForHostedShow && tableHostedShowBlockMessage ? (
              <div className="space-y-3 rounded-xl border-2 border-[#a78bfa] bg-[#f5f3ff] px-4 py-4">
                <p className="text-[14px] font-medium leading-relaxed text-[#4c1d95]">{tableHostedShowBlockMessage}</p>
                {eventsTabAvailable && !primaryKind ? (
                  <button
                    type="button"
                    className={cn(
                      buttonVariants({ variant: "default" }),
                      "h-11 rounded-full bg-[#7c3aed] px-6 text-sm font-semibold hover:bg-[#6d28d9]",
                    )}
                    onClick={() => {
                      setKind("event");
                      setRequestedDate("");
                      setPreferredTable("");
                    }}
                  >
                    Book via Events instead
                  </button>
                ) : null}
              </div>
            ) : null}
          </FormSection>
        ) : null}

        {effectiveKind !== "" ? (
          <FormSection
            step={primaryKind ? 2 : effectiveKind === "event" ? 5 : 3}
            title="How many guests?"
          >
            <label htmlFor="guest_count" className="sr-only">
              How many are coming?
            </label>
            <input
              id="guest_count"
              name="guest_count"
              type="number"
              inputMode="numeric"
              min={1}
              max={999}
              required
              placeholder="e.g. 4"
              className="h-12 w-full max-w-xs rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-4 text-[15px] text-[#0f172a] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
            />
          </FormSection>
        ) : null}

        {showTablesPanel && !tableBlockedForHostedShow ? (
          <FormSection step={primaryKind ? 3 : 4} title="Choose a table (optional)">
            <p className="text-[13px] text-[#64748b]">Prices shown are guide rates — the venue confirms before you pay.</p>
            {tableSelectionHintMessage && !tableBlockedForHostedShow ? (
              <p className="rounded-xl border border-amber-200 bg-[#fffbeb] px-4 py-3 text-[12px] leading-relaxed text-[#92400e]">
                {tableSelectionHintMessage}
              </p>
            ) : null}
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-[#ebe7f7] bg-white px-3 py-2 text-[13px] text-[#475569] has-[:checked]:border-[#a78bfa] has-[:checked]:bg-[#f5f3ff]">
              <input
                type="radio"
                name="preferred_table"
                value=""
                checked={preferredTable === ""}
                onChange={() => setPreferredTable("")}
                className="h-4 w-4 text-[#7c3aed]"
              />
              No preference — surprise me
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              {context.tables.map((t) => (
                <label
                  key={t.id ?? `${t.label}-${t.capacity}`}
                  className="flex cursor-pointer flex-col gap-1 rounded-xl border border-[#ebe7f7] bg-white px-3 py-3 text-sm has-[:checked]:border-[#a78bfa] has-[:checked]:bg-[#f5f3ff]"
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="radio"
                      name="preferred_table"
                      value={t.label}
                      checked={preferredTable === t.label}
                      onChange={() => setPreferredTable(t.label)}
                      className="mt-1 h-4 w-4 text-[#7c3aed]"
                    />
                    <div>
                      <p className="font-semibold text-[#0f172a]">{t.label}</p>
                      <p className="text-[13px] text-[#64748b]">
                        Seats {t.capacity} · {formatPublicTablePriceEUR(t.price_cents, t.pricing_mode)}
                      </p>
                    </div>
                  </div>
                </label>
              ))}
            </div>
            <TableFloorPreview tables={context.tables} />

            <div className="space-y-2 pt-2">
              <label htmlFor="seating_notes" className="text-sm font-semibold text-[#0f172a]">
                Seating notes <span className="font-normal text-[#94a3b8]">(optional)</span>
              </label>
              <textarea
                id="seating_notes"
                name="seating_notes"
                rows={2}
                className="w-full resize-none rounded-xl border border-[#ebe7f7] bg-white px-4 py-3 text-[15px] text-[#0f172a] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
                placeholder="Quiet corner · outdoor · celebrating something…"
              />
            </div>
          </FormSection>
        ) : null}

        {showTableQuestions ? (
          <fieldset className="space-y-3 rounded-2xl border border-[#f1eefc] bg-[#fafbff] px-4 py-4">
            <legend className="px-1 text-sm font-semibold text-[#0f172a]">A few specifics</legend>
            <input type="hidden" name="table_q_count" value={sortedQuestions.length} />
            {sortedQuestions.map((q, idx) => (
              <div key={`${q.sort_order}-${q.question_label}`} className="space-y-2">
                <input type="hidden" name={`tl_${idx}`} value={q.question_label} />
                <label htmlFor={`ta_${idx}`} className="text-sm font-semibold text-[#0f172a]">
                  {q.question_label}
                  {q.required ? <span className="text-rose-600"> *</span> : null}
                </label>
                <textarea
                  id={`ta_${idx}`}
                  name={`ta_${idx}`}
                  required={q.required}
                  rows={2}
                  className="w-full resize-none rounded-xl border border-[#ebe7f7] bg-white px-4 py-3 text-[15px] text-[#0f172a] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
                  placeholder="Your answer"
                />
              </div>
            ))}
          </fieldset>
        ) : null}

        <div className="space-y-3">
          {structuredAppointmentBooking ? (
            <>
              <label htmlFor="preferred_time" className="text-sm font-semibold text-[#0f172a]">
                Time slot<span className="font-normal text-rose-600"> *</span>
              </label>
              {!requestedDate.trim() ? (
                <p className="rounded-xl border border-[#dbeafe] bg-[#eff6ff]/80 px-4 py-3 text-[13px] leading-relaxed text-[#1e40af]">
                  Select a preferred date above — Solvio lists every discrete start time (usually{' '}
                  <span className="font-semibold">30&nbsp;minute</span> steps) derived from weekly hours configured under{' '}
                  <span className="font-semibold">Dashboard → Bookings</span>.
                </p>
              ) : null}
              {requestedDate.trim() && !appointmentSchedule.hourRow ? (
                <p className="rounded-xl border border-amber-200 bg-[#fffbeb] px-4 py-3 text-[13px] leading-relaxed text-[#92400e]">
                  No opening hours saved for{' '}
                  <span className="font-semibold">
                    {BOOKING_PUBLIC_WEEKDAY_SHORT[dowSundayZeroInBusinessTZ(requestedDate.trim(), venueTz)] ?? "that"} weekday
                  </span>
                  — pick another date, or outline your ideal visit below so the venue can reconcile manually.
                </p>
              ) : null}
              {appointmentSlotsList.length > 0 ? (
                <>
                  <select
                    key={requestedDate.trim()}
                    id="preferred_time"
                    name="preferred_time"
                    required
                    defaultValue=""
                    className="h-11 w-full rounded-xl border border-[#ebe7f7] bg-white px-4 text-[15px] text-[#0f172a] outline-none ring-offset-2 transition focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
                  >
                    <option value="" disabled>
                      Choose a {(appointmentSchedule.hourRow?.slot_minutes ?? 30).toString()}-minute start…
                    </option>
                    {appointmentSlotsList.map((slot) => (
                      <option key={slot.value} value={slot.value}>
                        {slot.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] leading-relaxed text-[#94a3b8]">
                    Times follow <span className="font-semibold text-[#64748b]">{venueTz}</span> windows from your weekday grid.
                  </p>
                </>
              ) : null}
              {requestedDate.trim() && appointmentSchedule.hourRow && appointmentSlotsList.length === 0 ? (
                <>
                  <p className="text-[13px] leading-relaxed text-[#92400e]">
                    No full slot fits within the configured open/close range for that weekday — widen the window in Bookings
                    inventory or type a fallback request below.
                  </p>
                  <input
                    id="preferred_time"
                    name="preferred_time"
                    required
                    placeholder='Rough arrival time (team will reschedule if needed)'
                    className="h-11 w-full rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-4 text-[15px] text-[#0f172a] outline-none ring-offset-2 transition focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
                  />
                </>
              ) : null}
              {requestedDate.trim() && !appointmentSchedule.hourRow ? (
                <input
                  id="preferred_time"
                  name="preferred_time"
                  required
                  placeholder="Approximate arrival / ideal window..."
                  className="h-11 w-full rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-4 text-[15px] text-[#0f172a] outline-none ring-offset-2 transition focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
                />
              ) : null}
            </>
          ) : hostedCalendarMode ? (
            <p className="text-[11px] leading-relaxed text-[#94a3b8]">
              Your slot is set from the showing you chose on the calendar — times are in{' '}
              <span className="font-semibold text-[#64748b]">{venueTz}</span>.
            </p>
          ) : (
            <div className="space-y-2">
              <label htmlFor="preferred_time" className="text-sm font-semibold text-[#0f172a]">
                Preferred time or window
              </label>
              <input
                id="preferred_time"
                name="preferred_time"
                className="h-11 w-full rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-4 text-[15px] text-[#0f172a] outline-none ring-offset-2 transition focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
                placeholder="Sat 7pm · First afternoon slot · Flexible weekday lunch…"
              />
            </div>
          )}
        </div>

        <FormSection step={primaryKind ? 4 : 5} title="Your details" className="border-[#f1eefc] bg-[#fafbff]">
          <div className="space-y-3">
            <input
              id="customer_name"
              name="customer_name"
              required
              autoComplete="name"
              className="h-12 w-full rounded-xl border border-[#ebe7f7] bg-white px-4 text-[15px] text-[#0f172a] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
              placeholder="Your name"
            />
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="h-12 w-full rounded-xl border border-[#ebe7f7] bg-white px-4 text-[15px] text-[#0f172a] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
              placeholder="Email address"
            />
            <input
              id="phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              className="h-12 w-full rounded-xl border border-[#ebe7f7] bg-white px-4 text-[15px] text-[#0f172a] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
              placeholder="Phone (recommended)"
            />
            <textarea
              id="notes"
              name="notes"
              rows={3}
              className="w-full resize-none rounded-xl border border-[#ebe7f7] bg-white px-4 py-3 text-[15px] text-[#0f172a] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
              placeholder="Notes — allergies, accessibility, special requests…"
            />
          </div>
        </FormSection>

        <button
          type="submit"
          disabled={
            pending || hostedEventSubmissionBlocked || hostedCalendarSelectionBlocked || tableBlockedForHostedShow
          }
          className={cn(
            buttonVariants({ variant: "default" }),
            "h-12 w-full rounded-full text-base font-semibold shadow-lg shadow-[#7c3aed]/25 disabled:opacity-60",
          )}
        >
          {pending ? (
            <>
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden />
              Sending…
            </>
          ) : (
            "Send booking request"
          )}
        </button>
      </form>

      <p className="mt-8 text-center text-xs text-[#94a3b8]">
        By submitting, you agree {businessName} may contact you about this request.
        {context.venue_time_zone && context.venue_time_zone !== "UTC" ? (
          <span className="block pt-1">
            Booking times you pick are local to you — confirmations email in the venue&apos;s window (
            {context.venue_time_zone}).
          </span>
        ) : null}{" "}
        Hosted on{" "}
        <Link href="/" className="font-semibold text-[#7c3aed] underline-offset-4 hover:underline">
          Solvio
        </Link>
        .
      </p>
    </div>
  );
}
