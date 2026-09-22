"use client";
import { useState } from "react";

import { sendMealsListAction } from "@/app/dashboard/show-ops/actions-lists-send";

/** Email the special meals sheet to the chefs. Several addresses, comma separated. */
export function MealsSendForm({
  date,
  island,
  showName,
  bookingIds,
}: {
  date: string;
  island: string | null;
  showName: string | null;
  bookingIds: string[];
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [ok, setOk] = useState<boolean | null>(null);
  return (
    <form
      className="flex flex-wrap items-end gap-2 print:hidden"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setBusy(true);
        setMessage("");
        try {
          const result = await sendMealsListAction(form);
          setOk(result.ok);
          setMessage(result.message);
        } catch {
          setOk(false);
          setMessage("Not sent. Please retry.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="island" value={island ?? ""} />
      <input type="hidden" name="show_name" value={showName ?? ""} />
      <input type="hidden" name="booking_ids" value={JSON.stringify(bookingIds)} />
      <label className="text-xs font-medium text-slate-600">
        Send to the chefs
        <input
          name="recipients"
          type="text"
          required
          disabled={busy}
          placeholder="chef@…, kitchen@…"
          className="mt-1 block w-64 rounded-lg border px-3 py-2 text-sm"
        />
      </label>
      <button
        type="submit"
        disabled={busy || !bookingIds.length}
        className="rounded-xl bg-amber-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
      >
        {busy ? "Sending…" : "Email special meals"}
      </button>
      {message ? (
        <p role="status" className={`w-full text-xs font-semibold ${ok ? "text-emerald-800" : "text-rose-700"}`}>
          {message}
        </p>
      ) : null}
    </form>
  );
}
