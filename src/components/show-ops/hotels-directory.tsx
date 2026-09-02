"use client";

import { useMemo, useState } from "react";

import { upsertHotelAction } from "@/app/dashboard/show-ops/actions";
import { SearchableSelect, type SearchableOption } from "@/components/show-ops/searchable-select";
import { SubmitOnce } from "@/components/show-ops/submit-once";
import { SHOW_OPS_PRIMARY_BTN } from "@/components/show-ops/show-ops-page-header";

export type DirectoryHotel = {
  id: string;
  name: string;
  island: string;
  bus_stop_id: string | null;
  active: boolean | null;
};

export type DirectoryStop = {
  id: string;
  island: string;
  zone: string | null;
  resort: string;
  stop_name: string;
  pickup_time: string | null;
};

const PAGE = 50;
const INPUT = "mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm";

function hhmm(t: string | null | undefined): string {
  return t ? String(t).slice(0, 5) : "";
}

/**
 * Hotels list that stays fast at MHT size.
 *
 * The old page rendered every hotel as its own form with a <select> holding all
 * 300-odd bus stops — 1,200 hotels × 327 options was several hundred thousand
 * DOM nodes and a multi-megabyte page, which is why it "buffered" and never
 * scrolled. This keeps one compact row per hotel, filters in memory, pages at
 * 50, and only mounts an edit form for the row that is open.
 */
export function HotelsDirectory({
  hotels,
  stops,
  islands,
  highlightId,
}: {
  hotels: DirectoryHotel[];
  stops: DirectoryStop[];
  islands: string[];
  highlightId?: string;
}) {
  const [island, setIsland] = useState("");
  const [resort, setResort] = useState("");
  const [q, setQ] = useState("");
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(highlightId ?? null);
  const [adding, setAdding] = useState(false);

  const stopById = useMemo(() => new Map(stops.map((s) => [s.id, s])), [stops]);

  // Every island that actually has hotels, not just the configured list — the
  // legacy import left some under "Unknown" and they still need finding.
  const islandChoices = useMemo(
    () => [...new Set([...islands, ...hotels.map((h) => h.island)])].filter(Boolean),
    [islands, hotels],
  );

  const resortChoices = useMemo(() => {
    const pool = island ? stops.filter((s) => s.island === island) : stops;
    return [...new Set(pool.map((s) => s.resort).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }, [stops, island]);

  const filtered = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return hotels.filter((h) => {
      if (!showInactive && h.active === false) return false;
      if (island && h.island !== island) return false;
      const stop = h.bus_stop_id ? stopById.get(h.bus_stop_id) : undefined;
      if (unassignedOnly && stop) return false;
      if (resort && stop?.resort !== resort) return false;
      if (words.length) {
        const hay = `${h.name} ${h.island} ${stop?.resort ?? ""} ${stop?.stop_name ?? ""}`.toLowerCase();
        if (!words.every((w) => hay.includes(w))) return false;
      }
      return true;
    });
  }, [hotels, stopById, island, resort, q, unassignedOnly, showInactive]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const current = Math.min(page, pages);
  const rows = filtered.slice((current - 1) * PAGE, current * PAGE);

  const stopOptionsFor = (isl: string): SearchableOption[] =>
    stops
      .filter((s) => !isl || s.island === isl)
      .map((s) => ({
        value: s.id,
        label: `${s.resort} · ${s.stop_name}`,
        hint: hhmm(s.pickup_time) || undefined,
        keywords: `${s.island} ${s.zone ?? ""}`,
      }));

  const resetPage = () => setPage(1);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs font-medium text-slate-600">
          Search
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              resetPage();
            }}
            placeholder="Hotel, resort or stop…"
            className={`${INPUT} min-w-[14rem]`}
          />
        </label>
        <label className="text-xs font-medium text-slate-600">
          Island
          <select
            value={island}
            onChange={(e) => {
              setIsland(e.target.value);
              setResort("");
              resetPage();
            }}
            className={INPUT}
          >
            <option value="">All islands</option>
            {islandChoices.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">
          Resort
          <select
            value={resort}
            onChange={(e) => {
              setResort(e.target.value);
              resetPage();
            }}
            className={INPUT}
          >
            <option value="">All resorts</option>
            {resortChoices.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 pb-2 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={unassignedOnly}
            onChange={(e) => {
              setUnassignedOnly(e.target.checked);
              resetPage();
            }}
          />
          No pick-up set
        </label>
        <label className="flex items-center gap-1.5 pb-2 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => {
              setShowInactive(e.target.checked);
              resetPage();
            }}
          />
          Show inactive
        </label>
        <button
          type="button"
          onClick={() => setAdding((a) => !a)}
          className={`${SHOW_OPS_PRIMARY_BTN} ml-auto`}
        >
          {adding ? "Close" : "Add hotel"}
        </button>
      </div>

      {adding ? (
        <HotelForm
          islands={islandChoices}
          stopOptionsFor={stopOptionsFor}
          initial={{ id: "", name: "", island: island || islands[0] || "", bus_stop_id: null, active: true }}
          onDone={() => setAdding(false)}
        />
      ) : null}

      <p className="text-xs text-slate-500">
        {filtered.length.toLocaleString("en-GB")} hotel{filtered.length === 1 ? "" : "s"}
        {filtered.length > PAGE ? ` · page ${current} of ${pages}` : ""}
      </p>

      <div className="overflow-hidden rounded-xl ring-1 ring-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Hotel</th>
              <th className="px-3 py-2">Island</th>
              <th className="px-3 py-2">Pick-up point</th>
              <th className="px-3 py-2 text-right">Time</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((h) => {
              const stop = h.bus_stop_id ? stopById.get(h.bus_stop_id) : undefined;
              const open = openId === h.id;
              return (
                <HotelRow
                  key={h.id}
                  hotel={h}
                  stop={stop}
                  open={open}
                  highlighted={highlightId === h.id}
                  onToggle={() => setOpenId(open ? null : h.id)}
                  islands={islandChoices}
                  stopOptionsFor={stopOptionsFor}
                />
              );
            })}
            {!rows.length ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-sm text-slate-400">
                  No hotels match.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {pages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            disabled={current <= 1}
            onClick={() => setPage(current - 1)}
            className="rounded-lg bg-white px-3 py-1.5 ring-1 ring-slate-200 disabled:opacity-40"
          >
            ← Previous
          </button>
          <span className="text-slate-500">
            {current} / {pages}
          </span>
          <button
            type="button"
            disabled={current >= pages}
            onClick={() => setPage(current + 1)}
            className="rounded-lg bg-white px-3 py-1.5 ring-1 ring-slate-200 disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      ) : null}
    </div>
  );
}

function HotelRow({
  hotel,
  stop,
  open,
  highlighted,
  onToggle,
  islands,
  stopOptionsFor,
}: {
  hotel: DirectoryHotel;
  stop: DirectoryStop | undefined;
  open: boolean;
  highlighted: boolean;
  onToggle: () => void;
  islands: string[];
  stopOptionsFor: (island: string) => SearchableOption[];
}) {
  return (
    <>
      <tr
        id={`created-${hotel.id}`}
        className={`border-t border-slate-100 ${highlighted ? "bg-violet-50" : hotel.active === false ? "text-slate-400" : ""}`}
      >
        <td className="px-3 py-2 font-medium text-slate-900">
          {hotel.name}
          {hotel.active === false ? <span className="ml-2 text-[11px] font-normal text-slate-400">inactive</span> : null}
        </td>
        <td className="px-3 py-2 text-slate-600">{hotel.island}</td>
        <td className="px-3 py-2 text-slate-600">
          {stop ? (
            <>
              <span className="font-medium text-slate-800">{stop.resort}</span> · {stop.stop_name}
            </>
          ) : (
            <span className="text-amber-700">No pick-up set</span>
          )}
        </td>
        <td className="px-3 py-2 text-right tabular-nums text-slate-600">{hhmm(stop?.pickup_time) || "—"}</td>
        <td className="px-3 py-2 text-right">
          <button type="button" onClick={onToggle} className="text-xs font-semibold text-[var(--show-ops-primary,#7c3aed)]">
            {open ? "Close" : "Edit"}
          </button>
        </td>
      </tr>
      {open ? (
        <tr className="border-t border-slate-100 bg-slate-50">
          <td colSpan={5} className="px-3 py-3">
            <HotelForm islands={islands} stopOptionsFor={stopOptionsFor} initial={hotel} onDone={onToggle} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function HotelForm({
  initial,
  islands,
  stopOptionsFor,
  onDone,
}: {
  initial: DirectoryHotel;
  islands: string[];
  stopOptionsFor: (island: string) => SearchableOption[];
  onDone: () => void;
}) {
  const [island, setIsland] = useState(initial.island);
  const [stopId, setStopId] = useState(initial.bus_stop_id ?? "");
  const options = useMemo(() => stopOptionsFor(island), [stopOptionsFor, island]);

  return (
    <form action={upsertHotelAction} className="grid gap-2 sm:grid-cols-4">
      {initial.id ? <input type="hidden" name="id" value={initial.id} /> : null}
      <input type="hidden" name="tab" value="hotels" />
      <label className="text-xs font-medium text-slate-600">
        Hotel name
        <input name="name" required defaultValue={initial.name} className={INPUT} />
      </label>
      <label className="text-xs font-medium text-slate-600">
        Island
        <select
          name="island"
          value={island}
          onChange={(e) => {
            setIsland(e.target.value);
            setStopId("");
          }}
          className={INPUT}
        >
          {islands.map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </select>
      </label>
      <div className="text-xs font-medium text-slate-600">
        Pick-up point
        <div className="mt-1">
          <SearchableSelect
            name="bus_stop_id"
            value={stopId}
            onChange={setStopId}
            options={options}
            ariaLabel="Pick-up point"
            placeholder="Type a resort or stop…"
            emptyLabel="— no pick-up —"
          />
        </div>
      </div>
      <div className="flex items-end gap-3 pb-1">
        {initial.id ? (
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <input type="checkbox" name="active" value="1" defaultChecked={initial.active !== false} /> Active
          </label>
        ) : null}
        <SubmitOnce className="rounded-xl bg-[var(--show-ops-primary,#7c3aed)] px-4 py-2 text-sm font-semibold text-white">
          {initial.id ? "Save" : "Add hotel"}
        </SubmitOnce>
        <button type="button" onClick={onDone} className="text-xs text-slate-500 underline">
          Cancel
        </button>
      </div>
    </form>
  );
}
