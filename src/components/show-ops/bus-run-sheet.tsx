"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { GripVertical } from "lucide-react";

import { BusPickupSelect } from "@/components/show-ops/bus-pickup-select";
import { formatShowOpsPax } from "@/lib/show-ops/calc";

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
  key: string;
  island: string;
  time: string;
  label: string;
  notes: string;
  pax: number;
  seatsLeft: number | null;
  rows: BusRunRow[];
};

/**
 * Tonight's bus list, in pick-up order.
 *
 * The driver's running order changes night to night — a coach might do Playa
 * Blanca first tonight and last tomorrow — so dragging here reorders THIS sheet
 * only. The saved stop order under Bus board is untouched, which is the whole
 * point: their old system made the change permanent every time.
 */
export function BusRunSheet({
  groups,
  stopOptions,
  date,
  sortKeys = [],
  sortHref,
}: {
  groups: BusRunGroup[];
  stopOptions: Array<{ id: string; label: string }>;
  date: string;
  /** Column sort carried in the URL, shared with the other night lists. */
  sortKeys?: string[];
  /** key → href. A map, not a function: this component runs in the browser. */
  sortHref?: Record<string, string>;
}) {
  const naturalOrder = useMemo(() => groups.map((g) => g.key), [groups]);
  const [order, setOrder] = useState<string[]>(naturalOrder);
  const [dragKey, setDragKey] = useState<string | null>(null);

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

  return (
    <div className="space-y-4">
      <div className="print:hidden flex flex-wrap items-center gap-3 rounded-2xl bg-white px-4 py-3 text-sm ring-1 ring-slate-200">
        <p className="min-w-[16rem] flex-1 text-slate-600">
          Pick-up order for {date}. Drag a stop to change tonight&apos;s running order — it only affects this sheet and
          the export, never the saved stop order.
        </p>
        {rearranged ? (
          <button
            type="button"
            onClick={() => setOrder(naturalOrder)}
            className="rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
          >
            Back to pick-up times
          </button>
        ) : null}
        <button
          type="button"
          onClick={exportCsv}
          className="rounded-xl bg-[var(--show-ops-primary,#7c3aed)] px-4 py-2 text-xs font-semibold text-white"
        >
          Export this order
        </button>
      </div>

      {ordered.map((g, i) => (
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
          {g.notes ? <p className="border-b px-4 py-2 text-xs text-slate-500">{g.notes}</p> : null}
          <table className="min-w-full text-left text-sm">
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
      ))}
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
