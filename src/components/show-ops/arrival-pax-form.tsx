"use client";

import {
  markArrivedPaxAllAction,
  markArrivedPaxClearAction,
  markArrivedPaxCountAction,
  markArrivedPaxNoneAction,
} from "@/app/dashboard/show-ops/actions";
import { SubmitOnce } from "@/components/show-ops/submit-once";
import { NumberInput } from "@/components/ui/number-input";
import type { ShowOpsArrivalMark } from "@/lib/show-ops/calc";

export function ArrivalPaxForm({
  bookingId,
  mark,
  big = false,
}: {
  bookingId: string;
  mark: ShowOpsArrivalMark;
  /** Door mode on a phone — 44px tap targets. */
  big?: boolean;
}) {
  const defaultCount = mark.arrived ?? mark.booked;
  const btn = big ? "min-h-[44px] flex-1 px-3 py-2.5 text-sm" : "px-2 py-1 text-[11px]";
  return (
    <form className="print:hidden">
      <input type="hidden" name="booking_id" value={bookingId} />
      <div className={big ? "flex flex-wrap items-end gap-2" : "flex flex-wrap items-end gap-1"}>
        <label className="text-[11px] font-medium text-slate-600">
          Showed
          <span className="mt-0.5 flex items-center gap-1">
            <NumberInput
              name="arrived_pax"
              min={0}
              max={mark.booked}
              defaultValue={defaultCount}
              className={`rounded-md border border-slate-200 tabular-nums ${big ? "w-16 px-2 py-2 text-base" : "w-14 px-1.5 py-1 text-sm"}`}
            />
            <span className="whitespace-nowrap text-slate-500">/ {mark.booked}</span>
          </span>
        </label>
        <SubmitOnce
          name="intent"
          value="count"
          formAction={markArrivedPaxCountAction}
          className={`rounded-lg bg-emerald-700 font-semibold text-white disabled:opacity-60 ${big ? "min-h-[44px] px-4 py-2.5 text-sm" : "px-2.5 py-1 text-xs"}`}
        >
          Mark
        </SubmitOnce>
        <SubmitOnce
          name="intent"
          value="all"
          formAction={markArrivedPaxAllAction}
          className={`rounded-lg bg-[var(--show-ops-primary,#7c3aed)] font-semibold text-white disabled:opacity-60 ${btn}`}
        >
          All in
        </SubmitOnce>
        <SubmitOnce
          name="intent"
          value="none"
          formAction={markArrivedPaxNoneAction}
          className={`rounded-lg bg-rose-700 font-semibold text-white disabled:opacity-60 ${btn}`}
        >
          None
        </SubmitOnce>
        {mark.status !== "pending" ? (
          <SubmitOnce
            name="intent"
            value="clear"
            formAction={markArrivedPaxClearAction}
            className={`rounded-lg bg-slate-100 text-slate-600 ring-1 ring-slate-200 disabled:opacity-60 ${btn}`}
          >
            Undo
          </SubmitOnce>
        ) : null}
      </div>
    </form>
  );
}
