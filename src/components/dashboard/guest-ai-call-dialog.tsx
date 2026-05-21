"use client";

import { useState, useTransition } from "react";
import { Loader2, Mic2, Phone } from "lucide-react";

import type { GuestCallActionResult } from "@/app/dashboard/bookings/guest-call-actions";
import {
  BOOKING_GUEST_CALL_PURPOSE_LABELS,
  type BookingGuestCallPurpose,
} from "@/lib/booking-guest-call";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type GuestAiCallDialogProps = {
  guestName: string;
  guestPhone: string | null;
  bookingLabel: string;
  disabled?: boolean;
  defaultPurpose?: BookingGuestCallPurpose;
  defaultChangeSummary?: string;
  triggerLabel?: string;
  triggerClassName?: string;
  onCall: (input: {
    purpose: BookingGuestCallPurpose;
    changeSummary: string;
    customScript: string;
  }) => Promise<GuestCallActionResult>;
};

const PURPOSES: BookingGuestCallPurpose[] = [
  "booking_updated",
  "booking_cancelled",
  "confirm_request",
  "guest_request_reply",
  "custom",
];

export function GuestAiCallButton({
  guestName,
  guestPhone,
  bookingLabel,
  disabled,
  defaultPurpose = "booking_updated",
  defaultChangeSummary = "",
  triggerLabel = "AI call",
  triggerClassName,
  onCall,
}: GuestAiCallDialogProps) {
  const [open, setOpen] = useState(false);
  const [purpose, setPurpose] = useState<BookingGuestCallPurpose>(defaultPurpose);
  const [changeSummary, setChangeSummary] = useState(defaultChangeSummary);
  const [customScript, setCustomScript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const noPhone = !guestPhone?.trim();

  function handleOpen() {
    setPurpose(defaultPurpose);
    setChangeSummary(defaultChangeSummary);
    setCustomScript("");
    setError(null);
    setSuccess(null);
    setOpen(true);
  }

  function handleCall() {
    setError(null);
    setSuccess(null);
    startTransition(() => {
      void onCall({
        purpose,
        changeSummary: changeSummary.trim(),
        customScript: customScript.trim(),
      }).then((res) => {
        if (res.ok) {
          setSuccess(res.message);
          setTimeout(() => setOpen(false), 1800);
        } else {
          setError(res.message);
        }
      });
    });
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled || noPhone || pending}
        onClick={handleOpen}
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "h-8 rounded-full border-[#ddd6fe] px-3 text-[11px] font-semibold text-[#5b21b6] hover:bg-[#faf7ff]",
          triggerClassName,
        )}
      >
        <Mic2 className="mr-1 h-3.5 w-3.5" aria-hidden />
        {triggerLabel}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8 backdrop-blur-sm"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-[24px] border border-[#ebe7f7] bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="border-b border-[#f1eefc] px-6 py-4">
              <h2 className="text-base font-semibold text-[#0f172a]">AI call guest</h2>
              <p className="mt-1 text-sm text-[#64748b]">
                {guestName} · {bookingLabel}
              </p>
              {guestPhone ? (
                <p className="mt-1 font-mono text-xs text-[#475569]">{guestPhone}</p>
              ) : null}
            </header>

            <div className="space-y-4 px-6 py-5">
              <label className="block space-y-1">
                <span className="text-sm font-semibold text-[#0f172a]">Why are you calling?</span>
                <select
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value as BookingGuestCallPurpose)}
                  className="h-10 w-full rounded-xl border border-[#ebe7f7] bg-white px-3 text-[14px] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
                >
                  {PURPOSES.map((p) => (
                    <option key={p} value={p}>
                      {BOOKING_GUEST_CALL_PURPOSE_LABELS[p]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1">
                <span className="text-sm font-semibold text-[#0f172a]">What changed or what should they know?</span>
                <textarea
                  value={changeSummary}
                  onChange={(e) => setChangeSummary(e.target.value)}
                  rows={3}
                  placeholder="e.g. Saturday drag brunch now starts at 8pm instead of 7pm, same venue."
                  className="w-full rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-3 py-2 text-[14px] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
                />
              </label>

              {purpose === "custom" ? (
                <label className="block space-y-1">
                  <span className="text-sm font-semibold text-[#0f172a]">Full script (optional)</span>
                  <textarea
                    value={customScript}
                    onChange={(e) => setCustomScript(e.target.value)}
                    rows={3}
                    placeholder="Override what the receptionist should say…"
                    className="w-full rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-3 py-2 text-[14px] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
                  />
                </label>
              ) : null}

              <p className="text-xs text-[#94a3b8]">
                Uses your saved AI receptionist voice. The guest&apos;s phone will ring — test on your own number first.
              </p>

              {error ? (
                <p className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-900">{error}</p>
              ) : null}
              {success ? (
                <p className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{success}</p>
              ) : null}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setOpen(false)}
                  className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "rounded-full")}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={pending || (!changeSummary.trim() && !customScript.trim() && purpose !== "confirm_request")}
                  onClick={handleCall}
                  className={cn(
                    buttonVariants({ variant: "default", size: "sm" }),
                    "rounded-full font-semibold shadow-md shadow-[#7c3aed]/20",
                  )}
                >
                  {pending ? (
                    <>
                      <Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden />
                      Dialling…
                    </>
                  ) : (
                    <>
                      <Phone className="mr-2 inline h-4 w-4" aria-hidden />
                      Start call
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
