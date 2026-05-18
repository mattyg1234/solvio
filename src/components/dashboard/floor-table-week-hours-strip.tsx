"use client";

import { useEffect, useState, useTransition } from "react";

import { replaceFloorPlanTableWeekdayHours } from "@/app/dashboard/bookings/inventory-actions";
import { Button } from "@/components/ui/button";
import type { AppointmentWeekRow } from "@/lib/booking-inventory-types";
import { cn } from "@/lib/utils";

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

type StripTableSlot = {
  weekday: number;
  open_time: string;
  close_time: string;
};

/** Minimal subset of Hub floor-plan row — avoids circular imports vs `booking-operations-hub`. */
export type StripFloorTableProps = {
  id: string;
  label: string;
  table_week_hours?: StripTableSlot[];
};

function clipTime(htmlValue: string): string {
  if (!htmlValue) return "";
  const m = /^(\d{2}:\d{2})/.exec(htmlValue);
  return m ? m[1] : "";
}

function rowForDay(table: StripFloorTableProps, d: number) {
  return table.table_week_hours?.find((r) => r.weekday === d);
}

/** Optional per-weekday overrides for one floor-plan table (replaces venue hours when saved). */
export function FloorTableWeekHoursStrip({
  businessId,
  table,
  venueSchedules,
}: {
  businessId: string;
  table: StripFloorTableProps;
  venueSchedules: AppointmentWeekRow[];
}) {
  const [pending, startTransition] = useTransition();

  type Row = { open: string; close: string; enabled: boolean };
  const [rows, setRows] = useState<Record<number, Row>>(() =>
    seedRows(table, venueSchedules),
  );

  useEffect(() => {
    setRows(seedRows(table, venueSchedules));
  }, [table, venueSchedules]);

  function stampFromVenueTemplates() {
    setRows({
      ...Object.fromEntries(
        [0, 1, 2, 3, 4, 5, 6].map((d) => {
          const venue = venueSchedules.find((v) => v.weekday === d);
          return [
            d,
            {
              enabled: Boolean(venue),
              open: venue ? clipTime(venue.open_time) : "11:00",
              close: venue ? clipTime(venue.close_time) : "22:00",
            },
          ] as const;
        }),
      ),
    });
  }

  function clearAll() {
    setRows({
      ...Object.fromEntries(
        [0, 1, 2, 3, 4, 5, 6].map((d) => [d, { enabled: false, open: "11:00", close: "22:00" }] as const),
      ),
    });
  }

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-dashed border-[#ddd6fe] bg-white/85 px-3 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#64748b]">Custom weekday windows</p>
          <p className="mt-1 text-[12px] leading-relaxed text-[#64748b]">
            When you save overrides here they <span className="font-semibold text-[#475569]">replace</span> venue appointment hours entirely
            for <span className="font-semibold text-[#0f172a]">{table.label}</span>. Clearing every row hands control back to the venue grid above.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" className="h-9 rounded-full text-xs font-semibold" onClick={() => stampFromVenueTemplates()}>
            Stamp from venue
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-9 rounded-full text-xs font-semibold text-[#64748b]" onClick={() => clearAll()}>
            Clear custom
          </Button>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {WD.map((_label, dow) => {
          const row = rows[dow] ?? { open: "11:00", close: "22:00", enabled: false };
          return (
            <div key={dow} className={cn("rounded-lg border px-3 py-2 text-xs", row.enabled ? "border-[#cdb7fb] bg-[#faf5ff]" : "border-[#f1eefc] bg-[#f8fafc]")}>
              <label className="flex items-center gap-2 font-semibold text-[#0f172a]">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded border-[#d4d4d8]"
                  checked={row.enabled}
                  onChange={(e) =>
                    setRows((prev) => ({
                      ...prev,
                      [dow]: { ...row, enabled: e.target.checked },
                    }))
                  }
                />
                {_label}
              </label>
              <div className="mt-2 grid grid-cols-2 gap-1">
                <input
                  type="time"
                  disabled={!row.enabled || pending}
                  value={row.open}
                  onChange={(e) =>
                    setRows((prev) => ({
                      ...prev,
                      [dow]: { ...(prev[dow] ?? row), open: clipTime(e.target.value), enabled: prev[dow]?.enabled ?? row.enabled },
                    }))
                  }
                  className="h-9 w-full rounded-md border border-[#ebe7f7] px-1 text-[12px]"
                />
                <input
                  type="time"
                  disabled={!row.enabled || pending}
                  value={row.close}
                  onChange={(e) =>
                    setRows((prev) => ({
                      ...prev,
                      [dow]: { ...(prev[dow] ?? row), close: clipTime(e.target.value), enabled: prev[dow]?.enabled ?? row.enabled },
                    }))
                  }
                  className="h-9 w-full rounded-md border border-[#ebe7f7] px-1 text-[12px]"
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <Button
          type="button"
          size="sm"
          className="rounded-full px-6 text-xs font-semibold"
          disabled={pending}
          onClick={() => {
            const payload = [0, 1, 2, 3, 4, 5, 6]
              .map((weekday) => {
                const r = rows[weekday];
                if (!r?.enabled) return null;
                if (normalizeHm(r.open) >= normalizeHm(r.close)) return null;
                return { weekday, openTime: r.open, closeTime: r.close };
              })
              .filter(Boolean) as { weekday: number; openTime: string; closeTime: string }[];
            startTransition(() => {
              void (async () => {
                try {
                  await replaceFloorPlanTableWeekdayHours({
                    businessId,
                    tableId: table.id,
                    rows: payload,
                  });
                } catch (e) {
                  alert(e instanceof Error ? e.message : "Could not save table hours.");
                }
              })();
            });
          }}
        >
          {pending ? "Saving…" : "Save table windows"}
        </Button>
      </div>
    </div>
  );
}

function seedRows(table: StripFloorTableProps, venueSchedules: AppointmentWeekRow[]): Record<number, { open: string; close: string; enabled: boolean }> {
  return {
    ...Object.fromEntries(
      [0, 1, 2, 3, 4, 5, 6].map((d) => {
        const venue = venueSchedules.find((v) => v.weekday === d);
        const custom = rowForDay(table, d);
        const enabled = Boolean(custom ?? venue);
        return [
          d,
          {
            enabled,
            open: clipTime(custom?.open_time ?? venue?.open_time ?? "11:00"),
            close: clipTime(custom?.close_time ?? venue?.close_time ?? "22:00"),
          },
        ] as const;
      }),
    ),
  };
}

function normalizeHm(t: string): string {
  return clipTime(t).padStart(5, "0");
}
