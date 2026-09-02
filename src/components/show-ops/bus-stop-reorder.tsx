"use client";

import { useState } from "react";

import { reorderBusStopsAction } from "@/app/dashboard/show-ops/actions";
import { SubmitOnce } from "@/components/show-ops/submit-once";

export type ReorderStop = {
  id: string;
  label: string;
};

export function BusStopReorder({ island, stops }: { island: string; stops: ReorderStop[] }) {
  const [order, setOrder] = useState(stops);
  const [dragId, setDragId] = useState<string | null>(null);

  function onDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    setOrder((list) => {
      const next = [...list];
      const from = next.findIndex((s) => s.id === dragId);
      const to = next.findIndex((s) => s.id === targetId);
      if (from < 0 || to < 0) return list;
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setDragId(null);
  }

  return (
    <form action={reorderBusStopsAction} className="mt-2 rounded-xl bg-white p-3 ring-1 ring-slate-200">
      <input type="hidden" name="island" value={island} />
      <input type="hidden" name="ordered_ids" value={order.map((s) => s.id).join(",")} />
      <p className="text-xs font-medium text-slate-600">Default run order · {island}</p>
      <p className="text-[11px] text-slate-500">
        Drag to reorder, then save. This is the <strong>permanent</strong> default for every night — hotels and bookings
        keep their stop. To change the order for one night only, use the bus list under Night lists and export from
        there.
      </p>
      <ol className="mt-2 space-y-1">
        {order.map((s, i) => (
          <li
            key={s.id}
            draggable
            onDragStart={() => setDragId(s.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop(s.id)}
            className={`cursor-grab rounded-lg bg-slate-50 px-2 py-1.5 text-sm ${dragId === s.id ? "opacity-50" : ""}`}
          >
            <span className="mr-2 text-xs text-slate-400">{i + 1}</span>
            {s.label}
          </li>
        ))}
      </ol>
      <SubmitOnce className="mt-2 rounded-xl bg-[var(--show-ops-primary,#7c3aed)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
        Save order
      </SubmitOnce>
    </form>
  );
}
