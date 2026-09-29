"use client";

import { Loader2, Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import type { ChatBookingSearchHit } from "@/lib/show-ops/chat/types";
import { cn } from "@/lib/utils";

function shortDay(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "2-digit" }).format(d);
}

/** Find a booking by reference or customer name to attach to a message. */
export function ChatBookingPicker({
  onPick,
  onClose,
}: {
  onPick: (hit: ChatBookingSearchHit) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<ChatBookingSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const ctrl = new AbortController();
    const t = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/show-ops/chat/bookings?q=${encodeURIComponent(term)}`, {
          cache: "no-store",
          signal: ctrl.signal,
        });
        const body = (await res.json().catch(() => ({}))) as { bookings?: ChatBookingSearchHit[]; error?: string };
        if (!res.ok) throw new Error(body.error || "Could not search bookings.");
        setHits(body.bookings ?? []);
      } catch (e) {
        if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : "Could not search bookings.");
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      ctrl.abort();
      window.clearTimeout(t);
    };
  }, [q]);

  const term = q.trim();
  const shown = term.length >= 2 ? hits : [];

  return (
    <div className="mb-2 rounded-xl bg-white p-2 shadow-lg ring-1 ring-slate-200">
      <div className="flex items-center gap-2">
        <label htmlFor={`${listId}-q`} className="sr-only">
          Search bookings
        </label>
        <span className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            id={`${listId}-q`}
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
            }}
            placeholder="Booking ref or customer name"
            autoComplete="off"
            className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
          />
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          aria-label="Close booking search"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="mt-1 max-h-60 overflow-y-auto" aria-live="polite">
        {term.length < 2 ? (
          <p className="px-2 py-2 text-xs text-slate-500">Type at least two letters.</p>
        ) : loading && !shown.length ? (
          <p className="flex items-center gap-2 px-2 py-2 text-xs text-slate-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Searching…
          </p>
        ) : error ? (
          <p className="px-2 py-2 text-xs text-rose-700">{error}</p>
        ) : !shown.length ? (
          <p className="px-2 py-2 text-xs text-slate-500">No bookings match.</p>
        ) : (
          <ul className="grid gap-0.5">
            {shown.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  onClick={() => onPick(h)}
                  className={cn("flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-violet-50")}
                >
                  <span className="shrink-0 font-mono text-xs font-semibold text-slate-600">{h.ref}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-900">{h.guestName || "—"}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {h.showName} · {shortDay(h.showDate)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
