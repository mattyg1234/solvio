import type { SupabaseClient } from "@supabase/supabase-js";

import { computeBookingMoney, paxTotal, round2 } from "@/lib/show-ops/calc";
import { loadSaleRateUnit } from "@/lib/show-ops/rate-cards";

type BizScope = { businessId: string };

export async function opsCountBookings(
  supabase: SupabaseClient,
  { businessId }: BizScope,
  args: { date: string; island?: string },
) {
  let q = supabase
    .from("show_bookings")
    .select("adults,children,infants,transport_required,island,show_name,payment_status,billing_mode")
    .eq("business_id", businessId)
    .eq("show_date", args.date)
    .is("cancelled_at", null);
  if (args.island) q = q.eq("island", args.island);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const pax = rows.reduce((s, b) => s + paxTotal(b.adults, b.children, b.infants), 0);
  const busPax = rows
    .filter((b) => b.transport_required)
    .reduce((s, b) => s + paxTotal(b.adults, b.children, b.infants), 0);
  const byShow = new Map<string, number>();
  for (const b of rows) {
    byShow.set(b.show_name, (byShow.get(b.show_name) || 0) + 1);
  }
  return {
    date: args.date,
    island: args.island || "all",
    bookings: rows.length,
    pax,
    bus_pax: busPax,
    direct_pax: pax - busPax,
    by_show: [...byShow.entries()].map(([show, count]) => ({ show, count })),
    unpaid_deposit: rows.filter((b) => b.billing_mode === "deposit" && b.payment_status !== "paid").length,
  };
}

export async function opsBusNeeds(
  supabase: SupabaseClient,
  { businessId }: BizScope,
  args: { date: string; island?: string },
) {
  let bq = supabase
    .from("show_bookings")
    .select("adults,children,infants,transport_required,island")
    .eq("business_id", businessId)
    .eq("show_date", args.date)
    .eq("transport_required", true)
    .is("cancelled_at", null);
  if (args.island) bq = bq.eq("island", args.island);
  const [{ data: bookings }, { data: orders }] = await Promise.all([
    bq,
    supabase
      .from("show_bus_orders")
      .select("island,seats_ordered,cost_total")
      .eq("business_id", businessId)
      .eq("show_date", args.date),
  ]);

  const byIsland = new Map<string, { bus_pax: number; seats_ordered: number; cost_total: number }>();
  for (const b of bookings ?? []) {
    const island = b.island || "unknown";
    const cur = byIsland.get(island) || { bus_pax: 0, seats_ordered: 0, cost_total: 0 };
    cur.bus_pax += paxTotal(b.adults, b.children, b.infants);
    byIsland.set(island, cur);
  }
  for (const o of orders ?? []) {
    if (args.island && o.island !== args.island) continue;
    const cur = byIsland.get(o.island) || { bus_pax: 0, seats_ordered: 0, cost_total: 0 };
    cur.seats_ordered += Number(o.seats_ordered) || 0;
    cur.cost_total += Number(o.cost_total) || 0;
    byIsland.set(o.island, cur);
  }

  const islands = [...byIsland.entries()].map(([island, v]) => ({
    island,
    bus_pax: v.bus_pax,
    seats_ordered: v.seats_ordered,
    spaces_left: v.seats_ordered - v.bus_pax,
    shortfall: Math.max(0, v.bus_pax - v.seats_ordered),
    cost_total: round2(v.cost_total),
    cost_per_head: v.bus_pax > 0 ? round2(v.cost_total / v.bus_pax) : null,
  }));

  return { date: args.date, islands };
}

export async function opsFindBooking(
  supabase: SupabaseClient,
  { businessId }: BizScope,
  args: { guest_name?: string; booking_ref?: string; date?: string; limit?: number },
) {
  let q = supabase
    .from("show_bookings")
    .select(
      "id,booking_ref,guest_name,show_name,show_date,island,hotel_name,adults,children,infants,total_cost,payment_status,transport_required,supplier_name",
    )
    .eq("business_id", businessId)
    .order("show_date", { ascending: false })
    .limit(Math.min(args.limit ?? 8, 20));
  if (args.booking_ref) q = q.ilike("booking_ref", `%${args.booking_ref}%`);
  if (args.guest_name) q = q.ilike("guest_name", `%${args.guest_name}%`);
  if (args.date) q = q.eq("show_date", args.date);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return { matches: data ?? [] };
}

export async function opsListUnpaid(
  supabase: SupabaseClient,
  { businessId }: BizScope,
  args: { date?: string; limit?: number },
) {
  let q = supabase
    .from("show_bookings")
    .select("booking_ref,guest_name,show_date,show_name,balance_remaining,payment_status,total_cost")
    .eq("business_id", businessId)
    .eq("billing_mode", "deposit")
    .neq("payment_status", "paid")
    .is("cancelled_at", null)
    .order("show_date")
    .limit(Math.min(args.limit ?? 20, 40));
  if (args.date) q = q.eq("show_date", args.date);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const total_balance = round2(rows.reduce((s, r) => s + Number(r.balance_remaining || 0), 0));
  return { count: rows.length, total_balance, rows };
}

export async function opsListProducts(supabase: SupabaseClient, { businessId }: BizScope) {
  const { data, error } = await supabase
    .from("show_products")
    .select("id,name,island,adult_price,child_price,transport_available")
    .eq("business_id", businessId)
    .eq("active", true)
    .order("name");
  if (error) throw new Error(error.message);
  return { products: data ?? [] };
}

export async function opsListSuppliers(supabase: SupabaseClient, { businessId }: BizScope) {
  const { data, error } = await supabase
    .from("show_suppliers")
    .select("id,name,billing_mode,deposit_percent")
    .eq("business_id", businessId)
    .eq("active", true)
    .order("name");
  if (error) throw new Error(error.message);
  return { suppliers: data ?? [] };
}

export async function opsListHotels(
  supabase: SupabaseClient,
  { businessId }: BizScope,
  args: { island?: string },
) {
  let q = supabase
    .from("show_hotels")
    .select("id,name,island,bus_stop_id")
    .eq("business_id", businessId)
    .eq("active", true)
    .order("name")
    .limit(80);
  if (args.island) q = q.eq("island", args.island);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return { hotels: data ?? [] };
}

export async function opsCreateBooking(
  supabase: SupabaseClient,
  scope: BizScope & { userId: string; transportSupplement?: number },
  args: {
    show_date: string;
    guest_name: string;
    product_id: string;
    supplier_id?: string;
    hotel_id?: string;
    adults?: number;
    children?: number;
    infants?: number;
    transport_required?: boolean;
    guest_mobile?: string;
    guest_email?: string;
    confirm: boolean;
  },
) {
  if (!args.confirm) {
    return {
      needs_confirm: true,
      message:
        "Draft ready. Call create_booking again with the same fields and confirm=true to save, or ask the user to confirm first.",
      draft: args,
    };
  }

  const adults = Math.max(0, args.adults ?? 2);
  const children = Math.max(0, args.children ?? 0);
  const infants = Math.max(0, args.infants ?? 0);

  const [{ data: product }, { data: supplier }, { data: hotel }] = await Promise.all([
    supabase
      .from("show_products")
      .select("*")
      .eq("id", args.product_id)
      .eq("business_id", scope.businessId)
      .maybeSingle(),
    args.supplier_id
      ? supabase
          .from("show_suppliers")
          .select("*")
          .eq("id", args.supplier_id)
          .eq("business_id", scope.businessId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    args.hotel_id
      ? supabase
          .from("show_hotels")
          .select("*")
          .eq("id", args.hotel_id)
          .eq("business_id", scope.businessId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (!product) throw new Error("Product not found — list_products first.");
  if (!args.guest_name.trim() || !args.show_date) throw new Error("guest_name and show_date required.");

  const transport = Boolean(args.transport_required && product.transport_available);
  let pickup_stop_id: string | null = null;
  let pickup_stop_name: string | null = null;
  let pickup_time: string | null = null;
  if (transport && hotel?.bus_stop_id) {
    const { data: stop } = await supabase
      .from("show_bus_stops")
      .select("*")
      .eq("id", hotel.bus_stop_id)
      .maybeSingle();
    if (stop) {
      pickup_stop_id = stop.id;
      pickup_stop_name = `${stop.resort} · ${stop.stop_name}`;
      pickup_time = stop.pickup_time;
    }
  }

  const rateCard = await loadSaleRateUnit(supabase, scope.businessId, supplier, args.product_id, transport);
  const money = computeBookingMoney({
    adults,
    children,
    infants,
    product: product as never,
    supplier: (supplier as never) ?? null,
    transportRequired: transport,
    transportSupplement: scope.transportSupplement ?? 0,
    rateCard,
  });

  const { data: refData, error: refErr } = await supabase.rpc("show_ops_next_booking_ref", {
    p_business_id: scope.businessId,
  });
  if (refErr) throw new Error(refErr.message);
  const booking_ref = String(refData);

  const { data: inserted, error } = await supabase
    .from("show_bookings")
    .insert({
      business_id: scope.businessId,
      booking_ref,
      show_date: args.show_date,
      guest_name: args.guest_name.trim(),
      guest_mobile: args.guest_mobile?.trim() || null,
      guest_email: args.guest_email?.trim() || null,
      hotel_id: hotel?.id ?? null,
      hotel_name: hotel?.name ?? null,
      transport_required: transport,
      pickup_stop_id,
      pickup_stop_name,
      pickup_time,
      dietary_required: false,
      supplier_id: supplier?.id ?? null,
      supplier_name: supplier?.name ?? null,
      billing_mode: money.billing_mode,
      product_id: product.id,
      show_name: product.name,
      island: product.island,
      adults,
      children,
      infants,
      total_cost: money.total_cost,
      deposit_amount: money.deposit_amount,
      balance_remaining: money.balance_remaining,
      nett_total: money.nett_total,
      adult_nett_total: money.adult_nett_total,
      child_nett_total: money.child_nett_total,
      sales_channel: "direct",
      payment_status: money.payment_status,
      custom_answers: {},
      created_by: scope.userId,
      updated_by: scope.userId,
    })
    .select("id,booking_ref,total_cost,deposit_amount,balance_remaining")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return { created: true, booking: inserted };
}

export async function opsBusinessSnapshot(
  supabase: SupabaseClient,
  { businessId }: BizScope,
  config: { islands: string[]; product_label: string; location_label: string },
) {
  const today = new Date().toISOString().slice(0, 10);
  const [{ count: productCount }, { count: hotelCount }, todayStats] = await Promise.all([
    supabase
      .from("show_products")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("active", true),
    supabase
      .from("show_hotels")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("active", true),
    opsCountBookings(supabase, { businessId }, { date: today }),
  ]);
  return {
    today,
    location_label: config.location_label,
    product_label: config.product_label,
    regions: config.islands,
    active_products: productCount ?? 0,
    active_hotels: hotelCount ?? 0,
    today_stats: todayStats,
  };
}
