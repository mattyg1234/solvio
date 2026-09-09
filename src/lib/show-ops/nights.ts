import type { SupabaseClient } from "@supabase/supabase-js";

/** UTC weekday (0=Sun..6=Sat) for a YYYY-MM-DD date. */
export function isoWeekday(iso: string): number {
  return new Date(`${iso}T12:00:00Z`).getUTCDay();
}

export function todayIsoUtc(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    .toISOString()
    .slice(0, 10);
}

export function showOpsNightLabel(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function showOpsNightMonth(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Nights a show actually runs: scheduled weekdays (next `months`) plus dates
 * already on the books. Never invents a free calendar.
 */
export function showOpsRunNights(input: {
  weekdays?: number[] | null;
  bookedDates?: string[];
  selected?: string;
  from?: string;
  months?: number;
}): string[] {
  const from = input.from && ISO_DATE.test(input.from) ? input.from : todayIsoUtc();
  const months = input.months ?? 12;
  const weekdays = [...new Set((input.weekdays ?? []).filter((n) => n >= 0 && n <= 6))];
  const booked = [...new Set((input.bookedDates ?? []).filter((d) => ISO_DATE.test(d)))];

  const out = new Set<string>();
  if (weekdays.length) {
    const start = new Date(`${from}T12:00:00Z`);
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + months);
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      if (weekdays.includes(d.getUTCDay())) out.add(d.toISOString().slice(0, 10));
    }
  }
  for (const d of booked) {
    if (d >= from) out.add(d);
  }
  if (input.selected && ISO_DATE.test(input.selected)) out.add(input.selected);
  return [...out].sort();
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function parseIsoYearMonth(iso: string): { year: number; month: number } | null {
  if (!ISO_DATE.test(iso)) return null;
  return { year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)) };
}

export function shiftYearMonth(year: number, month: number, delta: number): { year: number; month: number } {
  let y = year;
  let m = month + delta;
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  return { year: y, month: m };
}

/** Sunday-start month cells (ISO dates, UTC). Null = padding. */
export function showOpsMonthCells(year: number, month1: number): Array<string | null> {
  const first = `${year}-${pad2(month1)}-01`;
  const leading = isoWeekday(first);
  const lastDom = new Date(Date.UTC(year, month1, 0)).getUTCDate();
  const cells: Array<string | null> = Array.from({ length: leading }, () => null);
  for (let d = 1; d <= lastDom; d += 1) cells.push(`${year}-${pad2(month1)}-${pad2(d)}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}

export function groupNightsByMonth(dates: string[]): { month: string; dates: string[] }[] {
  const groups: { month: string; dates: string[] }[] = [];
  for (const d of dates) {
    const month = showOpsNightMonth(d);
    const last = groups[groups.length - 1];
    if (last && last.month === month) last.dates.push(d);
    else groups.push({ month, dates: [d] });
  }
  return groups;
}

export function bookedDatesByProduct(
  rows: Array<{ product_id: string | null; show_date: string }>,
): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const r of rows) {
    if (!r.product_id || !ISO_DATE.test(r.show_date)) continue;
    const list = map[r.product_id] ?? [];
    if (!list.includes(r.show_date)) list.push(r.show_date);
    map[r.product_id] = list;
  }
  for (const id of Object.keys(map)) map[id].sort();
  return map;
}

export function withBookedDates<T extends { id: string }>(
  products: T[],
  byProduct: Record<string, string[]>,
): Array<T & { booked_dates: string[] }> {
  return products.map((p) => ({ ...p, booked_dates: byProduct[p.id] ?? [] }));
}

export async function loadBookedDatesByProduct(
  supabase: SupabaseClient,
  businessId: string,
): Promise<Record<string, string[]>> {
  const from = todayIsoUtc();
  const end = new Date(`${from}T12:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + 12);
  // A busy operator has well over 1,000 future bookings; the API caps a single read at 1,000
  // rows, so page until a short page comes back or the picker silently loses nights.
  const rows: Array<{ product_id: string; show_date: string }> = [];
  const pageSize = 1000;
  for (let offset = 0; offset < 50000; offset += pageSize) {
    const { data, error } = await supabase
      .from("show_bookings")
      .select("product_id,show_date")
      .eq("business_id", businessId)
      .is("cancelled_at", null)
      .gte("show_date", from)
      .lte("show_date", end.toISOString().slice(0, 10))
      .order("show_date")
      .order("id")
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(`Could not load booked dates: ${error.message}`);
    rows.push(...((data ?? []) as Array<{ product_id: string; show_date: string }>));
    if (!data || data.length < pageSize) break;
  }
  return bookedDatesByProduct(rows);
}

export const SHOW_OPS_WEEKDAYS = [
  { n: 0, label: "Sun" },
  { n: 1, label: "Mon" },
  { n: 2, label: "Tue" },
  { n: 3, label: "Wed" },
  { n: 4, label: "Thu" },
  { n: 5, label: "Fri" },
  { n: 6, label: "Sat" },
] as const;
