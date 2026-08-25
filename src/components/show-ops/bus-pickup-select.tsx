"use client";

import { setBookingPickupAction } from "@/app/dashboard/show-ops/actions";
import { SubmitOnce } from "@/components/show-ops/submit-once";

export type PickupStopOption = {
  id: string;
  label: string;
};

export function BusPickupSelect({
  bookingId,
  currentStopId,
  stops,
}: {
  bookingId: string;
  currentStopId: string | null;
  stops: PickupStopOption[];
}) {
  return (
    <form action={setBookingPickupAction} className="flex flex-wrap items-center gap-1 print:hidden">
      <input type="hidden" name="booking_id" value={bookingId} />
      <select
        name="pickup_stop_id"
        defaultValue={currentStopId ?? ""}
        className="max-w-[11rem] rounded border border-slate-200 px-1.5 py-1 text-xs"
      >
        <option value="">No pickup</option>
        {stops.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
      <SubmitOnce className="rounded bg-slate-800 px-2 py-1 text-[11px] text-white disabled:opacity-60">
        Move
      </SubmitOnce>
    </form>
  );
}
