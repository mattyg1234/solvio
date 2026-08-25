"use client";

import { markListFlagAction } from "@/app/dashboard/show-ops/actions";
import { SubmitOnce } from "@/components/show-ops/submit-once";

export function ListFlagButton({
  bookingId,
  flag,
  label,
  hide,
  undo,
  tone = "slate",
  big = false,
}: {
  bookingId: string;
  flag: "arrived" | "cash" | "card" | "no_show";
  label: string;
  hide?: boolean;
  undo?: boolean;
  tone?: "slate" | "emerald" | "sky" | "rose";
  /** Door mode on a phone — 44px tap targets. */
  big?: boolean;
}) {
  if (hide) return null;
  const size = big ? "min-h-[44px] px-4 py-2.5 text-sm" : undo ? "px-2 py-1 text-[11px]" : "px-2.5 py-1 text-xs";
  const cls =
    tone === "emerald"
      ? `rounded-lg bg-emerald-700 ${size} font-semibold text-white disabled:opacity-60`
      : tone === "sky"
        ? `rounded-lg bg-sky-700 ${size} font-semibold text-white disabled:opacity-60`
        : tone === "rose"
          ? `rounded-lg bg-rose-700 ${size} font-semibold text-white disabled:opacity-60`
          : undo
            ? `rounded-lg bg-slate-100 ${size} text-slate-600 ring-1 ring-slate-200 disabled:opacity-60`
            : `rounded-lg bg-[var(--show-ops-primary,#7c3aed)] ${size} font-semibold text-white disabled:opacity-60`;
  return (
    <form action={markListFlagAction} className={big ? "print:hidden flex-1" : "print:hidden"}>
      <input type="hidden" name="booking_id" value={bookingId} />
      <input type="hidden" name="flag" value={flag} />
      <SubmitOnce className={big ? `${cls} w-full` : cls}>{label}</SubmitOnce>
    </form>
  );
}
