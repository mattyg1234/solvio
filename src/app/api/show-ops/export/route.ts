import { NextResponse } from "next/server";

import { resolveShowOpsBusinessId } from "@/lib/show-ops/resolve-business";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Tenant JSON backup — Plan B restore source (RPO target ≤ 24h when run nightly). */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const resolved = await resolveShowOpsBusinessId(supabase, user.id);
  if (!resolved?.show_ops_enabled) {
    return NextResponse.json({ error: "Show Ops not enabled" }, { status: 403 });
  }

  const { data: business } = await supabase
    .from("businesses")
    .select(
      "id,name,show_ops_enabled,show_ops_config,show_ops_billing_tier,show_ops_display_name,show_ops_custom_domain",
    )
    .eq("id", resolved.id)
    .maybeSingle();
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const biz = business.id;
  const [suppliers, products, stops, hotels, busOrders, bookings, payments, invoices, lines] =
    await Promise.all([
      supabase.from("show_suppliers").select("*").eq("business_id", biz),
      supabase.from("show_products").select("*").eq("business_id", biz),
      supabase.from("show_bus_stops").select("*").eq("business_id", biz),
      supabase.from("show_hotels").select("*").eq("business_id", biz),
      supabase.from("show_bus_orders").select("*").eq("business_id", biz),
      supabase.from("show_bookings").select("*").eq("business_id", biz),
      supabase.from("show_booking_payments").select("*").eq("business_id", biz),
      supabase.from("show_invoices").select("*").eq("business_id", biz),
      supabase.from("show_invoice_lines").select("*").eq("business_id", biz),
    ]);

  const payload = {
    exported_at: new Date().toISOString(),
    business,
    suppliers: suppliers.data ?? [],
    products: products.data ?? [],
    bus_stops: stops.data ?? [],
    hotels: hotels.data ?? [],
    bus_orders: busOrders.data ?? [],
    bookings: bookings.data ?? [],
    payments: payments.data ?? [],
    invoices: invoices.data ?? [],
    invoice_lines: lines.data ?? [],
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="show-ops-backup-${biz.slice(0, 8)}.json"`,
    },
  });
}
