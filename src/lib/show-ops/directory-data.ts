import type { SupabaseClient } from "@supabase/supabase-js";
import type { DirectoryHotel } from "@/components/show-ops/hotels-directory";
import type { DirectoryPickupStop } from "@/components/show-ops/pickup-points-directory";
import { collectPartnerPages } from "./partner-analytics";

/** Keep every searchable name while retaining the signed-in client's island policies. */
export async function loadDirectoryHotels(
  client: SupabaseClient,
  businessId: string,
  activeOnly = false,
) {
  const data = await collectPartnerPages<DirectoryHotel>(
    async (offset, limit) => {
      let query = client
        .from("show_hotels")
        .select("id,name,island,bus_stop_id,active")
        .eq("business_id", businessId);
      if (activeOnly) query = query.eq("active", true);
      const { data, error } = await query
        .order("name")
        .order("id")
        .range(offset, offset + limit - 1);
      if (error)
        throw new Error(
          "Could not load hotel names. Please refresh and try again.",
        );
      return data ?? [];
    },
  );
  return { data, error: null };
}
export async function loadDirectoryStops(
  client: SupabaseClient,
  businessId: string,
  activeOnly = false,
) {
  const data = await collectPartnerPages<DirectoryPickupStop>(
    async (offset, limit) => {
      let query = client
        .from("show_bus_stops")
        .select(
          "id,island,zone,resort,stop_name,pickup_time,sort_order,runs_on,guide_notes,active,map_url,photo_url",
        )
        .eq("business_id", businessId);
      if (activeOnly) query = query.eq("active", true);
      const { data, error } = await query
        .order("island")
        .order("sort_order")
        .order("stop_name")
        .order("id")
        .range(offset, offset + limit - 1);
      if (error)
        throw new Error(
          "Could not load pickup points. Please refresh and try again.",
        );
      return data ?? [];
    },
  );
  return { data, error: null };
}
