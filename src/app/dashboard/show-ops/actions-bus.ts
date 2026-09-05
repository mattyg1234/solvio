"use server";

import { revalidatePath } from "next/cache";

import { islandAllowed } from "@/lib/show-ops/island-access";
import { mergeBusNightOrder } from "@/lib/show-ops/bus-night-order";
import { requireShowOpsContext, requireShowOpsRole } from "@/lib/show-ops/access";

/*
 * Tonight's coach running order for the bus run sheet.
 *
 * The office drags stops into the order the driver will do them tonight. That
 * used to live in the browser only and was gone on refresh — now it is one row
 * per island per night in show_bus_night_orders. Clearing the row puts the
 * sheet back on printed pick-up times. The permanent stop order under Bus
 * board (show_bus_stops.sort_order) is never touched from here.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type BusNightOrder = { island: string; stop_ids: string[] };

export type BusNightSheet = {
  /** Saved running order per island for this night. Empty = printed pick-up times. */
  orders: BusNightOrder[];
  /** Map / photo links per stop id, for the stops that have them. */
  stops: Record<string, { map_url: string | null; photo_url: string | null }>;
  /** Guide on the coach per island, from tonight's bus order. */
  guides: Record<string, string>;
};

function revalidateSheet() {
  revalidatePath("/dashboard/show-ops/lists");
  revalidatePath("/dashboard/show-ops/buses");
}

/**
 * Everything the run sheet needs beyond the bookings it already has: the saved
 * order, stop map/photo links and tonight's guide names. One call on mount.
 */
export async function getBusNightOrderAction(
  showDate: string,
): Promise<{ ok: true; sheet: BusNightSheet } | { ok: false; message: string }> {
  const ctx = await requireShowOpsContext();
  const date = String(showDate ?? "").trim();
  if (!DATE_RE.test(date)) return { ok: false, message: "Bad date." };

  const [{ data: orders, error }, { data: stops, error: stopsError }, { data: busOrders, error: guidesError }] = await Promise.all([
    ctx.supabase
      .from("show_bus_night_orders")
      .select("island,stop_ids")
      .eq("business_id", ctx.business.id)
      .eq("show_date", date),
    ctx.supabase
      .from("show_bus_stops")
      .select("id,map_url,photo_url")
      .eq("business_id", ctx.business.id)
      .or("map_url.not.is.null,photo_url.not.is.null"),
    ctx.supabase
      .from("show_bus_orders")
      .select("island,guide_name")
      .eq("business_id", ctx.business.id)
      .eq("show_date", date),
  ]);
  if (error || stopsError || guidesError) return { ok: false, message: "Could not load the saved bus details. Refresh and try again." };

  const sheet: BusNightSheet = { orders: [], stops: {}, guides: {} };
  for (const o of orders ?? []) {
    sheet.orders.push({ island: String(o.island), stop_ids: Array.isArray(o.stop_ids) ? o.stop_ids.map(String) : [] });
  }
  for (const s of stops ?? []) {
    sheet.stops[String(s.id)] = {
      map_url: (s.map_url as string | null) ?? null,
      photo_url: (s.photo_url as string | null) ?? null,
    };
  }
  for (const o of busOrders ?? []) {
    const name = String(o.guide_name ?? "").trim();
    if (name) sheet.guides[String(o.island)] = name;
  }
  return { ok: true, sheet };
}

/** Save tonight's order for one island. Replaces whatever was saved before. */
export async function saveBusNightOrderAction(
  showDate: string,
  island: string,
  stopIds: string[],
): Promise<{ ok: true } | { ok: false; message: string }> {
  const ctx = await requireShowOpsRole("office");
  const date = String(showDate ?? "").trim();
  const isl = String(island ?? "").trim();
  if (!DATE_RE.test(date)) return { ok: false, message: "Bad date." };
  if (!isl) return { ok: false, message: "Island required." };
  if (!islandAllowed(ctx.allowedIslands, isl)) return { ok: false, message: "You do not have access to this island." };
  const ids = stopIds;
  if (!Array.isArray(ids) || !ids.length || ids.length > 1000 || new Set(ids).size !== ids.length || ids.some((id) => typeof id !== "string" || !UUID_RE.test(id))) return { ok: false, message: "Choose a valid pickup order." };
  const [{ data: stops, error: stopError }, { data: previous, error: previousError }] = await Promise.all([
    ctx.supabase.from("show_bus_stops").select("id").eq("business_id", ctx.business.id).eq("island", isl).order("sort_order").order("id"),
    ctx.supabase.from("show_bus_night_orders").select("stop_ids").eq("business_id", ctx.business.id).eq("island", isl).eq("show_date", date).maybeSingle(),
  ]);
  if (stopError || previousError || ids.some((id) => !(stops ?? []).some((stop) => stop.id === id))) return { ok: false, message: "One of these pickup points is outside your island access. Refresh the list." };
  const base = [...(Array.isArray(previous?.stop_ids) ? previous.stop_ids.filter(id => (stops ?? []).some(stop => stop.id === id)) : []), ...(stops ?? []).map((stop) => stop.id)];
  const merged = mergeBusNightOrder([...new Set(base)], ids);

  const { error } = await ctx.supabase.from("show_bus_night_orders").upsert(
    {
      business_id: ctx.business.id,
      show_date: date,
      island: isl,
      stop_ids: merged,
      updated_by: ctx.user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "business_id,show_date,island" },
  );
  if (error) return { ok: false, message: error.message };
  revalidateSheet();
  return { ok: true };
}

/** Back to printed pick-up times for one island tonight. */
export async function clearBusNightOrderAction(
  showDate: string,
  island: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const ctx = await requireShowOpsRole("office");
  const date = String(showDate ?? "").trim();
  const isl = String(island ?? "").trim();
  if (!DATE_RE.test(date)) return { ok: false, message: "Bad date." };
  if (!islandAllowed(ctx.allowedIslands, isl)) return { ok: false, message: "You do not have access to this island." };
  if (!isl) return { ok: false, message: "Island required." };

  const { error } = await ctx.supabase
    .from("show_bus_night_orders")
    .delete()
    .eq("business_id", ctx.business.id)
    .eq("show_date", date)
    .eq("island", isl);
  if (error) return { ok: false, message: error.message };
  revalidateSheet();
  return { ok: true };
}
