"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { GripVertical } from "lucide-react";

import {
  clearBusNightOrderAction,
  getBusNightOrderAction,
  saveBusNightOrderAction,
  type BusNightOrder,
  type BusNightSheet,
} from "@/app/dashboard/show-ops/actions-bus";
import { BusPickupSelect } from "@/components/show-ops/bus-pickup-select";
import { formatShowOpsPax, showOpsDayName } from "@/lib/show-ops/calc";

export type BusRunRow = {
  id: string;
  booking_ref: string;
  guest_name: string;
  hotel_name: string | null;
  guest_mobile: string | null;
  dietary_required: boolean;
  dietary_notes: string | null;
  island: string;
  adults: number;
  children: number;
  infants: number;
  pickup_stop_id: string | null;
};

export type BusRunGroup = {
  /** pickup_stop_id, or `none-<island>` for bus guests with no stop yet. */
  key: string;
  island: string;
  time: string;
  label: string;
  notes: string;
  pax: number;
  seatsLeft: number | null;
  rows: BusRunRow[];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Saved per-island stop order → one flat key list, islands in the order the sheet lists them. */
function keysFromSaved(groups: BusRunGroup[], saved: BusNightOrder[]): string[] {
  const known = new Set(groups.map((g) => g.key));
  const islands = [...new Set(groups.map((g) => g.island))];
  const out: string[] = [];
  for (const island of islands) {
    const row = saved.find((s) => s.island === island);
    if (!row) continue;
    for (const id of row.stop_ids) if (known.has(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

/**
 * Tonight's bus list, in pick-up order.
 *
 * The driver's running order changes night to night — a coach might do Playa
 * Blanca first tonight and last tomorrow — so dragging here reorders THIS
 * night only. "Save tonight's order" keeps it in show_bus_night_orders (one
 * row per island per night) so it survives a refresh and other desks see it.
 * The permanent stop order under Bus board is never touched from here.
 */
export function BusRunSheet({
  groups,
  stopOptions,
  date,
  sortKeys = [],
  sortHref,
  savedOrder,
}: {
  groups: BusRunGroup[];
  stopOptions: Array<{ id: string; label: string }>;
  date: string;
  /** Column sort carried in the URL, shared with the other night lists. */
  sortKeys?: string[];
  /** key → href. A map, not a function: this component runs in the browser. */
  sortHref?: Record<string, string>;
  /**
   * Saved running order for this night, when the page already has it. Left
   * out, the sheet fetches it (plus stop map/photo links and guide names) on mount.
   */
  savedOrder?: BusNightOrder[] | null;
}) {
  const naturalOrder = useMemo(() => groups.map((g) => g.key), [groups]);
  const [order, setOrder] = useState<string[]>(() => (savedOrder?.length ? keysFromSaved(groups, savedOrder) : naturalOrder));
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [sheet, setSheet] = useState<BusNightSheet | null>(null);
  const [savedIslands, setSavedIslands] = useState<string[]>(() => (savedOrder ?? []).map((s) => s.island));
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Saved order + stop links + guides. Runs once per night; the prop (when given)
  // already seeded the order so there is no flash of the printed-times order.
  useEffect(() => {
    let alive = true;
    getBusNightOrderAction(date)
      .then((res) => {
        if (!alive || !res.ok) return;
        setSheet(res.sheet);
        if (savedOrder === undefined && res.sheet.orders.length) {
          setOrder(keysFromSaved(groups, res.sheet.orders));
          setSavedIslands(res.sheet.orders.map((s) => s.island));
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // groups only matter for the initial seeding; later filter changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  // Keys can come and go as filters change; keep known ones in the chosen order
  // and drop anything that has gone away.
  const ordered = useMemo(() => {
    const byKey = new Map(groups.map((g) => [g.key, g]));
    const seen = new Set<string>();
    const out: BusRunGroup[] = [];
    for (const k of order) {
      const g = byKey.get(k);
      if (g && !seen.has(k)) {
        out.push(g);
        seen.add(k);
      }
    }
    for (const g of groups) if (!seen.has(g.key)) out.push(g);
    return out;
  }, [groups, order]);

  const rearranged = ordered.some((g, i) => g.key !== naturalOrder[i]);
  const islands = useMemo(() => [...new Set(groups.map((g) => g.island))], [groups]);
  const hasSaved = savedIslands.some((i) => islands.includes(i));

  function move(targetKey: string) {
    if (!dragKey || dragKey === targetKey) return;
    const keys = ordered.map((g) => g.key);
    const from = keys.indexOf(dragKey);
    const to = keys.indexOf(targetKey);
    if (from < 0 || to < 0) return;
    keys.splice(to, 0, ...keys.splice(from, 1));
    setOrder(keys);
    setDragKey(null);
  }

  function nudge(key: string, delta: number) {
    const keys = ordered.map((g) => g.key);
    const from = keys.indexOf(key);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= keys.length) return;
    keys.splice(to, 0, ...keys.splice(from, 1));
    setOrder(keys);
  }

  function saveTonight() {
    setNote(null);
    start(async () => {
      type SaveResult = { island: string; saved: boolean; error: string | null };
      const results: SaveResult[] = await Promise.all(
        islands.map(async (island): Promise<SaveResult> => {
          const ids = ordered.filter((g) => g.island === island && UUID_RE.test(g.key)).map((g) => g.key);
          if (!ids.length) return { island, saved: false, error: null };
          const res = await saveBusNightOrderAction(date, island, ids);
          return { island, saved: res.ok, error: res.ok ? null : res.message };
        }),
      );
      const failed = results.filter((r) => r.error);
      if (failed.length) {
        setNote(`Could not save: ${failed.map((f) => `${f.island} — ${f.error}`).join("; ")}`);
        return;
      }
      setSavedIslands(results.filter((r) => r.saved).map((r) => r.island));
      setNote("Tonight's order saved.");
    });
  }

  function backToTimes() {
    setNote(null);
    setOrder(naturalOrder);
    if (!hasSaved) return;
    start(async () => {
      await Promise.all(islands.map((island) => clearBusNightOrderAction(date, island)));
      setSavedIslands([]);
      setNote("Back to printed pick-up times.");
    });
  }

  function exportCsv() {
    const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [
      ["Stop order", "Pick-up time", "Stop", "Island", "Booking ref", "Guest", "Hotel", "Pax", "Mobile", "Dietary"]
        .map(cell)
        .join(","),
    ];
    ordered.forEach((g, i) => {
      for (const r of g.rows) {
        lines.push(
          [
            i + 1,
            g.time,
            g.label,
            g.island,
            r.booking_ref,
            r.guest_name,
            r.hotel_name || "",
            formatShowOpsPax(r.adults, r.children, r.infants),
            r.guest_mobile || "",
            r.dietary_required ? r.dietary_notes || "Yes" : "",
          ]
            .map(cell)
            .join(","),
        );
      }
    });
    const blob = new Blob([`﻿${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bus-list-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!groups.length) {
    return (
      <p className="rounded-2xl bg-white p-5 text-sm text-slate-500 ring-1 ring-slate-200">
        No bus guests for these filters.
      </p>
    );
  }

  const guideLines = islands
    .map((island) => ({ island, guide: sheet?.guides[island] ?? null }))
    .filter((x) => x.guide);
  const day = showOpsDayName(date);

  return (
    <div className="space-y-4">
      {/* Night header — prints. Guide per island when the bus board has one. */}
      <div className="rounded-2xl bg-white px-4 py-3 ring-1 ring-slate-200">
        <p className="text-sm font-semibold text-slate-900">
          Bus list · {day ? `${day} ` : ""}
          {date}
          {islands.length === 1 ? ` · ${islands[0]}` : ""}
        </p>
        {guideLines.length ? (
          <p className="mt-0.5 text-sm text-slate-700">
            {guideLines.map((g) => `${islands.length > 1 ? `${g.island}: ` : ""}Guide ${g.guide}`).join(" · ")}
          </p>
        ) : null}
        {hasSaved ? (
          <p className="mt-0.5 text-xs font-semibold text-violet-800">Tonight&apos;s saved running order</p>
        ) : null}
      </div>

      <div className="print:hidden flex flex-wrap items-center gap-3 rounded-2xl bg-white px-4 py-3 text-sm ring-1 ring-slate-200">
        <p className="min-w-[16rem] flex-1 text-slate-600">
          Drag a stop to change tonight&apos;s running order, then save it so it stays after a refresh. The permanent
          stop order under Bus board is untouched.
        </p>
        {rearranged || hasSaved ? (
          <button
            type="button"
            disabled={pending}
            onClick={backToTimes}
            className="rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-60"
          >
            Back to pick-up times
          </button>
        ) : null}
        <button
          type="button"
          disabled={pending || !rearranged}
          onClick={saveTonight}
          className="rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-violet-900 ring-1 ring-violet-200 hover:bg-violet-50 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save tonight's order"}
        </button>
        <button
          type="button"
          onClick={exportCsv}
          className="rounded-xl bg-[var(--show-ops-primary,#7c3aed)] px-4 py-2 text-xs font-semibold text-white"
        >
          Export this order
        </button>
        {note ? <p className="w-full text-xs text-slate-600">{note}</p> : null}
      </div>

      {ordered.map((g, i) => {
        const links = sheet?.stops[g.key] ?? null;
        return (
        <div
          key={g.key}
          draggable
          onDragStart={() => setDragKey(g.key)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => move(g.key)}
          className={`overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-200 ${
            dragKey === g.key ? "opacity-50" : ""
          }`}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3">
            <h3 className="flex items-center gap-2 font-semibold">
              <GripVertical className="h-4 w-4 cursor-grab text-slate-300 print:hidden" aria-hidden />
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold tabular-nums text-slate-600">
                {i + 1}
              </span>
              {g.time} · {g.label}
            </h3>
            <p className="flex items-center gap-2 text-sm text-slate-600">
              {g.pax} pax
              {g.seatsLeft == null ? " · order a bus" : ` · ${g.seatsLeft} island seats left`}
              <span className="print:hidden">
                <button
                  type="button"
                  aria-label={`Move ${g.label} earlier`}
                  disabled={i === 0}
                  onClick={() => nudge(g.key, -1)}
                  className="rounded px-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Move ${g.label} later`}
                  disabled={i === ordered.length - 1}
                  onClick={() => nudge(g.key, 1)}
                  className="rounded px-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30"
                >
                  ↓
                </button>
              </span>
            </p>
          </div>
          {g.notes || links?.map_url || links?.photo_url ? (
            <div className="flex flex-wrap items-start gap-3 border-b px-4 py-2 text-xs text-slate-500">
              {g.notes ? <p className="min-w-[10rem] flex-1">{g.notes}</p> : null}
              {links?.map_url ? (
                <a
                  href={links.map_url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-[var(--show-ops-primary,#7c3aed)] underline"
                >
                  Map
                </a>
              ) : null}
              {links?.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={links.photo_url}
                  alt={`Pick-up point: ${g.label}`}
                  loading="lazy"
                  className="max-h-[120px] max-w-[120px] rounded-lg object-cover ring-1 ring-slate-200"
                />
              ) : null}
            </div>
          ) : null}
          {/* Phone: one card per pickup, with the move-stop control */}
          <div className="space-y-2 p-3 lg:hidden print:hidden">
            {g.rows.map((b) => (
              <div key={b.id} className="rounded-2xl bg-white p-3 ring-1 ring-slate-200">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/dashboard/show-ops/bookings/${b.id}`} className="text-[15px] font-semibold leading-tight hover:underline">
                    {b.guest_name}
                  </Link>
                  <span className="whitespace-nowrap text-sm font-medium">
                    {formatShowOpsPax(b.adults, b.children, b.infants)}
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-slate-600">{b.hotel_name || "—"}</p>
                <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500">
                  <span className="font-mono">{b.booking_ref}</span>
                  {b.guest_mobile ? <span>{b.guest_mobile}</span> : null}
                  {b.dietary_required ? <span className="font-medium text-amber-800">{b.dietary_notes || "Diet"}</span> : null}
                </div>
                <div className="mt-2 border-t border-black/5 pt-2">
                  <BusPickupSelect
                    bookingId={b.id}
                    currentStopId={b.pickup_stop_id}
                    stops={stopOptions.filter((s) => s.label.startsWith(`${b.island} ·`))}
                  />
                </div>
              </div>
            ))}
            {!g.rows.length ? <p className="py-6 text-center text-sm text-slate-500">No pickups</p> : null}
          </div>
          <table className="hidden min-w-full text-left text-sm lg:table print:table">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <SortTh label="Guest" k="name" sortKeys={sortKeys} sortHref={sortHref} />
                <SortTh label="Hotel" k="hotel" sortKeys={sortKeys} sortHref={sortHref} />
                <th className="px-3 py-2">Pax</th>
                <th className="px-3 py-2">Mobile</th>
                <SortTh label="Diet" k="diet" sortKeys={sortKeys} sortHref={sortHref} />
                <th className="px-3 py-2 print:hidden">Move stop</th>
              </tr>
            </thead>
            <tbody>
              {g.rows.map((b) => (
                <tr key={b.id} className="border-t border-slate-100">
                  <td className="px-3 py-1.5">
                    <Link href={`/dashboard/show-ops/bookings/${b.id}`} className="font-medium hover:underline">
                      {b.guest_name}
                    </Link>
                    <div className="text-[11px] text-slate-500">{b.booking_ref}</div>
                  </td>
                  <td className="px-3 py-1.5">{b.hotel_name || "—"}</td>
                  <td className="px-3 py-1.5">{formatShowOpsPax(b.adults, b.children, b.infants)}</td>
                  <td className="px-3 py-1.5">{b.guest_mobile || "—"}</td>
                  <td className="px-3 py-1.5">{b.dietary_required ? b.dietary_notes || "Yes" : ""}</td>
                  <td className="px-3 py-1.5">
                    <BusPickupSelect
                      bookingId={b.id}
                      currentStopId={b.pickup_stop_id}
                      stops={stopOptions.filter((s) => s.label.startsWith(`${b.island} ·`))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        );
      })}
    </div>
  );
}

/** Same click-to-sort headers as the other night lists; plain text when no sort link is given. */
function SortTh({
  label,
  k,
  sortKeys,
  sortHref,
}: {
  label: string;
  k: string;
  sortKeys: string[];
  sortHref?: Record<string, string>;
}) {
  const href = sortHref?.[k];
  if (!href) return <th className="px-3 py-2">{label}</th>;
  const rank = sortKeys.indexOf(k);
  return (
    <th className="px-3 py-2">
      <Link href={href} className={rank >= 0 ? "text-slate-900 underline" : "hover:underline"}>
        {label}
        {rank >= 0 ? <span className="ml-1 text-[10px] font-semibold text-slate-500">{rank + 1}</span> : null}
      </Link>
    </th>
  );
}
