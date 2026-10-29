"use client";

import Link from "next/link";

import { SHOW_OPS_GHOST_BTN, SHOW_OPS_PRIMARY_BTN } from "@/components/show-ops/show-ops-page-header";

/**
 * A refused or failed action used to land on Next's bare "Application error" screen with no way back.
 * Production builds hide the server's message, so this says what is safe to say and shows the reference
 * the Vercel logs carry for that failure.
 */
export default function ShowOpsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg space-y-3 rounded-2xl bg-white p-6 text-sm ring-1 ring-slate-200">
      <h1 className="text-base font-semibold text-slate-900">That didn&apos;t go through</h1>
      <p className="text-slate-600">
        The Hub hit a problem with the last thing you did, or refused it. Go back and check whether it saved before you try again.
      </p>
      {process.env.NODE_ENV !== "production" && error.message ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 font-mono text-xs text-rose-800">{error.message}</p>
      ) : null}
      {error.digest ? (
        <p className="text-xs text-slate-500">
          If it keeps happening, send Matty this reference: <span className="font-mono text-slate-700">{error.digest}</span>
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={reset} className={SHOW_OPS_PRIMARY_BTN}>
          Try again
        </button>
        <Link href="/dashboard/show-ops" className={SHOW_OPS_GHOST_BTN}>
          Back to the Hub
        </Link>
      </div>
    </div>
  );
}
