"use client";

import { useState } from "react";
import { SearchableSelect } from "./searchable-select";
import { setBookingPickupAction } from "@/app/dashboard/show-ops/actions";
import { SubmitOnce } from "@/components/show-ops/submit-once";

export type PickupStopOption = {
  id: string;
  label: string;
  keywords?: string;
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
  const [stopId, setStopId] = useState(currentStopId ?? "");
  return (
    <form action={setBookingPickupAction} className="flex flex-wrap items-center gap-1 print:hidden">
      <input type="hidden" name="booking_id" value={bookingId} />
      <div className="min-w-[12rem] max-w-[19rem]">
        <SearchableSelect name="pickup_stop_id" value={stopId} onChange={setStopId}
          options={stops.map((stop) => ({ value: stop.id, label: stop.label, keywords: stop.keywords }))}
          ariaLabel="Pickup point" placeholder="Type a pickup or hotel name…" emptyLabel="No pickup" />
      </div>
      <SubmitOnce className="rounded bg-slate-800 px-2 py-1 text-[11px] text-white disabled:opacity-60">
        Move
      </SubmitOnce>
    </form>
  );
}
