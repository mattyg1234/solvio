/**
 * Seats per coach. Gran Canaria runs two buses on a night (Joel, 17 Sept 2026);
 * every other route is one. A stop belongs to a bus permanently (bus_no); the
 * night's order carries how many seats each coach has.
 */

export type BusOrderSeats = {
  seats_ordered: number | null | undefined;
  bus_count?: number | null;
  seats_by_bus?: number[] | null;
};

export type BusLoad = {
  bus: number;
  seats: number | null;
  pax: number;
  free: number | null;
  stops: number;
};

export function busCount(order: BusOrderSeats | null | undefined): number {
  return Math.max(1, Math.trunc(Number(order?.bus_count) || 1));
}

/** Capacity per coach, in bus order. Explicit split wins; otherwise the total is shared evenly, remainder on bus 1. */
export function seatsPerBus(order: BusOrderSeats | null | undefined): number[] | null {
  if (!order || order.seats_ordered == null) return null;
  const n = busCount(order);
  const explicit = Array.isArray(order.seats_by_bus) ? order.seats_by_bus.map((s) => Math.max(0, Math.trunc(Number(s) || 0))) : null;
  if (explicit && explicit.length === n) return explicit;
  const total = Math.max(0, Math.trunc(Number(order.seats_ordered) || 0));
  const base = Math.floor(total / n);
  return Array.from({ length: n }, (_, i) => base + (i === 0 ? total - base * n : 0));
}

/** Pax on each coach, from which stop every bus guest is picked up at. Guests with no stop yet count on bus 1. */
export function busLoads(
  order: BusOrderSeats | null | undefined,
  stops: Array<{ id: string; bus_no?: number | null }>,
  paxByStop: Record<string, number>,
  unassignedPax = 0,
): BusLoad[] {
  const seats = seatsPerBus(order);
  const n = Math.max(busCount(order), ...stops.map((s) => Math.trunc(Number(s.bus_no) || 1)), 1);
  const loads: BusLoad[] = Array.from({ length: n }, (_, i) => ({ bus: i + 1, seats: seats?.[i] ?? null, pax: 0, free: null, stops: 0 }));
  for (const s of stops) {
    const b = Math.min(n, Math.max(1, Math.trunc(Number(s.bus_no) || 1)));
    loads[b - 1].pax += paxByStop[s.id] ?? 0;
    loads[b - 1].stops += 1;
  }
  loads[0].pax += Math.max(0, unassignedPax);
  for (const l of loads) l.free = l.seats == null ? null : l.seats - l.pax;
  return loads;
}

/** Parse the per-bus seat inputs off the bus order form: seats_bus_1, seats_bus_2 … Returns null when the form did not carry a split. */
export function parseSeatsByBus(get: (name: string) => unknown, count: number): number[] | null {
  const n = Math.max(1, Math.trunc(count) || 1);
  if (n < 2) return null;
  const out: number[] = [];
  for (let i = 1; i <= n; i++) {
    const raw = get(`seats_bus_${i}`);
    if (raw == null || String(raw).trim() === "") return null;
    out.push(Math.max(0, Math.trunc(Number(raw) || 0)));
  }
  return out;
}
