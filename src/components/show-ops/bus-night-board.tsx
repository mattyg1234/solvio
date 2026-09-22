"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getBusNightOrderAction,
  saveBusNightOrderAction,
} from "@/app/dashboard/show-ops/actions-bus";
import { showOpsDayName } from "@/lib/show-ops/calc";
export function BusNightBoard({
  date,
  island,
  stops,
}: {
  date: string;
  island: string;
  stops: { id: string; label: string }[];
}) {
  const [ids, setIds] = useState(stops.map((s) => s.id));
  const [drag, setDrag] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [note, setNote] = useState("");
  const [savedAt, setSavedAt] = useState("");
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    let alive = true;
    getBusNightOrderAction(date)
      .then((result) => {
        if (!alive) return;
        if (!result.ok) {
          setNote(result.message);
          return;
        }
        const saved =
          result.sheet.orders.find((row) => row.island === island)?.stop_ids ??
          [];
        setIds([
          ...saved.filter((id) => stops.some((stop) => stop.id === id)),
          ...stops.map((stop) => stop.id).filter((id) => !saved.includes(id)),
        ]);
        setReady(true);
      })
      .catch(() => {
        if (alive)
          setNote("Could not load the saved order. Refresh before editing.");
      });
    return () => {
      alive = false;
    };
  }, [date, island, stops]);
  const move = (from: number, to: number) => {
    if (from < 0 || to < 0 || to >= ids.length) return;
    const next = [...ids];
    next.splice(to, 0, ...next.splice(from, 1));
    setIds(next);
    setDirty(true);
    setNote("");
  };
  const href = `/dashboard/show-ops/lists?tab=bus&date=${date}&island=${encodeURIComponent(island)}`;
  return (
    <div className="mt-4 rounded-xl bg-amber-50 p-3 ring-2 ring-amber-400 print:hidden">
      <h3 className="inline-block rounded-md bg-amber-500 px-3 py-1 text-xl font-black uppercase tracking-wide text-black">
        Next bus pick-up order
      </h3>
      <p className="mt-2 text-xl font-black text-slate-900">
        {[showOpsDayName(date), date].filter(Boolean).join(" ")} · {island}
      </p>
      <p className="mt-1 text-xs font-semibold text-amber-900">
        TONIGHT ONLY. Drag or use the arrows, then save. This order is shared with the
        printed, downloaded and emailed bus list. The permanent bus table above is not changed.
      </p>
      <ol className="my-3 space-y-1">
        {ids.map((id, index) => (
          <li
            key={id}
            draggable={ready && !busy}
            onDragStart={() => setDrag(id)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (drag) move(ids.indexOf(drag), index);
              setDrag(null);
            }}
            className="flex items-center gap-2 rounded-lg bg-white p-2 text-sm"
          >
            <span className="flex-1">
              {index + 1}. {stops.find((stop) => stop.id === id)?.label}
            </span>
            <button
              type="button"
              disabled={!ready || busy || index === 0}
              aria-label="Move pickup earlier"
              onClick={() => move(index, index - 1)}
              className="px-2 disabled:opacity-30"
            >
              ↑
            </button>
            <button
              type="button"
              disabled={!ready || busy || index === ids.length - 1}
              aria-label="Move pickup later"
              onClick={() => move(index, index + 1)}
              className="px-2 disabled:opacity-30"
            >
              ↓
            </button>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-3">
        {confirming ? (
          <span className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-amber-400">
            <span className="text-sm font-bold text-slate-900">
              Save this as tonight&apos;s bus board for {[showOpsDayName(date), date].filter(Boolean).join(" ")} · {island}?
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const result = await saveBusNightOrderAction(date, island, ids);
                  if (result.ok) {
                    setDirty(false);
                    setConfirming(false);
                    setSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
                    setNote("");
                  } else setNote(result.message);
                } catch {
                  setNote("Could not save. Try again.");
                } finally {
                  setBusy(false);
                }
              }}
              className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-bold text-white disabled:opacity-40"
            >
              {busy ? "Saving…" : "Yes, save tonight's board"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirming(false)}
              className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 ring-1 ring-slate-300"
            >
              No, keep editing
            </button>
          </span>
        ) : (
          <button
            type="button"
            disabled={!ready || busy || !dirty}
            onClick={() => setConfirming(true)}
            className="rounded-lg bg-violet-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            Save tonight’s order
          </button>
        )}
        {!dirty ? (
          <Link
            href={href}
            className="text-sm font-semibold text-violet-700 underline"
          >
            Print, download or send bus list
          </Link>
        ) : (
          <span className="text-xs text-amber-800">
            Unsaved changes — save before sharing.
          </span>
        )}
      </div>
      {savedAt && !dirty ? (
        <p role="status" className="mt-3 rounded-lg bg-emerald-100 px-3 py-2 text-sm font-bold text-emerald-900">
          ✓ TONIGHT&apos;S BUS BOARD SAVED at {savedAt} for {[showOpsDayName(date), date].filter(Boolean).join(" ")} · {island}. The bus list now uses this order.
        </p>
      ) : null}
      {note ? (
        <p role="status" className="mt-2 text-sm font-semibold text-rose-700">
          {note}
        </p>
      ) : null}
      <Link
        href="/dashboard/show-ops/master?tab=stops"
        className="mt-3 inline-block text-xs text-slate-600 underline"
      >
        Edit pickup times, guide notes and photos in Pickup points
      </Link>
    </div>
  );
}
