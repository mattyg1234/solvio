import type { SupabaseClient } from "@supabase/supabase-js";

import type { ExistingBooking, SheetLookups } from "@/lib/show-ops/booking-sheet";

const PAGE = 1000;

async function all<T>(admin: SupabaseClient, table: string, select: string, businessId: string): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin.from(table).select(select).eq("business_id", businessId).order("id", { ascending: true }).range(offset, offset + PAGE - 1);
    if (error) throw new Error(`Could not load ${table.replace("show_", "")}: ${error.message}`);
    const rows = (data ?? []) as unknown as T[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

/** Partners, shows, hotels and bus stops: the dropdowns in the sheet and what each row is matched against. */
export async function loadSheetLookups(admin: SupabaseClient, businessId: string): Promise<SheetLookups> {
  const [suppliers, products, hotels, stops] = await Promise.all([
    all<SheetLookups["suppliers"][number]>(admin, "show_suppliers", "id,name,island,partner_type,active", businessId),
    all<SheetLookups["products"][number]>(admin, "show_products", "id,name,island,transport_available,active,run_weekdays,run_dates,dark_dates", businessId),
    all<SheetLookups["hotels"][number]>(admin, "show_hotels", "id,name,island,bus_stop_id,active", businessId),
    all<SheetLookups["stops"][number]>(admin, "show_bus_stops", "id,island,resort,stop_name,runs_on,active", businessId),
  ]);
  return { suppliers, products, hotels, stops };
}

/** Live bookings on the sheet's nights, so a booking already re-typed into the Hub is not added twice. */
export async function loadExistingForDates(admin: SupabaseClient, businessId: string, dates: string[]): Promise<ExistingBooking[]> {
  const unique = [...new Set(dates)].filter(Boolean);
  const out: ExistingBooking[] = [];
  for (let i = 0; i < unique.length; i += 50) {
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await admin.from("show_bookings").select("booking_ref,show_date,guest_name,supplier_id")
        .eq("business_id", businessId).is("cancelled_at", null).in("show_date", unique.slice(i, i + 50))
        .order("id", { ascending: true }).range(offset, offset + PAGE - 1);
      if (error) throw new Error(`Could not check for bookings already in the Hub: ${error.message}`);
      const rows = (data ?? []) as ExistingBooking[];
      out.push(...rows);
      if (rows.length < PAGE) break;
    }
  }
  return out;
}
