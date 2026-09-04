"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

import { decideNoShowChargeAction, uploadNoShowProofAction } from "@/app/dashboard/show-ops/actions";
import { SHOW_OPS_GHOST_BTN, SHOW_OPS_PRIMARY_BTN } from "@/components/show-ops/show-ops-page-header";
import { SubmitOnce } from "@/components/show-ops/submit-once";
import type { ShowOpsNoShowCharge } from "@/lib/show-ops/calc";

const PROOF_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif";

export function NoShowDecisionForm({
  bookingId,
  charge,
  missing,
  booked,
  invoiced,
  proofUrl,
  compact = false,
  photo = true,
}: {
  bookingId: string;
  charge: ShowOpsNoShowCharge | null;
  missing: number;
  booked: number;
  invoiced?: boolean;
  proofUrl?: string | null;
  compact?: boolean;
  /** Pass false when a <TicketPhotoControl> sits next to this form, so the photo is not offered twice. */
  photo?: boolean;
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
      {photo && proofUrl ? (
        <a href={proofUrl} target="_blank" rel="noreferrer" className="block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={proofUrl} alt="No-show ticket photo" className="h-20 w-auto rounded-lg ring-1 ring-slate-200" />
        </a>
      ) : null}
      {photo ? (
        <form action={uploadNoShowProofAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="booking_id" value={bookingId} />
          <label className="text-[11px] font-medium text-slate-600">
            Ticket photo
            <input name="proof" type="file" accept={PROOF_ACCEPT} required className="mt-0.5 block max-w-[14rem] text-xs" />
          </label>
          <SubmitOnce className={`${SHOW_OPS_GHOST_BTN} ${compact ? "px-3 py-1.5 text-xs" : ""}`}>
            {proofUrl ? "Replace photo" : "Upload proof"}
          </SubmitOnce>
        </form>
      ) : null}
    </div>
  );
}

/**
 * Ticket photo on any booking, whether or not anyone is missing.
 *
 * Joel: the partner invoice needs the ticket stub even when the whole party
 * showed. One tap picks or takes the photo and it uploads on its own; once a
 * photo is on the booking the row says so and offers a Replace.
 *
 * Remount with `key={no_show_proof_path}` so the Replace state resets after
 * an upload lands.
 */
export function TicketPhotoControl({
  bookingId,
  proofUrl,
  big = false,
}: {
  bookingId: string;
  proofUrl?: string | null;
  /** Door mode on a phone — 44px tap target. */
  big?: boolean;
}) {
  const [replacing, setReplacing] = useState(false);
  const attached = Boolean(proofUrl);
  const picking = !attached || replacing;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {attached ? (
        <a
          href={proofUrl ?? undefined}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={proofUrl ?? undefined} alt="" className="h-8 w-auto rounded ring-1 ring-emerald-200 print:hidden" />
          Photo attached ✓
        </a>
      ) : null}
      {attached && !replacing ? (
        <button type="button" onClick={() => setReplacing(true)} className="text-xs text-slate-500 underline print:hidden">
          Replace
        </button>
      ) : null}
      {picking ? (
        <form action={uploadNoShowProofAction} className="flex flex-wrap items-center gap-2 print:hidden">
          <input type="hidden" name="booking_id" value={bookingId} />
          <PhotoPicker label={attached ? "Choose new photo" : "Ticket photo"} big={big} />
          {attached ? (
            <button type="button" onClick={() => setReplacing(false)} className="text-xs text-slate-500 underline">
              Keep current
            </button>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}

/** A file input dressed as a button; submits its form as soon as a photo is chosen. */
function PhotoPicker({ label, big }: { label: string; big: boolean }) {
  const { pending } = useFormStatus();
  const size = big ? "min-h-[44px] px-4 py-2.5 text-sm" : "px-2.5 py-1 text-xs";
  return (
    <label
      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-white font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 ${size} ${
        pending ? "pointer-events-none opacity-60" : ""
      }`}
    >
      <span aria-hidden>📷</span>
      {pending ? "Uploading…" : label}
      <input
        name="proof"
        type="file"
        accept={PROOF_ACCEPT}
        required
        disabled={pending}
        className="sr-only"
        onChange={(e) => {
          if (e.currentTarget.files?.length) e.currentTarget.form?.requestSubmit();
        }}
      />
    </label>
  );
}
