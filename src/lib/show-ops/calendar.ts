import { paxTotal } from "@/lib/show-ops/calc";
import { showOpsFill, type ShowOpsShowFill } from "@/lib/show-ops/dashboard";
import { isoWeekday, showOpsMonthCells } from "@/lib/show-ops/nights";

export type CloseKind = "part" | "full";

export type CalendarProduct = {
  id: string;
  name: string;
  island: string;
  capacity: number | null;
  run_weekdays?: number[] | null;
  active?: boolean | null;
};

export type CalendarBooking = {
  show_date: string;
  island: string;
  product_id: string | null;
  show_name: string;
  adults: number;
  children: number;
  infants: number;
  transport_required: boolean;
};

export type CalendarBusOrder = {
  show_date: string;
  island: string;
  seats_ordered: number;
  cost_total?: number | null;
};

export type CalendarClose = {
  show_date: string;
  island: string;
  product_id: string | null;
  close_kind: CloseKind;
};

export type CalendarDayShow = {
  productId: string;
  name: string;
  island: string;
  pax: number;
  capacity: number | null;
  fill: ShowOpsShowFill;
  closeKind: CloseKind | null;
};

export type CalendarDayIsland = {
  island: string;
  busPax: number;
  seatsOrdered: number | null;
  busLeft: number | null;
  busCost: number | null;
  closeKind: CloseKind | null;
  shows: CalendarDayShow[];
};

export type CalendarDay = {
  iso: string;
  islands: CalendarDayIsland[];
  pax: number;
  busPax: number;
  hasShow: boolean;
};

export function productRunsOnDate(weekdays: number[] | null | undefined, iso: string): boolean {
  const days = [...new Set((weekdays ?? []).filter((n) => n >= 0 && n <= 6))];
  if (!days.length) return false;
  return days.includes(isoWeekday(iso));
}

export function saleBlockedForPartner(
  closes: CalendarClose[],
  opts: { showDate: string; island: string; productId: string | null },
): boolean {
  return closes.some((c) => {
    if (c.close_kind !== "full") return false;
    if (c.show_date !== opts.showDate || c.island !== opts.island) return false;
    return c.product_id == null || c.product_id === opts.productId;
  });
}

function closeFor(
  closes: CalendarClose[],
  iso: string,
  island: string,
  productId: string | null,
): CloseKind | null {
  const hits = closes.filter((c) => c.show_date === iso && c.island === island);
  const exact = hits.find((c) => c.product_id === productId);
  const islandWide = hits.find((c) => c.product_id == null);
  if (exact?.close_kind === "full" || islandWide?.close_kind === "full") return "full";
  return exact?.close_kind ?? islandWide?.close_kind ?? null;
}

function rowsByDate<T extends { show_date: string }>(rows: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const date = row.show_date;
    const group = grouped.get(date);
    if (group) group.push(row);
    else grouped.set(date, [row]);
  }
  return grouped;
}

export function buildCalendarDays(input: {
  year: number;
  month: number;
  products: CalendarProduct[];
  bookings: CalendarBooking[];
  busOrders: CalendarBusOrder[];
  closes?: CalendarClose[];
  island?: string;
}): CalendarDay[] {
  const islandFilter = (input.island || "").trim();
  const products = input.products.filter((p) => p.active !== false && (!islandFilter || p.island === islandFilter));
  const closes = input.closes ?? [];
  const bookingsByDate = rowsByDate(input.bookings);
  const ordersByDate = rowsByDate(input.busOrders);
  const closesByDate = rowsByDate(closes);
  const cells = showOpsMonthCells(input.year, input.month);
  const days: CalendarDay[] = [];

  for (const iso of cells) {
    if (!iso) continue;
    const dayBookings = bookingsByDate.get(iso) ?? [];
    const dayOrders = ordersByDate.get(iso) ?? [];
    const dayCloses = closesByDate.get(iso) ?? [];
    const islandNames = [
      ...new Set([
        ...products.filter((p) => productRunsOnDate(p.run_weekdays, iso)).map((p) => p.island),
        ...dayBookings.map((b) => b.island),
        ...dayOrders.map((o) => o.island),
        ...dayCloses.map((c) => c.island),
      ]),
    ]
      .filter((name) => !islandFilter || name === islandFilter)
      .sort();

    const islands: CalendarDayIsland[] = islandNames.map((island) => {
      const running = products.filter((p) => p.island === island && productRunsOnDate(p.run_weekdays, iso));
      const nightBookings = dayBookings.filter((b) => b.island === island);
      const showsById = new Map<string, CalendarDayShow>();
      for (const p of running) {
        showsById.set(p.id, {
          productId: p.id,
          name: p.name,
          island,
          pax: 0,
          capacity: p.capacity,
          fill: showOpsFill(0, p.capacity),
          closeKind: closeFor(dayCloses, iso, island, p.id),
        });
      }
      let busPax = 0;
      for (const b of nightBookings) {
        const pax = paxTotal(b.adults, b.children, b.infants);
        if (b.transport_required) busPax += pax;
        const key = b.product_id || b.show_name;
        const cur =
          showsById.get(key) ||
          ({
            productId: b.product_id || key,
            name: b.show_name,
            island,
            pax: 0,
            capacity: null,
            fill: "open",
            closeKind: closeFor(dayCloses, iso, island, b.product_id),
          } satisfies CalendarDayShow);
        cur.pax += pax;
        cur.fill = showOpsFill(cur.pax, cur.capacity);
        showsById.set(key, cur);
      }
      const order = dayOrders.find((o) => o.island === island);
      const seats = order ? Number(order.seats_ordered) : null;
      return {
        island,
        busPax,
        seatsOrdered: seats,
        busLeft: seats == null ? null : seats - busPax,
        busCost: order ? Number(order.cost_total || 0) : null,
        closeKind: closeFor(dayCloses, iso, island, null),
        shows: [...showsById.values()].sort((a, b) => a.name.localeCompare(b.name)),
      };
    });

    const pax = islands.reduce((s, i) => s + i.shows.reduce((n, sh) => n + sh.pax, 0), 0);
    const busPax = islands.reduce((s, i) => s + i.busPax, 0);
    days.push({
      iso,
      islands,
      pax,
      busPax,
      hasShow: islands.some((i) => i.shows.length > 0 || i.seatsOrdered != null),
    });
  }

  return days;
}

/** Nights in a window that have a scheduled show, a booking, or a bus order. */
export function nightsAheadKeys(input: {
  from: string;
  to: string;
  products: CalendarProduct[];
  bookings: Array<{ show_date: string; island: string }>;
  busOrders: Array<{ show_date: string; island: string }>;
  island?: string;
}): string[] {
  const islandFilter = (input.island || "").trim();
  const keys = new Set<string>();
  const start = new Date(`${input.from}T12:00:00Z`);
  const end = new Date(`${input.to}T12:00:00Z`);
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    for (const p of input.products) {
      if (p.active === false) continue;
      if (islandFilter && p.island !== islandFilter) continue;
      if (productRunsOnDate(p.run_weekdays, iso)) keys.add(`${iso}|${p.island}`);
    }
  }
  for (const b of input.bookings) {
    if (b.show_date < input.from || b.show_date > input.to) continue;
    if (islandFilter && b.island !== islandFilter) continue;
    keys.add(`${b.show_date}|${b.island}`);
  }
  for (const o of input.busOrders) {
    if (o.show_date < input.from || o.show_date > input.to) continue;
    if (islandFilter && o.island !== islandFilter) continue;
    keys.add(`${o.show_date}|${o.island}`);
  }
  return [...keys].sort();
}
