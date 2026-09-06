"use client";

import Link from "next/link";
import { matchesDirectorySearch } from "@/lib/show-ops/directory-search";
import { useMemo, useState } from "react";

import { upsertBusStopAction } from "@/app/dashboard/show-ops/actions";
import { BusStopReorder } from "@/components/show-ops/bus-stop-reorder";
import { SubmitOnce } from "@/components/show-ops/submit-once";
import { SHOW_OPS_PRIMARY_BTN } from "@/components/show-ops/show-ops-page-header";

export type DirectoryPickupStop = {
  id: string;
  island: string;
  zone: string | null;
  resort: string;
  stop_name: string;
  pickup_time: string | null;
  sort_order: number;
  runs_on: string | null;
  guide_notes: string | null;
  active: boolean | null;
  /** Map link / photo of the stop. Undefined when the page did not load them — the form then leaves them alone. */
  map_url?: string | null;
  photo_url?: string | null;
};

const PAGE = 50;
const INPUT = "mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm";

function hhmm(t: string | null | undefined): string {
  return t ? String(t).slice(0, 5) : "";
}

/**
 * Pick-up points on their own page, split from hotels. Same shape as the
 * hotels directory: filter in memory, page at 50, one edit form at a time.
 * The permanent run order per island lives at the bottom and only appears
 * once an island is chosen — dragging 300 stops across five islands at once
 * was never a real job.
 */
export function PickupPointsDirectory({
  stops,
  hotelsByStop,
  hotelNamesByStop = {},
  islands,
  highlightId,
}: {
  stops: DirectoryPickupStop[];
  /** Hotels mapped to each stop — shown so an operator knows what a change touches. */
  hotelsByStop: Record<string, number>;
  hotelNamesByStop?: Record<string, string[]>;
  islands: string[];
  highlightId?: string;
}) {
  const [island, setIsland] = useState("");
  const [resort, setResort] = useState("");
  const [q, setQ] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(highlightId ?? null);
  const [adding, setAdding] = useState(false);

  const islandChoices = useMemo(
    () => [...new Set([...islands, ...stops.map((s) => s.island)])].filter(Boolean),
    [islands, stops],
  );
  const resortChoices = useMemo(() => {
    const pool = island ? stops.filter((s) => s.island === island) : stops;
    return [...new Set(pool.map((s) => s.resort).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }, [stops, island]);

  const filtered = useMemo(() => {
    return stops.filter((s) => {
      if (!showInactive && s.active === false) return false;
      if (island && s.island !== island) return false;
      if (resort && s.resort !== resort) return false;
      if (!matchesDirectorySearch(q, s.resort, s.stop_name, s.island, s.zone, hhmm(s.pickup_time), ...(hotelNamesByStop[s.id] ?? []))) return false;
      return true;
    });
  }, [stops, island, resort, q, showInactive, hotelNamesByStop]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const current = Math.min(page, pages);
  const rows = filtered.slice((current - 1) * PAGE, current * PAGE);
  const resetPage = () => setPage(1);

  const reorderStops = useMemo(
    () =>
      island
        ? stops
            .filter((s) => s.island === island && s.active !== false)
            .sort((a, b) => a.sort_order - b.sort_order || a.stop_name.localeCompare(b.stop_name))
            .map((s) => ({
              id: s.id,
              label: `${s.resort} · ${s.stop_name}${s.pickup_time ? ` · ${hhmm(s.pickup_time)}` : ""}`,
            }))
        : [],
    [stops, island],
  );

  return (
    <div className="space-y-3">
      <Link href="/dashboard/show-ops/lists?tab=bus" className="inline-flex text-sm font-semibold text-violet-700 hover:underline">Open bus list · print or download</Link>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs font-medium text-slate-600">
          Search
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              resetPage();
            }}
            placeholder="Type a hotel or pickup name…"
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
            checked={showInactive}
            onChange={(e) => {
              setShowInactive(e.target.checked);
              resetPage();
            }}
          />
          Show inactive
        </label>
        <button type="button" onClick={() => setAdding((a) => !a)} className={`${SHOW_OPS_PRIMARY_BTN} ml-auto`}>
          {adding ? "Close" : "Add pick-up point"}
        </button>
      </div>

      {adding ? (
        <StopForm
          islands={islandChoices}
          initial={{
            id: "",
            island: island || islands[0] || "",
            zone: null,
            resort: resort,
            stop_name: "",
            pickup_time: null,
            sort_order: 0,
            runs_on: null,
            guide_notes: null,
            active: true,
            map_url: null,
            photo_url: null,
          }}
          onDone={() => setAdding(false)}
        />
      ) : null}

      <p className="text-xs text-slate-500">
        {filtered.length.toLocaleString("en-GB")} pick-up point{filtered.length === 1 ? "" : "s"}
        {filtered.length > PAGE ? ` · page ${current} of ${pages}` : ""}
      </p>

      <div className="overflow-hidden rounded-xl ring-1 ring-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Resort</th>
              <th className="px-3 py-2">Stop</th>
              <th className="px-3 py-2">Island</th>
              <th className="px-3 py-2 text-right">Time</th>
              <th className="px-3 py-2">Runs</th>
              <th className="px-3 py-2 text-right">Hotels</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const open = openId === s.id;
              return (
                <StopRow
                  key={s.id}
                  stop={s}
                  hotels={hotelsByStop[s.id] ?? 0}
                  open={open}
                  highlighted={highlightId === s.id}
                  onToggle={() => setOpenId(open ? null : s.id)}
                  islands={islandChoices}
                />
              );
            })}
            {!rows.length ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-sm text-slate-400">
                  No pick-up points match.
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

      {island ? (
        reorderStops.length ? (
          <BusStopReorder key={island} island={island} stops={reorderStops} />
        ) : null
      ) : (
        <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
          Pick an island above to see and drag its permanent run order.
        </p>
      )}
    </div>
  );
}

function StopRow({
  stop,
  hotels,
  open,
  highlighted,
  onToggle,
  islands,
}: {
  stop: DirectoryPickupStop;
  hotels: number;
  open: boolean;
  highlighted: boolean;
  onToggle: () => void;
  islands: string[];
}) {
  return (
    <>
      <tr
        id={`created-${stop.id}`}
        className={`border-t border-slate-100 ${highlighted ? "bg-violet-50" : stop.active === false ? "text-slate-400" : ""}`}
      >
        <td className="px-3 py-2 font-medium text-slate-900">{stop.resort}</td>
        <td className="px-3 py-2 text-slate-700">
          {stop.stop_name}
          {stop.active === false ? <span className="ml-2 text-[11px] text-slate-400">inactive</span> : null}
          {stop.map_url ? (
            <a
              href={stop.map_url}
              target="_blank"
              rel="noreferrer"
              className="ml-2 text-[11px] font-semibold text-[var(--show-ops-primary,#7c3aed)] underline"
            >
              Map
            </a>
          ) : null}
        </td>
        <td className="px-3 py-2 text-slate-600">{stop.island}</td>
        <td className="px-3 py-2 text-right tabular-nums text-slate-700">{hhmm(stop.pickup_time) || "—"}</td>
        <td className="px-3 py-2 text-xs text-slate-500">{stop.runs_on || "every night"}</td>
        <td className="px-3 py-2 text-right tabular-nums text-slate-500">{hotels || "—"}</td>
        <td className="px-3 py-2 text-right">
          <button type="button" onClick={onToggle} className="text-xs font-semibold text-[var(--show-ops-primary,#7c3aed)]">
            {open ? "Close" : "Edit"}
          </button>
        </td>
      </tr>
      {open ? (
        <tr className="border-t border-slate-100 bg-slate-50">
          <td colSpan={7} className="px-3 py-3">
            <StopForm islands={islands} initial={stop} onDone={onToggle} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function StopForm({
  initial,
  islands,
  onDone,
}: {
  initial: DirectoryPickupStop;
  islands: string[];
  onDone: () => void;
}) {
  // Only offer the link fields when we actually hold their current values —
  // saving blanks over a link nobody could see would be worse than hiding them.
  const linksLoaded = !initial.id || initial.map_url !== undefined || initial.photo_url !== undefined;
  return (
    <form action={upsertBusStopAction} className="grid gap-2 sm:grid-cols-4">
      {initial.id ? <input type="hidden" name="id" value={initial.id} /> : null}
      <input type="hidden" name="tab" value="stops" />
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
        Sort order
        <input name="sort_order" type="number" defaultValue={initial.sort_order} className={INPUT} />
      </label>
      <label className="text-xs font-medium text-slate-600">
        Days (blank = every night)
        <input name="runs_on" defaultValue={initial.runs_on ?? ""} className={INPUT} />
      </label>
      <label className="text-xs font-medium text-slate-600">
        Guide notes
        <input name="guide_notes" defaultValue={initial.guide_notes ?? ""} className={INPUT} />
      </label>
      {linksLoaded ? (
        <>
          <label className="text-xs font-medium text-slate-600 sm:col-span-2">
            Map link
            <input
              name="map_url"
              type="url"
              inputMode="url"
              placeholder="https://maps.google.com/…"
              defaultValue={initial.map_url ?? ""}
              className={INPUT}
            />
          </label>
        </>
      ) : null}
      <div className="flex items-end gap-3 pb-1">
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
      </div>
      {initial.id ? (
        <p className="text-[11px] text-slate-500 sm:col-span-4">
          Saving a time change updates every booking on this stop. Hotels keep their stop.
        </p>
      ) : null}
    </form>
  );
}
