"use client";
import { useState } from "react";

import { confirmTonightsTransportAction } from "@/app/dashboard/show-ops/actions-bus-send";

/**
 * "Transport finalised": WhatsApp every bus guest on tonight's board their stop
 * and time (template 3, "See you tonight"). Guests already confirmed are skipped
 * unless the office ticks "send again".
 */
export function BusConfirmTonight({ date, bookingIds, disabled }: { date: string; bookingIds: string[]; disabled: boolean }) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");
  const [ok, setOk] = useState<boolean | null>(null);
  const none = bookingIds.length === 0;
  return (
    <form
      className="flex w-full flex-wrap items-center gap-2 border-t pt-3"
      onSubmit={async (event) => {
        event.preventDefault();
        if (disabled || none) return;
        if (!confirming) {
          setConfirming(true);
          return;
        }
        const form = new FormData(event.currentTarget);
        setBusy(true);
        setMessage("");
        try {
          const result = await confirmTonightsTransportAction(form);
          setOk(result.ok);
          setMessage(result.message);
        } catch {
          setOk(false);
          setMessage("Not sent. Please retry.");
        } finally {
          setBusy(false);
          setConfirming(false);
        }
      }}
    >
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="booking_ids" value={JSON.stringify(bookingIds)} />
      <button
        type="submit"
        disabled={disabled || busy || none}
        className="rounded-xl bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
      >
        {busy
          ? "Sending…"
          : confirming
            ? `Yes, WhatsApp ${bookingIds.length} bus guest${bookingIds.length === 1 ? "" : "s"} now`
            : "Transport finalised: send tonight's pick-up to all bus guests"}
      </button>
      {confirming && !busy ? (
        <button type="button" onClick={() => setConfirming(false)} className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 ring-1 ring-slate-300">
          Cancel
        </button>
      ) : null}
      <label className="flex items-center gap-1 text-xs font-medium text-slate-700">
        <input type="checkbox" name="resend" value="1" disabled={disabled || busy} /> Send again to guests who already had it
      </label>
      <span className="w-full text-[11px] text-slate-600">
        WhatsApp &quot;See you tonight&quot; with each guest&apos;s own stop and time as saved above. Guests who already had it are skipped, so you can press it again after a late booking.
      </span>
      {message ? (
        <p role="status" className={`w-full text-xs font-semibold ${ok ? "text-emerald-800" : "text-rose-700"}`}>
          {message}
        </p>
      ) : null}
    </form>
  );
}
