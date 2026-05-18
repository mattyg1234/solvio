"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarCheck, Loader2, MapPin, Mic2, PartyPopper, Sparkles } from "lucide-react";

import { submitBookingRequestAction, type SubmitBookingState } from "./actions";
import {
  BOOKING_GUEST_MODE_LABELS,
  type BookingGuestMode,
} from "@/lib/booking-guest-modes";
import {
  BOOKING_PUBLIC_WEEKDAY_SHORT,
  type BookingPublicContextPayload,
  formatPublicRange,
  formatPublicTablePriceEUR,
  type PublicAppointmentHour,
  type PublicFloorTable,
} from "@/lib/booking-public-context";
import {
  type AppointmentSlotChoice,
  buildAppointmentSlotChoices,
  dowSundayZeroInBusinessTZ,
} from "@/lib/booking-appointment-slots";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const initialState: SubmitBookingState | null = null;

const FLOW_KIND_HINT: Record<string, string> = {
  restaurant_tables: "Tell us about your table — party size and occasion help us seat you.",
  salon_appointments:
    "Choose a calendar date and a discrete time slot generated from venue hours — or pick a hosted Event for special nights.",
  walk_in_waitlist: "Walk-in requests — share when you’d like to arrive and party size.",
  mixed: "Appointments offer fixed slots by day — Events cover ticketed nights; tables and walk-ins have their own path.",
};

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
        const left = ((t.position_x - minX) / w) * 100;
        const top = ((t.position_y - minY) / h) * 100;
        const width = (t.width / w) * 100;
        const height = (t.height / h) * 100;
        return (
          <div
            key={t.id ?? `${t.label}-${t.position_x}-${t.position_y}`}
            className="absolute flex items-center justify-center rounded-xl border border-[#c4b5fd]/70 bg-white/95 px-1 text-center text-[10px] font-semibold leading-tight text-[#5b21b6] shadow-sm shadow-[#ede9fe]/60"
            style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }}
          >
            <span className="line-clamp-2">{t.label}</span>
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

  const showAppointmentsPanel =
    effectiveKind === "appointment" &&
    guestModes.includes("appointment") &&
    context.appointment_hours.length > 0;
  const showEventsPanel =
    effectiveKind === "event" && guestModes.includes("event") && context.events.length > 0;
  const showTablesPanel = effectiveKind === "table" && context.tables.length > 0;
  const showTableQuestions =
    effectiveKind === "table" && sortedQuestions.length > 0;
  const upcomingActiveEvents = context.events.filter((e) => !e.cancelled);
  const cancelledEvents = context.events.filter((e) => e.cancelled);

  const flowHint =
    (bookingFlowKind && FLOW_KIND_HINT[bookingFlowKind]) ||
    "Choose the booking type that fits — your details go straight to the team.";

  if (state?.ok) {
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
    <div className="mx-auto w-full max-w-xl rounded-[28px] border border-[#ebe7f7]/90 bg-white/95 p-8 shadow-[0_28px_90px_-58px_rgba(124,58,237,0.32)] backdrop-blur-sm md:p-10">
      <div className="mb-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#94a3b8]">Book on Solvio</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[#0f172a] md:text-[1.65rem]">{businessName}</h1>
        {guestMessage ? (
          <p className="mt-4 whitespace-pre-wrap text-left text-[15px] leading-relaxed text-[#475569]">{guestMessage}</p>
        ) : (
          <p className="mt-3 text-[15px] leading-relaxed text-[#64748b]">{flowHint}</p>
        )}
      </div>

      <form action={formAction} className="space-y-5">
        {primaryKind ? <input type="hidden" name="booking_kind" value={primaryKind} /> : null}

        {state?.ok === false ? (
          <p className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-900">{state.message}</p>
        ) : null}

        {!primaryKind ? (
          <div className="space-y-3 rounded-2xl border border-[#f1eefc] bg-[#fafbff] px-4 py-4">
            <input type="hidden" name="booking_kind" value={effectiveKind === "" ? guestModes[0] ?? "" : effectiveKind} required />
            <p className="text-sm font-semibold text-[#0f172a]">Choose how you&apos;d like to book</p>
            <p className="text-xs leading-relaxed text-[#64748b]">Tabs keep the busy page calm — only the paths this venue publishes stay visible.</p>
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Booking type">
              {guestModes.map((m) => {
                const chosen = effectiveKind === m;
                return (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={chosen}
                    className={cn(
                      "rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
                      chosen
                        ? "border-[#a78bfa] bg-[#f5f3ff] text-[#5b21b6] shadow-inner shadow-[#ede9fe]/60"
                        : "border-transparent bg-white text-[#64748b] ring-1 ring-[#ebe7f7] hover:border-[#ddd6fe] hover:text-[#0f172a]",
                    )}
                    onClick={() => setKind(m)}
                  >
                    {BOOKING_GUEST_MODE_LABELS[m]}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {showAppointmentsPanel ? (
          <section className="space-y-3 rounded-2xl border border-[#f1eefc] bg-[#fafbff] px-4 py-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#0f172a]">
              <Mic2 className="h-4 w-4 text-[#7c3aed]" aria-hidden />
              Typical availability
            </div>
            <p className="text-xs leading-relaxed text-[#64748b]">
              These are your recurring weekly templates. Guests choose <strong>a date</strong>, then{' '}
              <strong>a start time slot</strong> — times use{' '}
              {context.venue_time_zone && context.venue_time_zone !== "UTC" ? (
                <span className="font-medium text-[#475569]">{venueTz}</span>
              ) : (
                <>
                  your venue timezone (set under <span className="font-medium text-[#475569]">Dashboard → Settings</span>)
                </>
              )}
              . Booking something like <strong>a boat-party night</strong>? Use{' '}
              <strong>{BOOKING_GUEST_MODE_LABELS.event}</strong> and pick that listing instead.
            </p>
            <ul className="space-y-2 text-sm text-[#475569]">
              {[...context.appointment_hours]
                .sort((a, b) => a.weekday - b.weekday)
                .map((h) => (
                  <li
                    key={`${h.weekday}-${h.open_time}`}
                    className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-[#ebe7f7] bg-white px-3 py-2"
                  >
                    <span className="font-semibold text-[#0f172a]">{BOOKING_PUBLIC_WEEKDAY_SHORT[h.weekday] ?? `Day ${h.weekday}`}</span>
                    <span className="text-[13px] text-[#64748b]">
                      {h.open_time}–{h.close_time}
                      <span className="text-[#94a3b8]"> · {h.slot_minutes} min slots</span>
                    </span>
                  </li>
                ))}
            </ul>
          </section>
        ) : null}

        {showEventsPanel ? (
          <section className="space-y-3 rounded-2xl border border-[#f1eefc] bg-[#fafbff] px-4 py-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#0f172a]">
              <PartyPopper className="h-4 w-4 text-[#7c3aed]" aria-hidden />
              Hosted nights & happenings
            </div>
            <p className="text-xs leading-relaxed text-[#64748b]">
              Pick the exact night below — themed events use their own timings (not appointment slots).
            </p>
            <ul className="space-y-2">
              {upcomingActiveEvents.map((evt) => (
                <li
                  key={`${evt.title}-${evt.starts_at}`}
                  className="rounded-xl border border-[#ebe7f7] bg-white px-3 py-2 text-sm text-[#475569]"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold text-[#0f172a]">{evt.title}</span>
                    <span className="text-[12px] uppercase tracking-[0.18em] text-[#94a3b8]">
                      {formatPublicRange(evt.starts_at, evt.ends_at)}
                    </span>
                  </div>
                  {evt.description ? (
                    <p className="mt-2 text-[13px] leading-relaxed text-[#64748b]">{evt.description}</p>
                  ) : null}
                </li>
              ))}
            </ul>
            {cancelledEvents.length ? (
              <details className="rounded-xl border border-dashed border-[#fbbf24]/60 bg-[#fffbeb]/70 px-3 py-2 text-[13px] text-[#92400e]">
                <summary className="cursor-pointer font-semibold">Recently cancelled nights</summary>
                <ul className="mt-2 space-y-1">
                  {cancelledEvents.map((evt) => (
                    <li key={`cancel-${evt.title}-${evt.starts_at}`}>
                      <span className="font-medium">{evt.title}</span>
                      {evt.cancellation_reason ? ` — ${evt.cancellation_reason}` : null}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </section>
        ) : null}

        <div className="space-y-2">
          <label htmlFor="event_title" className="text-sm font-semibold text-[#0f172a]">
            Occasion / event name <span className="font-normal text-[#94a3b8]">(optional)</span>
          </label>
          {showEventsPanel && upcomingActiveEvents.length ? (
            <div className="space-y-2">
              <select
                aria-label="Match an existing hosted event"
                defaultValue=""
                className="h-11 w-full rounded-xl border border-[#ebe7f7] bg-white px-4 text-[15px] text-[#0f172a] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
                onChange={(e) => {
                  const next = e.target.value;
                  if (next) setEventTitle(next);
                }}
              >
                <option value="">Match an existing hosted event…</option>
                {upcomingActiveEvents.map((evt) => (
                  <option key={`opt-${evt.title}-${evt.starts_at}`} value={evt.title}>
                    {evt.title} · {formatPublicRange(evt.starts_at, evt.ends_at)}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <input
            id="event_title"
            name="event_title"
            value={eventTitle}
            onChange={(e) => setEventTitle(e.target.value)}
            autoComplete="off"
            className="h-11 w-full rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-4 text-[15px] text-[#0f172a] outline-none ring-offset-2 transition focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
            placeholder="Birthday dinner · Vinyl night · Salon colour refresh…"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="requested_date" className="text-sm font-semibold text-[#0f172a]">
              Preferred date
              {structuredAppointmentBooking ? (
                <span className="font-normal text-rose-600"> *</span>
              ) : (
                <span className="font-normal text-[#94a3b8]"> (optional)</span>
              )}
            </label>
            <input
              id="requested_date"
              name="requested_date"
              type="date"
              value={requestedDate}
              required={Boolean(structuredAppointmentBooking)}
              onChange={(e) => setRequestedDate(e.target.value)}
              className="h-11 w-full rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-4 text-[15px] text-[#0f172a] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="guest_count" className="text-sm font-semibold text-[#0f172a]">
              Guests <span className="font-normal text-[#94a3b8]">(optional)</span>
            </label>
            <input
              id="guest_count"
              name="guest_count"
              type="number"
              inputMode="numeric"
              min={1}
              max={999}
              placeholder="e.g. 4"
              className="h-11 w-full rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-4 text-[15px] text-[#0f172a] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
            />
          </div>
        </div>

        {showTablesPanel ? (
          <section className="space-y-3 rounded-2xl border border-[#f1eefc] bg-[#fafbff] px-4 py-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#0f172a]">
              <Sparkles className="h-4 w-4 text-[#7c3aed]" aria-hidden />
              Table preferences
            </div>
            <p className="text-xs leading-relaxed text-[#64748b]">
              Choose a favourite table if you have one — the team will confirm availability.
            </p>
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-[#ebe7f7] bg-white px-3 py-2 text-[13px] text-[#475569] has-[:checked]:border-[#a78bfa] has-[:checked]:bg-[#f5f3ff]">
              <input type="radio" name="preferred_table" value="" defaultChecked className="h-4 w-4 text-[#7c3aed]" />
              No preference — surprise me
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              {context.tables.map((t) => (
                <label
                  key={`${t.label}-${t.capacity}`}
                  className="flex cursor-pointer flex-col gap-1 rounded-xl border border-[#ebe7f7] bg-white px-3 py-3 text-sm has-[:checked]:border-[#a78bfa] has-[:checked]:bg-[#f5f3ff]"
                >
                  <div className="flex items-start gap-2">
                    <input type="radio" name="preferred_table" value={t.label} className="mt-1 h-4 w-4 text-[#7c3aed]" />
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
          </section>
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

        <div className="space-y-2">
          <label htmlFor="customer_name" className="text-sm font-semibold text-[#0f172a]">
            Your name
          </label>
          <input
            id="customer_name"
            name="customer_name"
            required
            autoComplete="name"
            className="h-11 w-full rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-4 text-[15px] text-[#0f172a] outline-none ring-offset-2 transition focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
            placeholder="Alex Kim"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-semibold text-[#0f172a]">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="h-11 w-full rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-4 text-[15px] text-[#0f172a] outline-none ring-offset-2 transition focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
            placeholder="you@example.com"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="phone" className="text-sm font-semibold text-[#0f172a]">
            Phone <span className="font-normal text-[#94a3b8]">(recommended)</span>
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            className="h-11 w-full rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-4 text-[15px] text-[#0f172a] outline-none ring-offset-2 transition focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
            placeholder="+1 …"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="notes" className="text-sm font-semibold text-[#0f172a]">
            Anything else we should know?
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            className="w-full resize-none rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-4 py-3 text-[15px] text-[#0f172a] outline-none ring-offset-2 transition focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
            placeholder="Allergies, accessibility, kids high-chair…"
          />
        </div>

        <button
          type="submit"
          disabled={pending}
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
            "Submit booking request"
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
