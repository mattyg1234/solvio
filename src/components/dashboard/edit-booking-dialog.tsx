"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Pencil, X } from "lucide-react";

import type { GuestCallActionResult } from "@/app/dashboard/bookings/guest-call-actions";
import { editVenueCalendarBooking } from "@/app/dashboard/bookings/calendar-actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { PhoneDialCodeField } from "@/components/ui/phone-dial-code-field";
import { summarizeBookingEditChange, type BookingGuestCallPurpose } from "@/lib/booking-guest-call";
import { optionalPhoneE164, parsePhoneDialFields } from "@/lib/normalize-phone";
import { cn } from "@/lib/utils";

type FloorPlanTableOption = { id: string; label: string };
type BusinessEventOption = { id: string; title: string };

type BookingForEdit = {
  id: string;
  guest_name: string;
  guest_email: string;
  guest_phone: string | null;
  guest_count: number | null;
  starts_at: string;
  ends_at: string;
  floor_plan_table_id: string | null;
  business_event_id: string | null;
  booking_kind: string | null;
  internal_notes: string | null;
  title?: string;
};

type EditBookingDialogProps = {
  booking: BookingForEdit;
  businessName: string;
  venueTimeZone?: string;
  tables: FloorPlanTableOption[];
  events: BusinessEventOption[];
  onNotifyGuest?: (input: {
    purpose: BookingGuestCallPurpose;
    changeSummary: string;
    customScript: string;
  }) => Promise<GuestCallActionResult>;
};

function isoToLocalDatetimeInput(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function EditBookingDialog({
  booking,
  businessName,
  venueTimeZone,
  tables,
  events,
  onNotifyGuest,
}: EditBookingDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notifyMsg, setNotifyMsg] = useState<string | null>(null);

  const initialGuestPhone = parsePhoneDialFields(booking.guest_phone ?? "");
  const [guestName, setGuestName] = useState(booking.guest_name);
  const [guestPhoneDial, setGuestPhoneDial] = useState<string>(initialGuestPhone.dial);
  const [guestPhoneLocal, setGuestPhoneLocal] = useState(initialGuestPhone.local);
  const [guestEmail, setGuestEmail] = useState(booking.guest_email);
  const [guestCount, setGuestCount] = useState<number>(booking.guest_count ?? 2);
  const [startsLocal, setStartsLocal] = useState<string>(isoToLocalDatetimeInput(booking.starts_at));
  const [endsLocal, setEndsLocal] = useState<string>(isoToLocalDatetimeInput(booking.ends_at));
  const [floorPlanTableId, setFloorPlanTableId] = useState<string>(booking.floor_plan_table_id ?? "");
  const [businessEventId, setBusinessEventId] = useState<string>(booking.business_event_id ?? "");
  const [internalNotes, setInternalNotes] = useState<string>(booking.internal_notes ?? "");
  const [notifyByCall, setNotifyByCall] = useState(Boolean(onNotifyGuest && booking.guest_phone?.trim()));
  const [changeSummary, setChangeSummary] = useState("");

  function handleClose() {
    if (pending) return;
    setOpen(false);
    setNotifyMsg(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotifyMsg(null);
    const starts = new Date(startsLocal);
    const ends = new Date(endsLocal);
    if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime())) {
      setError("Pick valid start and end times.");
      return;
    }
    if (ends.getTime() <= starts.getTime()) {
      setError("End must be after start.");
      return;
    }

    const phoneCheck = optionalPhoneE164(guestPhoneDial, guestPhoneLocal);
    if (!phoneCheck.ok) {
      setError(phoneCheck.message);
      return;
    }
    const guestPhone = phoneCheck.e164 ?? "";

    const nextStartsIso = starts.toISOString();
    const nextEndsIso = ends.toISOString();
    const autoChange = summarizeBookingEditChange({
      prevStartsAt: booking.starts_at,
      prevEndsAt: booking.ends_at,
      nextStartsAt: nextStartsIso,
      nextEndsAt: nextEndsIso,
      prevGuestCount: booking.guest_count,
      nextGuestCount: guestCount,
      timeZone: venueTimeZone,
    });

    startTransition(() => {
      void (async () => {
        try {
          await editVenueCalendarBooking({
            bookingId: booking.id,
            startsAtIso: nextStartsIso,
            endsAtIso: nextEndsIso,
            guestName,
            guestEmail,
            guestPhone,
            guestCount,
            floorPlanTableId: floorPlanTableId || null,
            businessEventId: businessEventId || null,
            internalNotes,
          });

          let notifyResult: string | null = null;
          if (notifyByCall && onNotifyGuest && guestPhone.trim()) {
            const summary = changeSummary.trim() || autoChange;
            if (!summary) {
              notifyResult = "Saved — add what changed above if you want the AI to call the guest.";
            } else {
              const callRes = await onNotifyGuest({
                purpose: "booking_updated",
                changeSummary: summary,
                customScript: "",
              });
              notifyResult = callRes.message;
            }
          }

          router.refresh();
          if (notifyResult) {
            setNotifyMsg(notifyResult);
            setTimeout(() => handleClose(), 1800);
          } else {
            handleClose();
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not save changes.");
        }
      })();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          const parsedPhone = parsePhoneDialFields(booking.guest_phone ?? "");
          setGuestName(booking.guest_name);
          setGuestPhoneDial(parsedPhone.dial);
          setGuestPhoneLocal(parsedPhone.local);
          setGuestEmail(booking.guest_email);
          setGuestCount(booking.guest_count ?? 2);
          setStartsLocal(isoToLocalDatetimeInput(booking.starts_at));
          setEndsLocal(isoToLocalDatetimeInput(booking.ends_at));
          setFloorPlanTableId(booking.floor_plan_table_id ?? "");
          setBusinessEventId(booking.business_event_id ?? "");
          setInternalNotes(booking.internal_notes ?? "");
          setChangeSummary("");
          setNotifyByCall(Boolean(onNotifyGuest && booking.guest_phone?.trim()));
          setError(null);
          setNotifyMsg(null);
          setOpen(true);
        }}
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-8 rounded-full px-3 text-[11px] font-semibold text-[#5b21b6]")}
      >
        <Pencil className="mr-1 h-3.5 w-3.5" aria-hidden />
        Edit
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8 backdrop-blur-sm"
          onClick={handleClose}
        >
          <div
            className="w-full max-w-2xl overflow-hidden rounded-[24px] border border-[#ebe7f7] bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b border-[#f1eefc] px-6 py-4">
              <div>
                <h2 className="text-base font-semibold text-[#0f172a]">Edit booking</h2>
                <p className="text-xs text-[#64748b]">
                  Update details for {businessName} — optionally call the guest with your AI receptionist after saving.
                </p>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="rounded-full p-1.5 text-[#64748b] hover:bg-[#f5f3ff] hover:text-[#0f172a]"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <form className="max-h-[70vh] space-y-5 overflow-y-auto px-6 py-5" onSubmit={handleSubmit}>
              <fieldset className="space-y-3">
                <legend className="text-xs font-semibold uppercase tracking-[0.18em] text-[#94a3b8]">Guest</legend>
                <label className="block space-y-1">
                  <span className="text-sm font-medium text-[#0f172a]">Name</span>
                  <input
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    className="h-10 w-full rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-3 text-[14px] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <PhoneDialCodeField
                    idPrefix="edit-guest-phone"
                    label="Phone"
                    optional
                    dialCode={guestPhoneDial}
                    localNumber={guestPhoneLocal}
                    onDialCodeChange={(dial) => {
                      setGuestPhoneDial(dial);
                      setNotifyByCall(Boolean(onNotifyGuest && guestPhoneLocal.trim()));
                    }}
                    onLocalNumberChange={(local) => {
                      setGuestPhoneLocal(local);
                      setNotifyByCall(Boolean(onNotifyGuest && local.trim()));
                    }}
                    showHint={false}
                    inputClassName="rounded-xl bg-[#fafbff]"
                  />
                  <label className="block space-y-1">
                    <span className="text-sm font-medium text-[#0f172a]">Email</span>
                    <input
                      type="email"
                      value={guestEmail}
                      onChange={(e) => setGuestEmail(e.target.value)}
                      className="h-10 w-full rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-3 text-[14px] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
                    />
                  </label>
                </div>
                <label className="block space-y-1">
                  <span className="text-sm font-medium text-[#0f172a]">Party size</span>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={guestCount}
                    onChange={(e) => setGuestCount(Math.max(1, parseInt(e.target.value || "1", 10)))}
                    className="h-10 w-24 rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-3 text-[14px] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
                  />
                </label>
              </fieldset>

              <fieldset className="space-y-3">
                <legend className="text-xs font-semibold uppercase tracking-[0.18em] text-[#94a3b8]">When</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block space-y-1">
                    <span className="text-sm font-medium text-[#0f172a]">Start</span>
                    <input
                      type="datetime-local"
                      value={startsLocal}
                      onChange={(e) => setStartsLocal(e.target.value)}
                      className="h-10 w-full rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-3 text-[14px] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-sm font-medium text-[#0f172a]">End</span>
                    <input
                      type="datetime-local"
                      value={endsLocal}
                      onChange={(e) => setEndsLocal(e.target.value)}
                      className="h-10 w-full rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-3 text-[14px] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
                    />
                  </label>
                </div>
              </fieldset>

              <fieldset className="space-y-3">
                <legend className="text-xs font-semibold uppercase tracking-[0.18em] text-[#94a3b8]">Link to</legend>
                {tables.length > 0 ? (
                  <label className="block space-y-1">
                    <span className="text-sm font-medium text-[#0f172a]">Table</span>
                    <select
                      value={floorPlanTableId}
                      onChange={(e) => setFloorPlanTableId(e.target.value)}
                      className="h-10 w-full rounded-xl border border-[#ebe7f7] bg-white px-3 text-[14px] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
                    >
                      <option value="">— None —</option>
                      {tables.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {events.length > 0 ? (
                  <label className="block space-y-1">
                    <span className="text-sm font-medium text-[#0f172a]">Event</span>
                    <select
                      value={businessEventId}
                      onChange={(e) => setBusinessEventId(e.target.value)}
                      className="h-10 w-full rounded-xl border border-[#ebe7f7] bg-white px-3 text-[14px] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
                    >
                      <option value="">— None —</option>
                      {events.map((ev) => (
                        <option key={ev.id} value={ev.id}>
                          {ev.title}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </fieldset>

              <label className="block space-y-1">
                <span className="text-sm font-medium text-[#0f172a]">Internal notes</span>
                <textarea
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-3 py-2 text-[14px] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
                />
              </label>

              {onNotifyGuest ? (
                <div className="rounded-xl border border-[#ddd6fe] bg-[#faf7ff] px-4 py-4 space-y-3">
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={notifyByCall}
                      onChange={(e) => setNotifyByCall(e.target.checked)}
                      disabled={!guestPhoneLocal.trim()}
                      className="mt-1"
                    />
                    <span className="text-sm text-[#0f172a]">
                      <span className="font-semibold">Call guest after saving</span>
                      <span className="mt-1 block text-[#64748b]">
                        Your AI receptionist rings them with the update. Requires a phone number and outbound line configured.
                      </span>
                    </span>
                  </label>
                  {notifyByCall ? (
                    <label className="block space-y-1">
                      <span className="text-sm font-medium text-[#0f172a]">What changed? (auto-detected if left blank)</span>
                      <textarea
                        value={changeSummary}
                        onChange={(e) => setChangeSummary(e.target.value)}
                        rows={2}
                        placeholder="e.g. The show now starts at 8pm instead of 7pm."
                        className="w-full rounded-xl border border-[#ebe7f7] bg-white px-3 py-2 text-[14px] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
                      />
                    </label>
                  ) : null}
                </div>
              ) : null}

              {error ? (
                <p className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-900">{error}</p>
              ) : null}
              {notifyMsg ? (
                <p className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{notifyMsg}</p>
              ) : null}

              <div className="flex items-center justify-end gap-3 pt-2">
                <Button type="button" variant="ghost" onClick={handleClose} disabled={pending}>
                  Cancel
                </Button>
                <Button type="submit" disabled={pending} className="rounded-full px-6 font-semibold">
                  {pending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                      Saving…
                    </>
                  ) : notifyByCall ? (
                    "Save & call guest"
                  ) : (
                    "Save changes"
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
