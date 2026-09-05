"use client";
import { useState } from "react";
import { sendBusListAction } from "@/app/dashboard/show-ops/actions-bus-send";
export function BusSendForm({
  date,
  bookingIds,
  disabled,
}: {
  date: string;
  bookingIds: string[];
  disabled: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <form
      className="flex w-full flex-wrap items-end gap-2 border-t pt-3"
      onSubmit={async (event) => {
        event.preventDefault();
        if (disabled) return;
        const form = new FormData(event.currentTarget);
        setBusy(true);
        setMessage("");
        try {
          const result = await sendBusListAction(form);
          setMessage(result.message);
        } catch {
          setMessage("Bus list not sent. Please retry.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <input type="hidden" name="date" value={date} />
      <input
        type="hidden"
        name="booking_ids"
        value={JSON.stringify(bookingIds)}
      />
      <label className="text-xs font-medium">
        Send PDF to guide or office
        <input
          type="email"
          name="recipient"
          required
          disabled={disabled || busy}
          placeholder="guide@example.com"
          className="mt-1 block rounded-lg border px-3 py-2 text-sm"
        />
      </label>
      <button
        type="submit"
        disabled={disabled || busy}
        className="rounded-xl bg-slate-800 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
      >
        {busy ? "Sending…" : "Email bus list"}
      </button>
      {message ? (
        <p role="status" className="w-full text-xs">
          {message}
        </p>
      ) : null}
    </form>
  );
}
