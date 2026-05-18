"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { motion } from "framer-motion";
import {
  Armchair,
  CalendarCheck,
  CalendarDays,
  CalendarOff,
  Inbox,
  Loader2,
  PartyPopper,
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
import { BookingInbox, type BookingRequestRow } from "@/components/dashboard/booking-inbox";
import { Button, buttonVariants } from "@/components/ui/button";
import { BOOKING_GUEST_MODE_LABELS, isBookingGuestMode } from "@/lib/booking-guest-modes";
import type { AppointmentWeekRow, SlotExceptionRow } from "@/lib/booking-inventory-types";
export type { AppointmentWeekRow, SlotExceptionRow } from "@/lib/booking-inventory-types";
import { cn } from "@/lib/utils";

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

function clipTime(t: string) {
  return t.length >= 5 ? t.slice(0, 5) : t;
}

type TabKey = "requests" | "confirmed" | "appointments" | "events" | "tables";

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
}: BookingOperationsHubProps) {
  const [tab, setTab] = useState<TabKey>("requests");

  if (!businessId || !businessName) {
    return (
      <section className="rounded-[22px] border border-dashed border-[#ddd6fe] bg-white px-6 py-8 text-sm text-[#64748b]">
        Add a business from Settings to unlock appointment grids, events, and floor plans.
      </section>
    );
  }

  const tabs: { key: TabKey; label: string; icon: typeof Inbox }[] = [
    { key: "requests", label: "Requests", icon: Inbox },
    { key: "confirmed", label: "Confirmed", icon: CalendarCheck },
    { key: "appointments", label: "Appointments", icon: CalendarDays },
    { key: "events", label: "Events", icon: PartyPopper },
    { key: "tables", label: "Tables", icon: Armchair },
  ];

  return (
    <section className="overflow-hidden rounded-[24px] border border-[#ebe7f7]/90 bg-white shadow-sm">
      <div className="flex gap-2 overflow-x-auto border-b border-[#f1eefc] px-4 pt-3 pb-0 md:px-6" role="tablist">
        {tabs.map((t) => {
          const Icon = t.icon;
          const on = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={on}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-t-xl px-4 py-3 text-sm font-semibold transition-colors",
                on ? "bg-[#fafbff] text-[#5b21b6] shadow-[inset_0_-2px_0_0_#7c3aed]" : "text-[#64748b] hover:text-[#0f172a]",
              )}
              onClick={() => setTab(t.key)}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="p-6 md:p-8">
        {tab === "requests" ? (
          <BookingInbox
            requests={requests}
            bizNameById={bizNameById}
            inventoryLinks={{
              tables: tables.map((t) => ({ id: t.id, label: t.label })),
              events: events
                .filter((ev) => !ev.cancelled_at && !ev.deleted_at)
                .map((ev) => ({ id: ev.id, title: ev.title })),
            }}
          />
        ) : null}
        {tab === "confirmed" ? (
          <ConfirmedBookingsPanel businessName={businessName} bookings={confirmedBookings} />
        ) : null}
        {tab === "appointments" ? (
          <AppointmentsPanel
            businessId={businessId}
            schedules={schedules}
            exceptions={exceptions}
            venueTimeZone={venueTimeZone}
          />
        ) : null}
        {tab === "events" ? <EventsPanel businessId={businessId} events={events} /> : null}
        {tab === "tables" ? <TablesPanel businessId={businessId} tables={tables} questions={questions} /> : null}
      </div>
    </section>
  );
}

function confirmedKindLabel(kind: string | null | undefined) {
  if (!kind?.trim()) return "—";
  return isBookingGuestMode(kind) ? BOOKING_GUEST_MODE_LABELS[kind] : kind;
}

function ConfirmedBookingsPanel({
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
          <h2 className="text-lg font-semibold text-[#0f172a]">Confirmed calendar</h2>
          <p className="mt-1 text-sm text-[#64748b]">
            Lock in commitments for <span className="font-semibold text-[#0f172a]">{businessName}</span> after you&apos;ve spoken with the guest.
            Upcoming rows surface here for staffing — cancellations stay visible when enabled below.
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
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-[#ebe7f7] bg-[#fafbff] text-[11px] font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Guest</th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-[#64748b]">
                  Nothing confirmed yet — open <span className="font-semibold text-[#0f172a]">Requests</span>, expand a guest, and use{" "}
                  <span className="font-semibold text-[#5b21b6]">Confirm slot</span>.
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
                  <td className="px-4 py-3 align-top">
                    <p className="font-semibold text-[#0f172a]">{row.guest_name}</p>
                    <p className="text-xs text-[#94a3b8]">{row.guest_email}</p>
                    {typeof row.guest_count === "number" && row.guest_count > 0 ? (
                      <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.14em] text-[#64748b]">{row.guest_count} guests</p>
                    ) : null}
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

function EventsPanel({ businessId, events }: { businessId: string; events: BusinessEventRow[] }) {
  const [pending, startTransition] = useTransition();
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
      <header>
        <h2 className="text-lg font-semibold text-[#0f172a]">Events & series</h2>
        <p className="mt-1 text-sm text-[#64748b]">
          Cancellation keeps history for scripts (“sorry, Thursday is off”). Delete removes it from dashboards (recoverable via restore later).
        </p>
      </header>

      <div className="grid gap-4 rounded-2xl border border-[#ede9fe] bg-[#fafbff]/90 p-5 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="h-11 w-full rounded-xl border border-[#ebe7f7] px-3" placeholder="Sunset boat party" />
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
              <div>
                <p className="font-semibold text-[#0f172a]">
                  {ev.title}{" "}
                  {ev.cancelled_at ? (
                    <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-rose-700">
                      Cancelled
                    </span>
                  ) : null}
                </p>
                <p className="mt-1 text-xs text-[#64748b]">
                  {new Date(ev.starts_at).toLocaleString()} → {new Date(ev.ends_at).toLocaleString()}
                </p>
                {ev.description ? <p className="mt-2 text-sm text-[#475569]">{ev.description}</p> : null}
                {ev.cancelled_at && ev.cancellation_reason ? (
                  <p className="mt-2 text-sm text-rose-800">Reason: {ev.cancellation_reason}</p>
                ) : null}
                <pre className="mt-2 max-h-24 overflow-auto rounded-lg bg-[#f8fafc] p-2 text-[11px] text-[#475569]">
                  {JSON.stringify(ev.recurrence, null, 2)}
                </pre>
              </div>
              <div className="flex flex-wrap gap-2">
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

function TablesPanel({
  businessId,
  tables,
  questions,
}: {
  businessId: string;
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
          Drag tables on the canvas to mirror your room. Pricing can be per table, per guest, or tiered by party size — mirrored on your hosted booking link soon.
        </p>
      </header>

      <div className="relative h-[340px] overflow-hidden rounded-2xl border border-[#ebe7f7] bg-[#f8fafc]">
        <p className="absolute left-3 top-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#94a3b8]">Floor preview</p>
        {tables.map((t) => (
          <motion.div
            key={t.id}
            drag
            dragMomentum={false}
            className="absolute cursor-grab rounded-xl border-2 border-[#c4b5fd] bg-white/95 px-3 py-2 text-xs font-semibold text-[#312e81] shadow-md active:cursor-grabbing"
            style={{
              width: t.width,
              height: t.height,
              left: positions[t.id]?.x ?? t.position_x,
              top: positions[t.id]?.y ?? t.position_y,
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
            {t.label}
            <span className="block text-[10px] font-normal text-[#64748b]">Cap {t.capacity}</span>
          </motion.div>
        ))}
        {tables.length === 0 ? (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-[#94a3b8]">Add a table below to start arranging.</p>
        ) : null}
      </div>

      <Button type="button" variant="secondary" className="rounded-full font-semibold" disabled={pending || tables.length === 0} onClick={() => saveLayout()}>
        {pending ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden /> : null}
        Save layout positions
      </Button>

      <div className="grid gap-4 rounded-2xl border border-[#ede9fe] bg-[#fafbff]/90 p-5 md:grid-cols-3 md:items-end">
        <div className="space-y-2 md:col-span-1">
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">Label</label>
          <input value={label} onChange={(e) => setLabel(e.target.value)} className="h-11 w-full rounded-xl border border-[#ebe7f7] px-3" />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">Capacity</label>
          <input type="number" min={1} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} className="h-11 w-full rounded-xl border border-[#ebe7f7] px-3" />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">Pricing</label>
          <select value={pricingMode} onChange={(e) => setPricingMode(e.target.value as typeof pricingMode)} className="h-11 w-full rounded-xl border border-[#ebe7f7] px-3">
            <option value="table">Flat per table (€)</option>
            <option value="person">Per person (€)</option>
            <option value="group_tier">Tier by group size</option>
          </select>
        </div>
        {pricingMode !== "group_tier" ? (
          <div className="space-y-2 md:col-span-3">
            <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">Amount (€)</label>
            <input value={priceEuro} onChange={(e) => setPriceEuro(e.target.value)} className="h-11 w-full max-w-[200px] rounded-xl border border-[#ebe7f7] px-3" />
          </div>
        ) : (
          <div className="flex flex-wrap gap-3 md:col-span-3">
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
        <div className="md:col-span-3">
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
                  width: 120,
                  height: 80,
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
        <ul className="space-y-2 text-sm">
          {tables.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#f1eefc] px-3 py-2">
              <span className="text-[#0f172a]">
                {t.label} · cap {t.capacity} · {t.pricing_mode} · {(t.price_cents / 100).toFixed(2)} €
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
