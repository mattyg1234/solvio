"use client";
import { useState } from "react";

import { sendPickupDetailsToGuestsAction } from "@/app/dashboard/show-ops/actions-bus-send";

/** Send tonight's pick-up stop and time to the ticked guests, by email, SMS or both. */
export function BusGuestSend({
  date,
  bookingIds,
  disabled,
  onSent,
}: {
  date: string;
  bookingIds: string[];
  disabled: boolean;
  onSent?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [ok, setOk] = useState<boolean | null>(null);
  const none = bookingIds.length === 0;
  return (
    <form
      className="flex w-full flex-wrap items-end gap-2 border-t pt-3"
      onSubmit={async (event) => {
        event.preventDefault();
        if (disabled || none) return;
        const form = new FormData(event.currentTarget);
        setBusy(true);
        setMessage("");
        try {
          const result = await sendPickupDetailsToGuestsAction(form);
          setOk(result.ok);
          setMessage(result.message);
          if (result.ok) onSent?.();
        } catch {
          setOk(false);
          setMessage("Not sent. Please retry.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="booking_ids" value={JSON.stringify(bookingIds)} />
      <label className="text-xs font-medium">
        Send pick-up details to {bookingIds.length} ticked guest{bookingIds.length === 1 ? "" : "s"} by
        <select name="channel" defaultValue="both" disabled={disabled || busy} className="mt-1 block rounded-lg border px-3 py-2 text-sm">
          <option value="both">Email and SMS</option>
          <option value="email">Email only</option>
          <option value="sms">SMS only</option>
        </select>
      </label>
      <button
        type="submit"
        disabled={disabled || busy || none}
        className="rounded-xl bg-sky-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
      >
        {busy ? "Sending…" : "Send to guests"}
      </button>
      <span className="text-[11px] text-slate-500">Each guest gets their own stop and time as the board shows it now.</span>
      {message ? (
        <p role="status" className={`w-full text-xs font-semibold ${ok ? "text-emerald-800" : "text-rose-700"}`}>
          {message}
        </p>
      ) : null}
    </form>
  );
}
