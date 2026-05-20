"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Plus, X } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { addManualVenueCalendarBooking } from "@/app/dashboard/bookings/calendar-actions";

type FloorPlanTableOption = { id: string; label: string };
type BusinessEventOption = { id: string; title: string };

type ManualBookingDialogProps = {
  businessId: string;
  tables: FloorPlanTableOption[];
  events: BusinessEventOption[];
};

const DURATIONS = [
  { label: "15 min", minutes: 15 },
  { label: "30 min", minutes: 30 },
  { label: "1 hour", minutes: 60 },
  { label: "1.5 hours", minutes: 90 },
  { label: "2 hours", minutes: 120 },
  { label: "3 hours", minutes: 180 },
];

function defaultStartLocal(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset() + 30);
  d.setSeconds(0, 0);
  // round to next half hour
  const m = d.getMinutes();
  if (m > 30) {
    d.setHours(d.getHours() + 1);
    d.setMinutes(0);
  } else if (m > 0) {
    d.setMinutes(30);
  }
  return d.toISOString().slice(0, 16);
}

export function ManualBookingDialog({ businessId, tables, events }: ManualBookingDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestCount, setGuestCount] = useState<number>(2);
  const [bookingKind, setBookingKind] = useState<"table" | "appointment" | "event" | "walk_in">("table");
  const [startsLocal, setStartsLocal] = useState<string>(defaultStartLocal());
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [floorPlanTableId, setFloorPlanTableId] = useState<string>("");
  const [businessEventId, setBusinessEventId] = useState<string>("");
  const [internalNotes, setInternalNotes] = useState<string>("");
  const [paymentNote, setPaymentNote] = useState<"" | "cash" | "card_offline" | "comped" | "unpaid">("");

  function reset() {
    setGuestName("");
    setGuestPhone("");
    setGuestEmail("");
    setGuestCount(2);
    setBookingKind("table");
    setStartsLocal(defaultStartLocal());
    setDurationMinutes(60);
    setFloorPlanTableId("");
    setBusinessEventId("");
    setInternalNotes("");
    setPaymentNote("");
    setError(null);
  }

  function handleClose() {
    if (pending) return;
    setOpen(false);
    setTimeout(reset, 200);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const starts = new Date(startsLocal);
    if (Number.isNaN(starts.getTime())) {
      setError("Pick a valid start date and time.");
      return;
    }
    const ends = new Date(starts.getTime() + durationMinutes * 60_000);

    startTransition(() => {
      void (async () => {
        try {
          await addManualVenueCalendarBooking({
            businessId,
            guestName,
            guestEmail: guestEmail || undefined,
            guestPhone: guestPhone || undefined,
            guestCount,
            bookingKind,
            startsAtIso: starts.toISOString(),
            endsAtIso: ends.toISOString(),
            floorPlanTableId: bookingKind === "table" ? floorPlanTableId || null : null,
            businessEventId: bookingKind === "event" ? businessEventId || null : null,
            internalNotes,
            paymentNote,
          });
          handleClose();
          router.refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not add booking.");
        }
      })();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          buttonVariants({ variant: "default" }),
          "h-10 rounded-full px-4 text-sm font-semibold shadow-md shadow-[#7c3aed]/15",
        )}
      >
        <Plus className="mr-1.5 h-4 w-4" aria-hidden />
        Add booking
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
                <h2 className="text-base font-semibold text-[#0f172a]">Add booking</h2>
                <p className="text-xs text-[#64748b]">For walk-ins, phone bookings, or anyone paying offline.</p>
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
              {/* Guest */}
              <fieldset className="space-y-3">
                <legend className="text-xs font-semibold uppercase tracking-[0.18em] text-[#94a3b8]">Guest</legend>
                <label className="block space-y-1">
                  <span className="text-sm font-medium text-[#0f172a]">Name *</span>
                  <input
                    required
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="e.g. Sarah Patel"
                    className="h-10 w-full rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-3 text-[14px] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block space-y-1">
                    <span className="text-sm font-medium text-[#0f172a]">Phone</span>
                    <input
                      value={guestPhone}
                      onChange={(e) => setGuestPhone(e.target.value)}
                      placeholder="+44…"
                      className="h-10 w-full rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-3 text-[14px] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-sm font-medium text-[#0f172a]">Email</span>
                    <input
                      type="email"
                      value={guestEmail}
                      onChange={(e) => setGuestEmail(e.target.value)}
                      placeholder="optional"
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

              {/* Type */}
              <fieldset className="space-y-3">
                <legend className="text-xs font-semibold uppercase tracking-[0.18em] text-[#94a3b8]">Type</legend>
                <div className="flex flex-wrap gap-2">
                  {(["table", "appointment", "event", "walk_in"] as const).map((kind) => (
                    <button
                      type="button"
                      key={kind}
                      onClick={() => setBookingKind(kind)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-sm font-medium capitalize transition",
                        bookingKind === kind
                          ? "border-[#7c3aed] bg-[#f5f3ff] text-[#5b21b6]"
                          : "border-[#ebe7f7] bg-white text-[#64748b] hover:border-[#c4b5fd]",
                      )}
                    >
                      {kind.replace("_", " ")}
                    </button>
                  ))}
                </div>
                {bookingKind === "table" && tables.length > 0 ? (
                  <label className="block space-y-1">
                    <span className="text-sm font-medium text-[#0f172a]">Table</span>
                    <select
                      value={floorPlanTableId}
                      onChange={(e) => setFloorPlanTableId(e.target.value)}
                      className="h-10 w-full rounded-xl border border-[#ebe7f7] bg-white px-3 text-[14px] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
                    >
                      <option value="">— Any / unassigned —</option>
                      {tables.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {bookingKind === "event" && events.length > 0 ? (
                  <label className="block space-y-1">
                    <span className="text-sm font-medium text-[#0f172a]">Event</span>
                    <select
                      value={businessEventId}
                      onChange={(e) => setBusinessEventId(e.target.value)}
                      className="h-10 w-full rounded-xl border border-[#ebe7f7] bg-white px-3 text-[14px] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
                    >
                      <option value="">— Pick an event —</option>
                      {events.map((ev) => (
                        <option key={ev.id} value={ev.id}>
                          {ev.title}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </fieldset>

              {/* When */}
              <fieldset className="space-y-3">
                <legend className="text-xs font-semibold uppercase tracking-[0.18em] text-[#94a3b8]">When</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block space-y-1">
                    <span className="text-sm font-medium text-[#0f172a]">Start *</span>
                    <input
                      required
                      type="datetime-local"
                      value={startsLocal}
                      onChange={(e) => setStartsLocal(e.target.value)}
                      className="h-10 w-full rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-3 text-[14px] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-sm font-medium text-[#0f172a]">Duration</span>
                    <select
                      value={durationMinutes}
                      onChange={(e) => setDurationMinutes(parseInt(e.target.value, 10))}
                      className="h-10 w-full rounded-xl border border-[#ebe7f7] bg-white px-3 text-[14px] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
                    >
                      {DURATIONS.map((d) => (
                        <option key={d.minutes} value={d.minutes}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </fieldset>

              {/* Payment */}
              <fieldset className="space-y-3">
                <legend className="text-xs font-semibold uppercase tracking-[0.18em] text-[#94a3b8]">Payment</legend>
                <div className="flex flex-wrap gap-2">
                  {([
                    { v: "", l: "Not tracked" },
                    { v: "cash", l: "Paid cash" },
                    { v: "card_offline", l: "Card (offline)" },
                    { v: "comped", l: "Comped" },
                    { v: "unpaid", l: "Collect on arrival" },
                  ] as const).map((opt) => (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => setPaymentNote(opt.v)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-sm font-medium transition",
                        paymentNote === opt.v
                          ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                          : "border-[#ebe7f7] bg-white text-[#64748b] hover:border-[#c4b5fd]",
                      )}
                    >
                      {opt.l}
                    </button>
                  ))}
                </div>
              </fieldset>

              {/* Notes */}
              <label className="block space-y-1">
                <span className="text-sm font-medium text-[#0f172a]">Internal notes</span>
                <textarea
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  rows={3}
                  placeholder="Allergies, special requests, where they're sitting…"
                  className="w-full rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-3 py-2 text-[14px] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
                />
              </label>

              {error ? (
                <p className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-900">{error}</p>
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
                  ) : (
                    "Add to diary"
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
