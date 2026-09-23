"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  clearBusNightOrderAction,
  getBusNightOrderAction,
  saveBusNightOrderAction,
} from "@/app/dashboard/show-ops/actions-bus";
import { showOpsDayName } from "@/lib/show-ops/calc";

export type BusNightBoardStop = {
  id: string;
  label: string;
  /** Permanent pick-up time from the bus table, HH:MM or "". */
  time: string;
  /** Coach number on islands that run more than one. */
  bus: number;
};

/**
 * Tonight's bus board for one island: the running order AND the pick-up times for
 * that night only. Arrows step to other nights, the place switches island, and on
 * two-bus islands each coach has its own board. Reset drops tonight's row so the
 * board goes back to the permanent bus table.
 */
export function BusNightBoard({
  date,
  island,
  stops,
  buses = 1,
  prevHref,
  nextHref,
  todayHref,
  isToday,
  places = [],
}: {
  date: string;
  island: string;
  stops: BusNightBoardStop[];
  buses?: number;
  prevHref: string;
  nextHref: string;
  todayHref: string;
  isToday: boolean;
  /** Other islands this board can switch to (label + href). */
  places?: { island: string; href: string }[];
}) {
  const [ids, setIds] = useState(stops.map((s) => s.id));
  const [times, setTimes] = useState<Record<string, string>>({});
  const [busNo, setBusNo] = useState(1);
  const [drag, setDrag] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState(false);
  const [note, setNote] = useState("");
  const [savedAt, setSavedAt] = useState("");
  const [confirming, setConfirming] = useState<"save" | "reset" | null>(null);
  const stopById = useMemo(() => new Map(stops.map((s) => [s.id, s])), [stops]);
  const multi = buses > 1;

  useEffect(() => {
    let alive = true;
    getBusNightOrderAction(date)
      .then((result) => {
        if (!alive) return;
        if (!result.ok) {
          setNote(result.message);
          return;
        }
        const row = result.sheet.orders.find((o) => o.island === island);
        const savedIds = row?.stop_ids ?? [];
        setIds([
          ...savedIds.filter((id) => stops.some((stop) => stop.id === id)),
          ...stops.map((stop) => stop.id).filter((id) => !savedIds.includes(id)),
        ]);
        setTimes(row?.stop_times ?? {});
        setSaved(Boolean(row));
        setReady(true);
      })
      .catch(() => {
        if (alive) setNote("Could not load the saved board. Refresh before editing.");
      });
    return () => {
      alive = false;
    };
  }, [date, island, stops]);

  /** Rows on the coach being shown, in tonight's order. */
  const visible = ids.filter((id) => !multi || (stopById.get(id)?.bus ?? 1) === busNo);
  const move = (id: string, delta: number) => {
    const vi = visible.indexOf(id);
    const target = visible[vi + delta];
    if (vi < 0 || !target) return;
    const next = [...ids];
    const from = next.indexOf(id);
    next.splice(from, 1);
    next.splice(next.indexOf(target) + (delta > 0 ? 1 : 0), 0, id);
    setIds(next);
    setDirty(true);
    setNote("");
  };
  const drop = (targetId: string) => {
    if (!drag || drag === targetId) return;
    const next = [...ids];
    next.splice(next.indexOf(drag), 1);
    next.splice(next.indexOf(targetId), 0, drag);
    setIds(next);
    setDirty(true);
    setDrag(null);
  };
  const setTime = (id: string, value: string) => {
    setTimes((t) => ({ ...t, [id]: value }));
    setDirty(true);
    setNote("");
  };

  const changedTimes = Object.entries(times).filter(([id, t]) => t && t !== (stopById.get(id)?.time ?? "")).length;
  const when = [showOpsDayName(date), date].filter(Boolean).join(" ");
  const listHref = `/dashboard/show-ops/lists?tab=bus&date=${date}&island=${encodeURIComponent(island)}`;

  async function save() {
    setBusy(true);
    try {
      // Blank or unchanged inputs clear the override so the permanent time shows again.
      const payload: Record<string, string> = {};
      for (const s of stops) {
        const t = (times[s.id] ?? "").slice(0, 5);
        payload[s.id] = t && t !== s.time ? t : "";
      }
      const result = await saveBusNightOrderAction(date, island, ids, payload);
      if (result.ok) {
        setDirty(false);
        setSaved(true);
        setConfirming(null);
        setSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
        setNote("");
      } else setNote(result.message);
    } catch {
      setNote("Could not save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    setBusy(true);
    try {
      const result = await clearBusNightOrderAction(date, island);
      if (result.ok) {
        setIds(stops.map((s) => s.id));
        setTimes({});
        setDirty(false);
        setSaved(false);
        setConfirming(null);
        setSavedAt("");
        setNote("Back to the permanent bus table for this night.");
      } else setNote(result.message);
    } catch {
      setNote("Could not reset. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const arrow = "rounded-lg bg-white px-3 py-1.5 text-lg font-black leading-none text-slate-900 ring-1 ring-amber-400 hover:bg-amber-100";

  return (
    <div className="mt-4 rounded-xl bg-amber-50 p-3 ring-2 ring-amber-400 print:hidden">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="inline-block rounded-md bg-amber-500 px-3 py-1 text-xl font-black uppercase tracking-wide text-black">
          {isToday ? "Tonight's bus" : "Bus board"}
        </h3>
        <Link href={prevHref} aria-label="Previous night" className={arrow}>
          ‹
        </Link>
        <span className="text-xl font-black text-slate-900">{when}</span>
        <Link href={nextHref} aria-label="Next night" className={arrow}>
          ›
        </Link>
        {!isToday ? (
          <Link href={todayHref} className="rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-300">
            Tonight
          </Link>
        ) : null}
        <span className="text-xl font-black text-slate-400">·</span>
        {places.length > 1 ? (
          <span className="inline-flex flex-wrap gap-1">
            {places.map((p) => (
              <Link
                key={p.island}
                href={p.href}
                aria-current={p.island === island ? "page" : undefined}
                className={`rounded-full px-3 py-1 text-sm font-bold ring-1 ${
                  p.island === island ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-100"
                }`}
              >
                {p.island}
              </Link>
            ))}
          </span>
        ) : (
          <span className="text-xl font-black text-slate-900">{island}</span>
        )}
        {multi ? (
          <>
            <span className="text-xl font-black text-slate-400">·</span>
            <span className="inline-flex overflow-hidden rounded-lg ring-1 ring-slate-300">
              {Array.from({ length: buses }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setBusNo(n)}
                  aria-pressed={busNo === n}
                  className={`px-3 py-1 text-sm font-bold ${busNo === n ? "bg-sky-700 text-white" : "bg-white text-slate-700 hover:bg-sky-50"}`}
                >
                  Bus {n}
                </button>
              ))}
            </span>
            <span className="text-sm font-bold text-slate-700">
              {busNo}/{buses}
            </span>
          </>
        ) : null}
      </div>
      <p className="mt-2 text-xs font-semibold text-amber-900">
        THIS NIGHT ONLY. Drag or use the arrows to change the order, type a new time to change a pick-up for this night,
        then save. Printed, downloaded and emailed bus lists use this board. Reset puts it back to the permanent bus table.
      </p>
      <ol className="my-3 space-y-1">
        {visible.map((id, index) => {
          const s = stopById.get(id);
          if (!s) return null;
          const shown = times[id] ?? "";
          const changed = Boolean(shown) && shown !== s.time;
          return (
            <li
              key={id}
              draggable={ready && !busy}
              onDragStart={() => setDrag(id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => drop(id)}
              className="flex flex-wrap items-center gap-2 rounded-lg bg-white p-2 text-sm"
            >
              <span className="w-6 text-right text-xs font-bold tabular-nums text-slate-500">{index + 1}.</span>
              <label className="flex items-center gap-1">
                <input
                  type="time"
                  value={shown || s.time}
                  disabled={!ready || busy}
                  onChange={(e) => setTime(id, e.target.value)}
                  aria-label={`Pick-up time for ${s.label}`}
                  className={`w-24 rounded-md border px-1.5 py-1 text-sm tabular-nums ${changed ? "border-rose-400 bg-rose-50 font-bold text-rose-900" : "border-slate-200"}`}
                />
                {changed ? (
                  <span className="text-[11px] text-slate-500">
                    was {s.time || "—"}{" "}
                    <button type="button" className="underline" onClick={() => setTime(id, "")}>
                      undo
                    </button>
                  </span>
                ) : null}
              </label>
              <span className="min-w-0 flex-1">{s.label}</span>
              <button
                type="button"
                disabled={!ready || busy || index === 0}
                aria-label="Move pickup earlier"
                onClick={() => move(id, -1)}
                className="px-2 disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                disabled={!ready || busy || index === visible.length - 1}
                aria-label="Move pickup later"
                onClick={() => move(id, 1)}
                className="px-2 disabled:opacity-30"
              >
                ↓
              </button>
            </li>
          );
        })}
        {!visible.length ? <li className="rounded-lg bg-white p-2 text-sm text-slate-500">No stops on this coach.</li> : null}
      </ol>
      <div className="flex flex-wrap items-center gap-3">
        {confirming === "save" ? (
          <span className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-amber-400">
            <span className="text-sm font-bold text-slate-900">
              Save this board for {when} · {island}
              {changedTimes ? ` (${changedTimes} time change${changedTimes === 1 ? "" : "s"})` : ""}?
            </span>
            <button type="button" disabled={busy} onClick={() => void save()} className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-bold text-white disabled:opacity-40">
              {busy ? "Saving…" : "Yes, save this night's board"}
            </button>
            <button type="button" disabled={busy} onClick={() => setConfirming(null)} className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 ring-1 ring-slate-300">
              No, keep editing
            </button>
          </span>
        ) : confirming === "reset" ? (
          <span className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-rose-300">
            <span className="text-sm font-bold text-slate-900">Throw away this night&apos;s order and times for {island} and go back to the permanent bus table?</span>
            <button type="button" disabled={busy} onClick={() => void reset()} className="rounded-lg bg-rose-700 px-3 py-1.5 text-sm font-bold text-white disabled:opacity-40">
              {busy ? "Resetting…" : "Yes, reset"}
            </button>
            <button type="button" disabled={busy} onClick={() => setConfirming(null)} className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 ring-1 ring-slate-300">
              Cancel
            </button>
          </span>
        ) : (
          <>
            <button
              type="button"
              disabled={!ready || busy || !dirty}
              onClick={() => setConfirming("save")}
              className="rounded-lg bg-violet-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              Save this night&apos;s board
            </button>
            <button
              type="button"
              disabled={!ready || busy || (!saved && !dirty)}
              onClick={() => setConfirming("reset")}
              className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-rose-800 ring-1 ring-rose-300 disabled:opacity-40"
            >
              Reset to permanent bus table
            </button>
          </>
        )}
        {!dirty ? (
          <Link href={listHref} className="text-sm font-semibold text-violet-700 underline">
            Print, download or send bus list
          </Link>
        ) : (
          <span className="text-xs text-amber-800">Unsaved changes — save before sharing.</span>
        )}
      </div>
      {savedAt && !dirty ? (
        <p role="status" className="mt-3 rounded-lg bg-emerald-100 px-3 py-2 text-sm font-bold text-emerald-900">
          ✓ BOARD SAVED at {savedAt} for {when} · {island}. The bus list now uses this order and these times.
        </p>
      ) : saved && !dirty ? (
        <p className="mt-3 text-xs font-semibold text-violet-800">This night has a saved board (order{changedTimes ? " and times" : ""} differ from the permanent table).</p>
      ) : null}
      {note ? (
        <p role="status" className="mt-2 text-sm font-semibold text-rose-700">
          {note}
        </p>
      ) : null}
      <Link href="/dashboard/show-ops/master?tab=stops" className="mt-3 inline-block text-xs text-slate-600 underline">
        Permanent pick-up times, guide notes and photos live in Pickup points
      </Link>
    </div>
  );
}
