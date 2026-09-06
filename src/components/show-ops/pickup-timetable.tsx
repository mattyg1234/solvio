"use client";

import { useMemo, useState } from "react";

import { reorderBusStopsAction, upsertBusStopAction } from "@/app/dashboard/show-ops/actions";
import { PrintButton } from "@/components/show-ops/print-button";
import { SubmitOnce } from "@/components/show-ops/submit-once";
import { SHOW_OPS_GHOST_BTN, SHOW_OPS_PRIMARY_BTN } from "@/components/show-ops/show-ops-page-header";
import type { DirectoryPickupStop } from "@/components/show-ops/pickup-points-directory";

const INPUT = "mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm";

function hhmm(t: string | null | undefined): string {
  return t ? String(t).slice(0, 5) : "";
}

/**
 * The permanent pick-up timetable for one island, living on the Bus board so
 * the stops, their times and the run order are edited where the buses are
 * planned. Drag a row to change the permanent order, edit a stop in place,
 * download the timetable as a spreadsheet or print / send it from the browser.
 * Tonight-only changes still happen on the night's bus list.
 */
export function PickupTimetable({
  island,
  date,
  stops,
  hotelsByStop,
  paxByStop,
  runningTonight,
  islands,
  canManage,
  next,
}: {
  island: string;
  date: string;
  stops: DirectoryPickupStop[];
  hotelsByStop: Record<string, number>;
  paxByStop: Record<string, number>;
  runningTonight: Record<string, boolean>;
  islands: string[];
  canManage: boolean;
  /** Where the stop form returns to after saving. */
  next: string;
}) {
  const sorted = useMemo(
    () => [...stops].sort((a, b) => a.sort_order - b.sort_order || a.stop_name.localeCompare(b.stop_name)),
    [stops],
  );
  const [ids, setIds] = useState(() => sorted.map((s) => s.id));
  const [dragId, setDragId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const byId = useMemo(() => new Map(sorted.map((s) => [s.id, s])), [sorted]);
  const rows = ids.map((id) => byId.get(id)).filter((s): s is DirectoryPickupStop => Boolean(s));

  function onDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    setIds((list) => {
      const next = [...list];
      const from = next.indexOf(dragId);
      const to = next.indexOf(targetId);
      if (from < 0 || to < 0) return list;
      next.splice(to, 0, ...next.splice(from, 1));
      return next;
    });
    setDirty(true);
    setDragId(null);
  }

  function move(id: string, delta: number) {
    setIds((list) => {
      const from = list.indexOf(id);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= list.length) return list;
      const next = [...list];
      next.splice(to, 0, ...next.splice(from, 1));
      return next;
    });
    setDirty(true);
  }

  function downloadCsv() {
    const cell = (v: unknown) => {
      const raw = String(v ?? "");
      const safe = /^[\s]*[=+@-]/.test(raw) ? `'${raw}` : raw;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const lines = [
      ["Order", "Island", "Resort", "Stop", "Pick-up time", "Runs", "Hotels", "Guide notes", "Map link"].map(cell).join(","),
      ...rows.map((s, i) =>
        [i + 1, s.island, s.resort, s.stop_name, hhmm(s.pickup_time), s.runs_on || "every night", hotelsByStop[s.id] ?? 0, s.guide_notes ?? "", s.map_url ?? ""]
          .map(cell)
          .join(","),
      ),
    ];
    const blob = new Blob([`﻿${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pickup-timetable-${island.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Permanent pick-up timetable · {rows.length} stop{rows.length === 1 ? "" : "s"}
          </p>
          <p className="text-[11px] text-slate-500">
            {canManage
              ? "Drag a row (or use the arrows) to change the permanent order, then save. Edit a stop in place. Tonight-only changes go on the night's bus list."
              : "The permanent order. Owners and admins can drag to reorder and edit stops."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={downloadCsv} className={SHOW_OPS_GHOST_BTN}>
            Download (CSV)
          </button>
          <PrintButton label="Print / send" />
          {canManage ? (
            <button type="button" onClick={() => setAdding((a) => !a)} className={SHOW_OPS_PRIMARY_BTN}>
              {adding ? "Close" : "Add pick-up point"}
            </button>
          ) : null}
        </div>
      </div>

      {adding ? (
        <div className="mt-2 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200 print:hidden">
          <StopForm
            islands={islands}
            next={next}
            initial={{
              id: "",
              island,
              zone: null,
              resort: "",
              stop_name: "",
              pickup_time: null,
              sort_order: (rows.length + 1) * 10,
              runs_on: null,
              guide_notes: null,
              active: true,
              map_url: null,
              photo_url: null,
            }}
            onDone={() => setAdding(false)}
          />
        </div>
      ) : null}

      <div className="mt-2 hidden print:block">
        <h4 className="text-base font-semibold">Pick-up timetable · {island}</h4>
        <p className="text-xs text-slate-500">Permanent order · printed {date}</p>
      </div>

      <div className="mt-2 overflow-hidden rounded-xl ring-1 ring-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 w-10">#</th>
              <th className="px-3 py-2">Resort</th>
              <th className="px-3 py-2">Stop</th>
              <th className="px-3 py-2 text-right">Time</th>
              <th className="px-3 py-2">Runs</th>
              <th className="px-3 py-2 text-right">Tonight</th>
              <th className="px-3 py-2 text-right">Hotels</th>
              <th className="px-3 py-2">Guide notes</th>
              <th className="px-3 py-2 print:hidden" />
            </tr>
          </thead>
          <tbody>
            {rows.map((s, i) => {
              const open = openId === s.id;
              const running = runningTonight[s.id] !== false;
              return (
                <RowGroup
                  key={s.id}
                  stop={s}
                  index={i}
                  last={i === rows.length - 1}
                  running={running}
                  pax={paxByStop[s.id] ?? 0}
                  hotels={hotelsByStop[s.id] ?? 0}
                  open={open}
                  canManage={canManage}
                  dragging={dragId === s.id}
                  onDragStart={() => setDragId(s.id)}
                  onDrop={() => onDrop(s.id)}
                  onMove={(d) => move(s.id, d)}
                  onToggle={() => setOpenId(open ? null : s.id)}
                  islands={islands}
                  next={next}
                />
              );
            })}
            {!rows.length ? (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-sm text-slate-400">
                  No pick-up points on {island} yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {canManage && dirty ? (
        <form action={reorderBusStopsAction} className="mt-2 flex items-center gap-3 print:hidden">
          <input type="hidden" name="island" value={island} />
          <input type="hidden" name="ordered_ids" value={ids.join(",")} />
          <SubmitOnce className="rounded-xl bg-[var(--show-ops-primary,#7c3aed)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            Save permanent order
          </SubmitOnce>
          <button
            type="button"
            onClick={() => {
              setIds(sorted.map((s) => s.id));
              setDirty(false);
            }}
            className="text-xs text-slate-500 underline"
          >
            Undo
          </button>
          <span className="text-xs text-slate-500">Hotels and bookings keep their stop; only the order changes.</span>
        </form>
      ) : null}
    </div>
  );
}

function RowGroup({
  stop,
  index,
  last,
  running,
  pax,
  hotels,
  open,
  canManage,
  dragging,
  onDragStart,
  onDrop,
  onMove,
  onToggle,
  islands,
  next,
}: {
  stop: DirectoryPickupStop;
  index: number;
  last: boolean;
  running: boolean;
  pax: number;
  hotels: number;
  open: boolean;
  canManage: boolean;
  dragging: boolean;
  onDragStart: () => void;
  onDrop: () => void;
  onMove: (delta: number) => void;
  onToggle: () => void;
  islands: string[];
  next: string;
}) {
  return (
    <>
      <tr
        draggable={canManage}
        onDragStart={onDragStart}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className={`border-t border-slate-100 ${dragging ? "opacity-40" : ""} ${running ? "" : "bg-slate-50/70 text-slate-500"} ${canManage ? "cursor-grab" : ""}`}
      >
        <td className="px-3 py-2 text-xs text-slate-400 whitespace-nowrap">
          {canManage ? <span className="mr-1 select-none text-slate-300" aria-hidden>⋮⋮</span> : null}
          {index + 1}
        </td>
        <td className="px-3 py-2 font-medium text-slate-900">{stop.resort}</td>
        <td className="px-3 py-2 text-slate-800">
          {stop.stop_name}
          {stop.map_url ? (
            <a href={stop.map_url} target="_blank" rel="noreferrer" className="ml-2 text-[11px] font-semibold text-[var(--show-ops-primary,#7c3aed)] underline print:hidden">
              Map
            </a>
          ) : null}
        </td>
        <td className="px-3 py-2 text-right tabular-nums">{hhmm(stop.pickup_time) || "—"}</td>
        <td className="px-3 py-2 text-xs text-slate-500">
          {stop.runs_on || "every night"}
          {!running && stop.runs_on ? " · not tonight" : ""}
        </td>
        <td className="px-3 py-2 text-right tabular-nums">{pax}</td>
        <td className="px-3 py-2 text-right tabular-nums text-slate-500">{hotels || "—"}</td>
        <td className="px-3 py-2 text-xs text-slate-500">{stop.guide_notes ?? "—"}</td>
        <td className="px-3 py-2 text-right whitespace-nowrap print:hidden">
          {canManage ? (
            <>
              <button type="button" onClick={() => onMove(-1)} disabled={index === 0} className="px-1 text-xs text-slate-500 disabled:opacity-30" aria-label="Move up">▲</button>
              <button type="button" onClick={() => onMove(1)} disabled={last} className="px-1 text-xs text-slate-500 disabled:opacity-30" aria-label="Move down">▼</button>
              <button type="button" onClick={onToggle} className="ml-2 text-xs font-semibold text-[var(--show-ops-primary,#7c3aed)]">
                {open ? "Close" : "Edit"}
              </button>
            </>
          ) : null}
        </td>
      </tr>
      {open ? (
        <tr className="border-t border-slate-100 bg-slate-50 print:hidden">
          <td colSpan={9} className="px-3 py-3">
            <StopForm islands={islands} initial={stop} onDone={onToggle} next={next} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

/** Edit / add a stop. Map link stays; the old photo link is gone — nobody used it. */
function StopForm({
  initial,
  islands,
  onDone,
  next,
}: {
  initial: DirectoryPickupStop;
  islands: string[];
  onDone: () => void;
  next: string;
}) {
  return (
    <form action={upsertBusStopAction} className="grid gap-2 sm:grid-cols-4">
      {initial.id ? <input type="hidden" name="id" value={initial.id} /> : null}
      <input type="hidden" name="tab" value="stops" />
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="sort_order" value={initial.sort_order} />
      <label className="text-xs font-medium text-slate-600">
        Island
        <select name="island" defaultValue={initial.island} className={INPUT}>
          {islands.map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs font-medium text-slate-600">
        Resort
        <input name="resort" required defaultValue={initial.resort} className={INPUT} />
      </label>
      <label className="text-xs font-medium text-slate-600">
        Stop name
        <input name="stop_name" required defaultValue={initial.stop_name} className={INPUT} />
      </label>
      <label className="text-xs font-medium text-slate-600">
        Pickup time
        <input name="pickup_time" type="time" defaultValue={hhmm(initial.pickup_time)} className={INPUT} />
      </label>
      <label className="text-xs font-medium text-slate-600">
        Days (blank = every night)
        <input name="runs_on" defaultValue={initial.runs_on ?? ""} placeholder="e.g. Mon, Wed, Fri" className={INPUT} />
      </label>
      <label className="text-xs font-medium text-slate-600 sm:col-span-2">
        Guide notes
        <input name="guide_notes" defaultValue={initial.guide_notes ?? ""} className={INPUT} />
      </label>
      <label className="text-xs font-medium text-slate-600">
        Map link
        <input name="map_url" type="url" inputMode="url" placeholder="https://maps.google.com/…" defaultValue={initial.map_url ?? ""} className={INPUT} />
      </label>
      {initial.id ? (
        <label className="flex items-center gap-1.5 text-xs text-slate-600" title="Tell guests still to travel that the pick-up time changed">
          <input type="checkbox" name="notify_guests" value="1" /> Tell guests if the time changed
        </label>
      ) : null}
      <div className="flex items-end gap-3 pb-1 sm:col-span-3">
        {initial.id ? (
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <input type="checkbox" name="active" value="1" defaultChecked={initial.active !== false} /> Active
          </label>
        ) : null}
        <SubmitOnce className="rounded-xl bg-[var(--show-ops-primary,#7c3aed)] px-4 py-2 text-sm font-semibold text-white">
          {initial.id ? "Save" : "Add stop"}
        </SubmitOnce>
        <button type="button" onClick={onDone} className="text-xs text-slate-500 underline">
          Cancel
        </button>
        {initial.id ? (
          <span className="text-[11px] text-slate-500">Saving a time change updates every booking on this stop. Hotels keep their stop.</span>
        ) : null}
      </div>
    </form>
  );
}
