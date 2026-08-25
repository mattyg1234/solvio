"use client";

import { decideNoShowChargeAction, uploadNoShowProofAction } from "@/app/dashboard/show-ops/actions";
import { SHOW_OPS_GHOST_BTN, SHOW_OPS_PRIMARY_BTN } from "@/components/show-ops/show-ops-page-header";
import { SubmitOnce } from "@/components/show-ops/submit-once";
import type { ShowOpsNoShowCharge } from "@/lib/show-ops/calc";

export function NoShowDecisionForm({
  bookingId,
  charge,
  missing,
  booked,
  invoiced,
  proofUrl,
  compact = false,
}: {
  bookingId: string;
  charge: ShowOpsNoShowCharge | null;
  missing: number;
  booked: number;
  invoiced?: boolean;
  proofUrl?: string | null;
  compact?: boolean;
}) {
  if (missing <= 0) return null;
  return (
    <div className={compact ? "space-y-2" : "mt-3 space-y-3 border-t border-slate-200/80 pt-3"}>
      <p className={compact ? "text-[11px] font-medium text-slate-700" : "text-sm font-semibold text-slate-900"}>
        {missing} of {booked} no-show
        {charge === "charge" ? " · charging the partner" : charge === "write_off" ? " · written off" : " · choose:"}
      </p>
      {invoiced ? (
        <p className="text-xs text-slate-500">Locked on the invoice pack. Void it to change.</p>
      ) : (
        <form action={decideNoShowChargeAction} className="flex flex-wrap gap-2">
          <input type="hidden" name="booking_id" value={bookingId} />
          <SubmitOnce
            name="charge"
            value="charge"
            className={
              charge === "charge"
                ? SHOW_OPS_PRIMARY_BTN
                : `${SHOW_OPS_GHOST_BTN} ${compact ? "px-3 py-1.5 text-xs" : ""}`
            }
          >
            Charge anyway
          </SubmitOnce>
          <SubmitOnce
            name="charge"
            value="write_off"
            className={
              charge === "write_off"
                ? SHOW_OPS_PRIMARY_BTN
                : `${SHOW_OPS_GHOST_BTN} ${compact ? "px-3 py-1.5 text-xs" : ""}`
            }
          >
            Write off
          </SubmitOnce>
        </form>
      )}
      {proofUrl ? (
        <a href={proofUrl} target="_blank" rel="noreferrer" className="block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={proofUrl} alt="No-show ticket photo" className="h-20 w-auto rounded-lg ring-1 ring-slate-200" />
        </a>
      ) : null}
      <form action={uploadNoShowProofAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="booking_id" value={bookingId} />
        <label className="text-[11px] font-medium text-slate-600">
          Ticket photo
          <input
            name="proof"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            required
            className="mt-0.5 block max-w-[14rem] text-xs"
          />
        </label>
        <SubmitOnce className={`${SHOW_OPS_GHOST_BTN} ${compact ? "px-3 py-1.5 text-xs" : ""}`}>
          {proofUrl ? "Replace photo" : "Upload proof"}
        </SubmitOnce>
      </form>
    </div>
  );
}
