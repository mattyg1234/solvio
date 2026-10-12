"use client";

import { AlertTriangle, CopyCheck, ExternalLink, Loader2, Mail } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  linkEmailToBookingAction,
  markEmailHandledAction,
  saveEmailFieldsAction,
  saveEmailNotesAction,
  setEmailStatusAction,
} from "@/app/dashboard/show-ops/email-bookings/actions";
import { SHOW_OPS_GHOST_BTN, SHOW_OPS_PRIMARY_BTN } from "@/components/show-ops/show-ops-page-header";
import type { BookingMatch } from "@/lib/show-ops/email-bookings/mapping";
import { EMAIL_FIELD_LABELS, EMAIL_NUMBER_FIELDS, type EmailKind, type ExtractedBooking, type InboundEmailRow } from "@/lib/show-ops/email-bookings/types";
import { cn } from "@/lib/utils";

import { relativeTime } from "./relative-time";

export const KIND_LABEL: Record<EmailKind, { label: string; className: string }> = {
  new: { label: "New booking", className: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  change: { label: "Change", className: "bg-amber-50 text-amber-900 ring-amber-200" },
  cancel: { label: "Cancellation", className: "bg-rose-50 text-rose-800 ring-rose-200" },
  question: { label: "Question", className: "bg-violet-50 text-violet-800 ring-violet-200" },
  "not-booking": { label: "Not a booking", className: "bg-slate-100 text-slate-700 ring-slate-200" },
};

export function KindPill({ kind }: { kind: EmailKind }) {
  const k = KIND_LABEL[kind];
  return <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", k.className)}>{k.label}</span>;
}

const READER_LABEL: Record<string, string> = {
  template: "Read exactly (known layout)",
  ai: "Read by AI",
  pattern: "Read by simple patterns: check every field",
};

export type DetailMatch = BookingMatch & { diffs: string[] };

function Banner({ tone, children }: { tone: "info" | "warn"; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-xl px-4 py-2.5 text-sm ring-1",
        tone === "warn" ? "bg-amber-50 text-amber-900 ring-amber-200" : "bg-violet-50 text-violet-900 ring-violet-200",
      )}
    >
      {tone === "warn" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <CopyCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
      <div>{children}</div>
    </div>
  );
}

const FIELD_ORDER: (keyof ExtractedBooking)[] = [
  "reference",
  "partner",
  "service",
  "date",
  "time",
  "name",
  "adults",
  "children",
  "infants",
  "quantity",
  "location",
  "phone",
  "email",
  "language",
  "amount",
  "paid",
  "paymentMethod",
  "net",
  "requests",
];

/** One email: what was read (every field editable), the booking it may already be, and what to do with it. */
export function EmailDetail({
  email,
  matches,
  linked,
  matchOnly,
}: {
  email: InboundEmailRow;
  matches: DetailMatch[];
  linked: { id: string; booking_ref: string } | null;
  matchOnly: boolean;
}) {
  const router = useRouter();
  const [fields, setFields] = useState<ExtractedBooking>(email.extracted);
  const [dirty, setDirty] = useState(false);
  const [notes, setNotes] = useState(email.notes ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const done = email.status !== "review";
  const isBooking = email.kind === "new" || email.kind === "change" || email.kind === "cancel";
  const same = matches.filter((m) => m.kind === "same" && !m.booking.cancelled_at);
  const possible = matches.filter((m) => m.kind === "possible" || (m.kind === "same" && m.booking.cancelled_at));
  const addHref = `/dashboard/show-ops/bookings/new?email=${email.id}`;

  const run = (fn: () => Promise<{ ok: boolean; message?: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      setMessage(r.ok ? (r.message ?? null) : (r.message ?? "Couldn't do that."));
      if (r.ok) {
        after?.();
        router.refresh();
      }
    });

  /** Saves corrected fields first, so the prefilled form uses them. */
  function addBooking() {
    start(async () => {
      if (dirty) {
        const r = await saveEmailFieldsAction(email.id, fields);
        if (!r.ok) return setMessage(r.message ?? "Couldn't save the fields.");
        setDirty(false);
      }
      router.push(addHref);
    });
  }

  const link = (bookingId: string) => run(() => linkEmailToBookingAction(email.id, bookingId, notes !== (email.notes ?? "") ? notes : undefined));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <KindPill kind={email.kind} />
          {isBooking && (
            <span className={cn("text-xs font-semibold", email.confidence >= 0.9 ? "text-emerald-700" : "text-amber-700")}>
              {email.confidence >= 0.9 ? "Read clearly" : "Check the details"} · {Math.round(email.confidence * 100)}%
            </span>
          )}
          {email.reader && <span className="text-xs text-slate-500">{READER_LABEL[email.reader] ?? ""}</span>}
        </div>
        <h3 className="mt-2 text-base font-semibold text-slate-900">{email.subject}</h3>
        <p className="text-xs text-slate-500" suppressHydrationWarning>
          {email.from_name} &lt;{email.from_email}&gt; · {relativeTime(email.received_at)}
        </p>
      </div>

      {email.system_note && (
        <p className="flex items-start gap-2 rounded-xl bg-slate-50 px-4 py-2.5 text-sm text-slate-700 ring-1 ring-slate-200">
          <CopyCheck className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" aria-hidden /> {email.system_note}
          {linked ? (
            <Link href={`/dashboard/show-ops/bookings/${linked.id}`} className="ml-1 inline-flex items-center gap-1 font-semibold text-violet-700 hover:underline">
              Open {linked.booking_ref} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </Link>
          ) : null}
        </p>
      )}

      {!done && email.kind === "new" && same.length > 0 && (
        <Banner tone="info">
          This booking ({email.extracted.reference}) is already in the Hub as <strong>{same[0].booking.booking_ref}</strong>. Nothing new to add: mark it as a
          duplicate below.
        </Banner>
      )}
      {!done && isBooking && possible.length > 0 && same.length === 0 && (
        <Banner tone="warn">This looks like a booking that&rsquo;s already in the Hub. Check the list below before adding it twice.</Banner>
      )}
      {!done && (email.kind === "change" || email.kind === "cancel") && matches.length === 0 && (
        <Banner tone="warn">No matching booking found. It may have been booked before the inbox was connected, or under another name.</Banner>
      )}
      {!done && matchOnly && email.kind === "new" && (
        <Banner tone="info">{email.seller_name ?? "This partner"} phones bookings in first, so this email should match a booking that&rsquo;s already in the Hub.</Banner>
      )}

      {matches.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bookings in the Hub this may be</p>
          <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
            {matches.map((m) => (
              <li key={m.booking.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <Link href={`/dashboard/show-ops/bookings/${m.booking.id}`} className="font-semibold text-slate-900 hover:underline">
                    {m.booking.booking_ref} · {m.booking.guest_name}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {m.booking.show_date} · {m.booking.show_name ?? ""} · {m.booking.adults ?? 0}A {m.booking.children ?? 0}C {m.booking.infants ?? 0}I
                    {m.booking.supplier_name ? ` · ${m.booking.supplier_name}` : ""}
                    {m.booking.cancelled_at ? " · cancelled" : ""} · <span className="font-semibold">{m.why}</span>
                  </p>
                  {email.kind === "change" && m.diffs.length > 0 && <p className="mt-1 text-xs text-amber-800">The email says: {m.diffs.join(" · ")}</p>}
                </div>
                {!done && (
                  <div className="flex flex-wrap gap-2">
                    {email.kind === "new" && (
                      <button type="button" className={SHOW_OPS_GHOST_BTN} disabled={pending} onClick={() => link(m.booking.id)}>
                        {m.kind === "same" ? "Mark as duplicate" : "Same booking: match"}
                      </button>
                    )}
                    {(email.kind === "change" || email.kind === "cancel") && (
                      <>
                        <Link href={`/dashboard/show-ops/bookings/${m.booking.id}`} className={SHOW_OPS_GHOST_BTN}>
                          {email.kind === "cancel" ? "Open to cancel" : "Open to change"}
                        </Link>
                        <button type="button" className={SHOW_OPS_PRIMARY_BTN} disabled={pending} onClick={() => run(() => markEmailHandledAction(email.id, m.booking.id))}>
                          Done: handled
                        </button>
                      </>
                    )}
                    {email.kind === "question" && (
                      <button type="button" className={SHOW_OPS_GHOST_BTN} disabled={pending} onClick={() => link(m.booking.id)}>
                        Link
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-2">
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-3 font-sans text-sm text-slate-700 ring-1 ring-slate-200">
          {email.body || "(Only the subject was kept: this email isn't a booking.)"}
        </pre>

        {!isBooking ? (
          <p className="text-sm text-slate-500">{email.kind === "question" ? "A question, not a booking. Answer it from the inbox itself." : "Not a booking, so nothing was read from it."}</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
              <Mail className="h-3.5 w-3.5" aria-hidden /> What the Hub read {done ? "" : "(correct anything before adding)"}
            </p>
            {FIELD_ORDER.map((f) => {
              const v = fields[f];
              const numeric = EMAIL_NUMBER_FIELDS.includes(f);
              return (
                <label key={f} className="grid grid-cols-[8.5rem_minmax(0,1fr)] items-center gap-2 text-sm">
                  <span className="text-xs text-slate-500">{EMAIL_FIELD_LABELS[f]}</span>
                  <input
                    type={f === "date" ? "date" : f === "time" ? "time" : "text"}
                    inputMode={numeric ? "decimal" : undefined}
                    value={v === undefined ? "" : String(v)}
                    disabled={done}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const val = numeric ? (raw === "" ? undefined : Number(raw.replace(",", "."))) : raw || undefined;
                      setFields((prev) => ({ ...prev, [f]: numeric && Number.isNaN(val) ? prev[f] : val }));
                      setDirty(true);
                    }}
                    className={cn(
                      "h-8 rounded-md border border-slate-200 px-2 outline-none focus:border-[var(--show-ops-primary,#7c3aed)] disabled:bg-transparent",
                      v === undefined || v === "" ? "text-slate-400" : "text-slate-900",
                    )}
                  />
                </label>
              );
            })}
            {!done && dirty && (
              <div className="mt-1 flex gap-2">
                <button
                  type="button"
                  className={SHOW_OPS_GHOST_BTN}
                  disabled={pending}
                  onClick={() => run(() => saveEmailFieldsAction(email.id, fields), () => setDirty(false))}
                >
                  Save corrections
                </button>
                <button type="button" className="text-sm font-semibold text-slate-500" onClick={() => (setFields(email.extracted), setDirty(false))}>
                  Undo
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
        Notes on this email
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Called the guest to confirm the hotel"
          className="rounded-lg border border-slate-200 p-2.5 text-sm font-normal outline-none focus:border-[var(--show-ops-primary,#7c3aed)]"
        />
        {notes !== (email.notes ?? "") && (
          <button type="button" className={cn(SHOW_OPS_GHOST_BTN, "self-start")} disabled={pending} onClick={() => run(() => saveEmailNotesAction(email.id, notes))}>
            Save note
          </button>
        )}
      </label>

      {message && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700 ring-1 ring-slate-200" role="status">
          {message}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {pending && <Loader2 className="h-4 w-4 animate-spin text-slate-400" aria-hidden />}
        {done ? (
          <>
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1",
                email.status === "added" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-slate-100 text-slate-600 ring-slate-200",
              )}
            >
              {email.status === "added" ? "Done" : "Skipped"}
            </span>
            {!(email.status === "added" && linked) && (
              <button type="button" className={SHOW_OPS_GHOST_BTN} disabled={pending} onClick={() => run(() => setEmailStatusAction(email.id, "review"))}>
                Check it again
              </button>
            )}
          </>
        ) : (
          <>
            {email.kind === "new" && same.length === 0 && (
              <button type="button" className={matchOnly ? SHOW_OPS_GHOST_BTN : SHOW_OPS_PRIMARY_BTN} disabled={pending} onClick={addBooking}>
                {matchOnly ? "Not phoned in? Add it as a booking" : possible.length ? "Different booking: add it" : "Add booking"}
              </button>
            )}
            {email.kind === "change" && matches.length === 0 && (
              <button type="button" className={SHOW_OPS_GHOST_BTN} disabled={pending} onClick={addBooking}>
                Add as a new booking
              </button>
            )}
            {(email.kind === "cancel" || email.kind === "change" || email.kind === "question") && matches.length === 0 && (
              <button type="button" className={SHOW_OPS_PRIMARY_BTN} disabled={pending} onClick={() => run(() => markEmailHandledAction(email.id, null))}>
                Mark as handled
              </button>
            )}
            <button type="button" className={SHOW_OPS_GHOST_BTN} disabled={pending} onClick={() => run(() => setEmailStatusAction(email.id, "ignored"))}>
              Skip
            </button>
          </>
        )}
      </div>
    </div>
  );
}
