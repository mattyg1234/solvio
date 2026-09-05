import { showOpsCurrencyFor } from "./config";
import { localDayUtcRange, SHOW_OPS_OFFICE_TZ } from "./daily-sales";
import type { ShowOpsConfig, ShowOpsCurrency } from "./types";

export type PartnerAnalyticsBooking = {
  id: string;
  created_at: string;
  created_by: string | null;
  cancelled_at: string | null;
  adults: number | null;
  children: number | null;
  infants: number | null;
  total_cost: number | null;
  island: string | null;
};
export type PartnerAnalyticsRange = {
  from: string;
  to: string;
  start: string;
  end: string;
};
export type PartnerSalesTotals = {
  bookings: number;
  passengers: number;
  sales: Partial<Record<ShowOpsCurrency, number>>;
  missingValueBookings: number;
};
export type PartnerSellerTotals = PartnerSalesTotals & {
  userId: string;
  name: string;
};

export function partnerAnalyticsRange(
  from?: string,
  to?: string,
  now = new Date(),
): PartnerAnalyticsRange {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHOW_OPS_OFFICE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const startDate = from || `${today.slice(0, 7)}-01`;
  const endDate = to || today;
  for (const date of [startDate, endDate]) {
    const parsed = new Date(`${date}T12:00:00Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== date
    ) {
      throw new Error("Choose valid dates for your results.");
    }
  }
  if (startDate > endDate)
    throw new Error("The start date must be on or before the end date.");
  return {
    from: startDate,
    to: endDate,
    start: localDayUtcRange(startDate).start,
    end: localDayUtcRange(endDate).end,
  };
}

const emptyTotals = (): PartnerSalesTotals => ({
  bookings: 0,
  passengers: 0,
  sales: {},
  missingValueBookings: 0,
});

/** Creator labels must come from organisation-scoped seller history, never a tenant-wide profile list. */
export function summarisePartnerBookings(
  rows: PartnerAnalyticsBooking[],
  range: PartnerAnalyticsRange,
  config: ShowOpsConfig,
  sellerNames: ReadonlyMap<string, string>,
): PartnerSalesTotals & {
  sellers: PartnerSellerTotals[];
  unattributed: PartnerSalesTotals;
} {
  const total = emptyTotals();
  const unattributed = emptyTotals();
  const sellers = new Map<string, PartnerSellerTotals>();
  const start = Date.parse(range.start);
  const end = Date.parse(range.end);
  for (const row of rows) {
    const created = Date.parse(row.created_at);
    if (
      row.cancelled_at ||
      !Number.isFinite(created) ||
      created < start ||
      created >= end
    )
      continue;
    const currency = showOpsCurrencyFor(config, row.island);
    let seller: PartnerSalesTotals = unattributed;
    const name = row.created_by ? sellerNames.get(row.created_by) : undefined;
    if (row.created_by && name) {
      if (!sellers.has(row.created_by))
        sellers.set(row.created_by, {
          ...emptyTotals(),
          userId: row.created_by,
          name,
        });
      seller = sellers.get(row.created_by)!;
    }
    for (const target of [total, seller]) {
      target.bookings += 1;
      target.passengers += [
        row.adults,
        row.children,
        row.infants,
      ].reduce<number>(
        (sum, value) =>
          sum +
          (value != null && Number.isFinite(Number(value)) ? Number(value) : 0),
        0,
      );
      if (row.total_cost === null || !Number.isFinite(Number(row.total_cost)))
        target.missingValueBookings += 1;
      else
        target.sales[currency] =
          (target.sales[currency] ?? 0) +
          Math.round(Number(row.total_cost) * 100);
    }
  }
  for (const target of [total, unattributed, ...sellers.values()]) {
    for (const currency of Object.keys(target.sales) as ShowOpsCurrency[])
      target.sales[currency] = target.sales[currency]! / 100;
  }
  return {
    ...total,
    sellers: [...sellers.values()].sort(
      (a, b) => b.bookings - a.bookings || a.name.localeCompare(b.name),
    ),
    unattributed,
  };
}

/** The RPC orders rows deterministically; keep reading beyond PostgREST's per-page cap. */
export async function collectPartnerPages<T>(
  fetchPage: (offset: number, limit: number) => Promise<T[]>,
): Promise<T[]> {
  const rows: T[] = [];
  const limit = 500;
  for (let offset = 0; ; offset += limit) {
    const page = await fetchPage(offset, limit);
    rows.push(...page);
    if (page.length < limit) return rows;
  }
}
