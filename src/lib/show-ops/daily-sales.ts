import { addDaysIso, paxTotal, round2 } from "@/lib/show-ops/calc";

/**
 * "Daily sales" = the bookings the desk took on one calendar day in the office
 * timezone (the same reading the 07:00 digest uses for "taken yesterday").
 * Pure helpers here; the CSV route and the Reports block both feed rows in.
 */

export const SHOW_OPS_OFFICE_TZ = "Atlantic/Canary";

export type DailySalesRow = {
  booking_ref: string;
  guest_name: string;
  show_name: string;
  island: string;
  show_date: string;
  hotel_name: string | null;
  supplier_name: string | null;
  sales_channel: string;
  adults: number;
  children: number;
  infants: number;
  total_cost: number;
  billing_mode: string;
  created_at: string;
};

export const DAILY_SALES_COLUMNS: Array<keyof DailySalesRow> = [
  "booking_ref",
  "guest_name",
  "show_name",
  "island",
  "show_date",
  "hotel_name",
  "supplier_name",
  "sales_channel",
  "adults",
  "children",
  "infants",
  "total_cost",
  "billing_mode",
  "created_at",
];

export type DailySalesSummary = {
  date: string;
  timeZone: string;
  totalBookings: number;
  totalPax: number;
  totalValue: number;
  byIsland: Array<[string, number]>;
  byChannel: Array<[string, number]>;
  /** "HH:00" in the office timezone, sorted, only hours with a sale. */
  byHour: Array<[string, number]>;
};

export type DailySales = { summary: DailySalesSummary; rows: DailySalesRow[] };

/** Offset (local − UTC) in ms for the given instant in `timeZone`. */
function tzOffsetMs(epochMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(epochMs));
  const get = (t: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - epochMs;
}

/** UTC instants [start, end) that cover one local calendar day. */
export function localDayUtcRange(date: string, timeZone = SHOW_OPS_OFFICE_TZ): { start: string; end: string } {
  const toUtc = (iso: string) => {
    const guess = Date.parse(`${iso}T00:00:00Z`);
    return new Date(guess - tzOffsetMs(guess, timeZone)).toISOString();
  };
  return { start: toUtc(date), end: toUtc(addDaysIso(date, 1)) };
}

/** "HH:00" hour bucket in the office timezone, or "unknown" when there is no timestamp. */
export function localHourBucket(createdAt: string | null | undefined, timeZone = SHOW_OPS_OFFICE_TZ): string {
  if (!createdAt) return "unknown";
  const t = new Date(createdAt);
  if (Number.isNaN(t.getTime())) return "unknown";
  const hour = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(t);
  return `${hour.padStart(2, "0")}:00`;
}

export function summariseDailySales(
  date: string,
  rows: DailySalesRow[],
  timeZone = SHOW_OPS_OFFICE_TZ,
): DailySales {
  const byIsland = new Map<string, number>();
  const byChannel = new Map<string, number>();
  const byHour = new Map<string, number>();
  let totalPax = 0;
  let totalValue = 0;
  for (const r of rows) {
    byIsland.set(r.island || "—", (byIsland.get(r.island || "—") || 0) + 1);
    byChannel.set(r.sales_channel || "—", (byChannel.get(r.sales_channel || "—") || 0) + 1);
    const hour = localHourBucket(r.created_at, timeZone);
    byHour.set(hour, (byHour.get(hour) || 0) + 1);
    totalPax += paxTotal(Number(r.adults) || 0, Number(r.children) || 0, Number(r.infants) || 0);
    totalValue += Number(r.total_cost) || 0;
  }
  const desc = (a: [string, number], b: [string, number]) => b[1] - a[1] || a[0].localeCompare(b[0]);
  return {
    summary: {
      date,
      timeZone,
      totalBookings: rows.length,
      totalPax,
      totalValue: round2(totalValue),
      byIsland: [...byIsland.entries()].sort(desc),
      byChannel: [...byChannel.entries()].sort(desc),
      byHour: [...byHour.entries()].sort((a, b) => a[0].localeCompare(b[0])),
    },
    rows,
  };
}

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Summary section first, blank line, then one row per booking. */
export function dailySalesCsv({ summary, rows }: DailySales): string {
  const lines: string[] = ["section,key,value"];
  lines.push(`summary,date,${csvCell(summary.date)}`);
  lines.push(`summary,timezone,${csvCell(summary.timeZone)}`);
  lines.push(`summary,total_bookings,${summary.totalBookings}`);
  lines.push(`summary,total_pax,${summary.totalPax}`);
  lines.push(`summary,total_value,${summary.totalValue}`);
  for (const [k, v] of summary.byIsland) lines.push(`by_island,${csvCell(k)},${v}`);
  for (const [k, v] of summary.byChannel) lines.push(`by_channel,${csvCell(k)},${v}`);
  for (const [k, v] of summary.byHour) lines.push(`by_hour,${csvCell(k)},${v}`);
  lines.push("");
  lines.push(DAILY_SALES_COLUMNS.join(","));
  for (const row of rows) {
    lines.push(DAILY_SALES_COLUMNS.map((h) => csvCell(row[h])).join(","));
  }
  return lines.join("\n");
}

export function dailySalesCsvHref(date: string, island: string): string {
  const p = new URLSearchParams();
  p.set("date", date);
  if (island) p.set("island", island);
  return `/api/show-ops/daily-sales.csv?${p.toString()}`;
}
