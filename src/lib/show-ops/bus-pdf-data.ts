import type { SupabaseClient } from "@supabase/supabase-js";
import { buildBusPdf, type BusPdfGroup, type BusPdfRow } from "./bus-pdf";
type Booking = BusPdfRow & {
  id: string;
  island: string;
  pickup_stop_id: string | null;
  pickup_stop_name: string | null;
  pickup_time: string | null;
};
type Stop = {
  id: string;
  resort: string;
  stop_name: string;
  pickup_time: string | null;
  guide_notes: string | null;
  map_url: string | null;
  photo_url: string | null;
};

export async function loadBusListPdf(
  client: SupabaseClient,
  businessId: string,
  businessName: string,
  input: { date: string; bookingIds: string[] },
): Promise<Uint8Array> {
  const { date, bookingIds } = input;
  const bookings: Booking[] = [];
  for (let offset = 0; offset < bookingIds.length; offset += 200) {
    const { data, error } = await client
      .from("show_bookings")
      .select(
        "id,booking_ref,guest_name,hotel_name,guest_mobile,adults,children,infants,dietary_required,dietary_notes,island,pickup_stop_id,pickup_stop_name,pickup_time",
      )
      .eq("business_id", businessId)
      .eq("show_date", date)
      .eq("transport_required", true)
      .is("cancelled_at", null)
      .in("id", bookingIds.slice(offset, offset + 200));
    if (error)
      throw new Error("Could not load this bus list. Please try again.");
    bookings.push(...(data ?? []));
  }
  // A deleted, moved, cancelled or inaccessible booking must never produce a silently partial list.
  if (bookings.length !== bookingIds.length)
    throw new Error(
      "This list has changed or your access has changed. Reload it before downloading.",
    );
  const byId = new Map(bookings.map((row) => [row.id, row]));
  const stopIds = [
    ...new Set(
      bookings
        .map((row) => row.pickup_stop_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const stops: Stop[] = [];
  for (let offset = 0; offset < stopIds.length; offset += 200) {
    const { data, error } = await client
      .from("show_bus_stops")
      .select("id,resort,stop_name,pickup_time,guide_notes,map_url,photo_url")
      .eq("business_id", businessId)
      .in("id", stopIds.slice(offset, offset + 200));
    if (error)
      throw new Error("Could not load pick-up instructions. Please try again.");
    stops.push(...(data ?? []));
  }
  const islands = [...new Set(bookings.map((row) => row.island))];
  const { data: orders, error: guideError } = await client
    .from("show_bus_orders")
    .select("island,guide_name")
    .eq("business_id", businessId)
    .eq("show_date", date)
    .in("island", islands);
  if (guideError)
    throw new Error("Could not load guide details. Please try again.");
  const stopById = new Map(stops.map((stop) => [stop.id, stop]));
  const grouped = new Map<string, BusPdfGroup>();
  for (const id of bookingIds) {
    const row = byId.get(id)!;
    const key = row.pickup_stop_id || `none-${row.island}`;
    const stop = row.pickup_stop_id ? stopById.get(row.pickup_stop_id) : null;
    if (!grouped.has(key))
      grouped.set(key, {
        island: row.island,
        label: stop
          ? `${stop.resort} · ${stop.stop_name}`
          : row.pickup_stop_name || "Pick-up not set",
        time: String(stop?.pickup_time || row.pickup_time || "—").slice(0, 5),
        notes: stop?.guide_notes || "",
        mapUrl: stop?.map_url ?? null,
        photoUrl: stop?.photo_url ?? null,
        rows: [],
      });
    grouped.get(key)!.rows.push(row);
  }
  const { data: savedOrders, error: savedError } = await client
    .from("show_bus_night_orders")
    .select("island,stop_ids")
    .eq("business_id", businessId)
    .eq("show_date", date)
    .in("island", islands);
  if (savedError)
    throw new Error("Could not load the saved pickup order. Nothing was sent.");
  const savedRank = new Map<string, number>();
  for (const order of savedOrders ?? [])
    for (const [index, id] of (order.stop_ids ?? []).entries())
      savedRank.set(`${order.island}:${id}`, index);
  const sortedGroups = [...grouped.entries()].sort(
    ([aKey, a], [bKey, b]) =>
      a.island.localeCompare(b.island) ||
      (savedRank.get(`${a.island}:${aKey}`) ?? 100000) -
        (savedRank.get(`${b.island}:${bKey}`) ?? 100000) ||
      a.time.localeCompare(b.time),
  );
  const bytes = await buildBusPdf({
    date,
    businessName: businessName,
    groups: sortedGroups.map(([, group]) => group),
    guides: Object.fromEntries(
      (orders ?? [])
        .filter((order) => order.guide_name)
        .map((order) => [order.island, String(order.guide_name)]),
    ),
  });
  return bytes;
}
