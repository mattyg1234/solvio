/**
 * Create MHT Show Ops login + seed master data / sample bookings.
 * Uses Closemate env (shared Supabase) for service role.
 *
 *   npx tsx scripts/seed-mht-show-ops.mts
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const EMAIL = "mht@solviosystems.com";
const PASSWORD = "MHT-ShowOps-2026!";

function loadEnv(path: string) {
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(path, "utf8").split("\n")) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    let k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

function isoDate(offsetDays: number) {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

async function main() {
  const env = loadEnv("/Users/mattygale/Village/sites/closemate/.env.local");
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase service credentials in Closemate .env.local");

  const sb = createClient(url, key, { auth: { persistSession: false } });

  // Find or create auth user (avoid broken trigger path: create without business_name)
  let userId: string | null = null;
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => (u.email || "").toLowerCase() === EMAIL);
    if (hit) {
      userId = hit.id;
      break;
    }
    if (data.users.length < 200) break;
  }

  if (!userId) {
    const { data, error } = await sb.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: "MHT Office" },
    });
    if (error) throw error;
    userId = data.user.id;
    console.log("Created user", userId);
  } else {
    const { error } = await sb.auth.admin.updateUserById(userId, {
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: "MHT Office" },
    });
    if (error) throw error;
    console.log("Updated password for existing user", userId);
  }

  await sb.from("profiles").upsert({
    id: userId,
    email: EMAIL,
    full_name: "MHT Office",
    updated_at: new Date().toISOString(),
  });

  const showOpsConfig = {
    islands: ["Lanzarote", "Fuerteventura", "Tenerife", "UK Tour"],
    partner_types: ["tour_op", "agency", "hotel", "shop", "partner"],
    dietary_mode: "free_text",
    enabled_modules: ["bookings", "lists", "payments", "invoices", "commercial"],
    feature_flags: { mht_tracker_v1: true },
    report_presets: { office_sort: "supplier_surname" },
  };

  const platformCapabilities = {
    appointments: false,
    events: false,
    tables: false,
    ai_receptionist: false,
    lead_generation: false,
    show_ops: true,
  };

  let { data: business } = await sb
    .from("businesses")
    .select("id")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!business) {
    const { data: created, error } = await sb
      .from("businesses")
      .insert({
        owner_id: userId,
        name: "MHT Show Ops",
        onboarding_completed_at: new Date().toISOString(),
        show_ops_enabled: true,
        show_ops_billing_tier: "finance",
        show_ops_config: showOpsConfig,
        show_ops_display_name: "MHT Show Ops",
        show_ops_primary_color: "#0f766e",
        show_ops_accent_color: "#14b8a6",
        platform_capabilities: platformCapabilities,
        subscription_tier: "business",
      })
      .select("id")
      .single();
    if (error) throw error;
    business = created;
    console.log("Created business", business.id);
  } else {
    const { error } = await sb
      .from("businesses")
      .update({
        name: "MHT Show Ops",
        onboarding_completed_at: new Date().toISOString(),
        show_ops_enabled: true,
        show_ops_billing_tier: "finance",
        show_ops_config: showOpsConfig,
        show_ops_display_name: "MHT Show Ops",
        show_ops_primary_color: "#0f766e",
        show_ops_accent_color: "#14b8a6",
        platform_capabilities: platformCapabilities,
        subscription_tier: "business",
        updated_at: new Date().toISOString(),
      })
      .eq("id", business.id);
    if (error) throw error;
    console.log("Updated business", business.id);
  }

  const businessId = business.id as string;

  // Clear previous seed rows for idempotent re-runs
  await sb.from("show_booking_payments").delete().eq("business_id", businessId);
  await sb.from("show_invoice_lines").delete().eq("business_id", businessId);
  await sb.from("show_invoices").delete().eq("business_id", businessId);
  await sb.from("show_bookings").delete().eq("business_id", businessId);
  await sb.from("show_bus_orders").delete().eq("business_id", businessId);
  await sb.from("show_hotels").delete().eq("business_id", businessId);
  await sb.from("show_bus_stops").delete().eq("business_id", businessId);
  await sb.from("show_products").delete().eq("business_id", businessId);
  await sb.from("show_suppliers").delete().eq("business_id", businessId);

  const suppliers = [
    {
      name: "Canary Excursions",
      partner_type: "tour_op",
      billing_mode: "deposit",
      deposit_percent: 30,
      invoice_nett_percent: 100,
    },
    {
      name: "Island Agency SL",
      partner_type: "agency",
      billing_mode: "invoice",
      deposit_percent: 0,
      invoice_nett_percent: 85,
    },
    {
      name: "Hotel Desk Direct",
      partner_type: "hotel",
      billing_mode: "deposit",
      deposit_percent: 50,
      invoice_nett_percent: 100,
    },
  ];
  const { data: supplierRows, error: supErr } = await sb
    .from("show_suppliers")
    .insert(suppliers.map((s) => ({ ...s, business_id: businessId, active: true })))
    .select("*");
  if (supErr) throw supErr;

  const products = [
    {
      name: "Volcano Night Show",
      island: "Lanzarote",
      adult_price: 65,
      child_price: 35,
      infant_price: 0,
      adult_nett: 45,
      child_nett: 25,
      transport_available: true,
      capacity: 220,
    },
    {
      name: "Desert Dinner Experience",
      island: "Fuerteventura",
      adult_price: 75,
      child_price: 40,
      infant_price: 0,
      adult_nett: 52,
      child_nett: 28,
      transport_available: true,
      capacity: 180,
    },
    {
      name: "Siam Park Evening",
      island: "Tenerife",
      adult_price: 55,
      child_price: 30,
      infant_price: 0,
      adult_nett: 38,
      child_nett: 20,
      transport_available: true,
      capacity: 300,
    },
    {
      name: "UK Theatre Package",
      island: "UK Tour",
      adult_price: 89,
      child_price: 49,
      infant_price: 0,
      adult_nett: 60,
      child_nett: 32,
      transport_available: false,
      capacity: 120,
    },
  ];
  const { data: productRows, error: prodErr } = await sb
    .from("show_products")
    .insert(products.map((p) => ({ ...p, business_id: businessId, ticket_type: "standard", active: true })))
    .select("*");
  if (prodErr) throw prodErr;

  const stops = [
    { island: "Lanzarote", resort: "Puerto del Carmen", stop_name: "Biosfera Plaza", pickup_time: "17:30:00", sort_order: 10 },
    { island: "Lanzarote", resort: "Costa Teguise", stop_name: "Pueblo Marinero", pickup_time: "17:45:00", sort_order: 20 },
    { island: "Fuerteventura", resort: "Corralejo", stop_name: "Centro Comercial", pickup_time: "17:15:00", sort_order: 10 },
    { island: "Tenerife", resort: "Playa de las Americas", stop_name: "Safari Centre", pickup_time: "17:00:00", sort_order: 10 },
  ];
  const { data: stopRows, error: stopErr } = await sb
    .from("show_bus_stops")
    .insert(stops.map((s) => ({ ...s, business_id: businessId, active: true })))
    .select("*");
  if (stopErr) throw stopErr;

  const stopByName = Object.fromEntries((stopRows ?? []).map((s) => [s.stop_name, s]));
  const hotels = [
    { name: "Hotel Los Fariones", island: "Lanzarote", bus_stop_id: stopByName["Biosfera Plaza"]?.id ?? null },
    { name: "Barceló Teguise Beach", island: "Lanzarote", bus_stop_id: stopByName["Pueblo Marinero"]?.id ?? null },
    { name: "RIU Palace Tres Islas", island: "Fuerteventura", bus_stop_id: stopByName["Centro Comercial"]?.id ?? null },
    { name: "Hard Rock Hotel Tenerife", island: "Tenerife", bus_stop_id: stopByName["Safari Centre"]?.id ?? null },
  ];
  const { data: hotelRows, error: hotelErr } = await sb
    .from("show_hotels")
    .insert(hotels.map((h) => ({ ...h, business_id: businessId, active: true })))
    .select("*");
  if (hotelErr) throw hotelErr;

  const depot = (supplierRows ?? []).find((s) => s.billing_mode === "deposit")!;
  const invoiceSup = (supplierRows ?? []).find((s) => s.billing_mode === "invoice")!;
  const volcano = (productRows ?? []).find((p) => p.name.includes("Volcano"))!;
  const desert = (productRows ?? []).find((p) => p.name.includes("Desert"))!;
  const siam = (productRows ?? []).find((p) => p.name.includes("Siam"))!;
  const hotelLos = (hotelRows ?? []).find((h) => h.name.includes("Fariones"))!;
  const hotelBarc = (hotelRows ?? []).find((h) => h.name.includes("Barceló"))!;
  const hotelRiu = (hotelRows ?? []).find((h) => h.name.includes("RIU"))!;
  const hotelHard = (hotelRows ?? []).find((h) => h.name.includes("Hard Rock"))!;

  type SeedBooking = {
    booking_ref: string;
    show_date: string;
    guest_name: string;
    guest_mobile: string;
    hotel: typeof hotelLos;
    product: typeof volcano;
    supplier: typeof depot;
    adults: number;
    children: number;
    infants: number;
    dietary_required: boolean;
    dietary_notes: string | null;
    sales_channel: string;
    transport_required: boolean;
    office_comments: string | null;
  };

  const seedBookings: SeedBooking[] = [
    {
      booking_ref: "MHT-1001",
      show_date: isoDate(2),
      guest_name: "Sarah Thompson",
      guest_mobile: "+447700900101",
      hotel: hotelLos,
      product: volcano,
      supplier: depot,
      adults: 2,
      children: 1,
      infants: 0,
      dietary_required: true,
      dietary_notes: "1x gluten free",
      sales_channel: "agency",
      transport_required: true,
      office_comments: "VIP pickup — front lobby",
    },
    {
      booking_ref: "MHT-1002",
      show_date: isoDate(2),
      guest_name: "James Whitaker",
      guest_mobile: "+447700900102",
      hotel: hotelBarc,
      product: volcano,
      supplier: invoiceSup,
      adults: 4,
      children: 0,
      infants: 0,
      dietary_required: false,
      dietary_notes: null,
      sales_channel: "tour_op",
      transport_required: true,
      office_comments: null,
    },
    {
      booking_ref: "MHT-1003",
      show_date: isoDate(3),
      guest_name: "Elena Rodriguez",
      guest_mobile: "+34600111222",
      hotel: hotelRiu,
      product: desert,
      supplier: depot,
      adults: 2,
      children: 2,
      infants: 1,
      dietary_required: true,
      dietary_notes: "Child nut allergy",
      sales_channel: "hotel",
      transport_required: true,
      office_comments: "Infant needs car seat note",
    },
    {
      booking_ref: "MHT-1004",
      show_date: isoDate(4),
      guest_name: "Michael Chen",
      guest_mobile: "+447700900104",
      hotel: hotelHard,
      product: siam,
      supplier: depot,
      adults: 3,
      children: 0,
      infants: 0,
      dietary_required: false,
      dietary_notes: null,
      sales_channel: "direct",
      transport_required: true,
      office_comments: "Paid deposit by card",
    },
    {
      booking_ref: "MHT-1005",
      show_date: isoDate(-1),
      guest_name: "Olivia Grant",
      guest_mobile: "+447700900105",
      hotel: hotelLos,
      product: volcano,
      supplier: depot,
      adults: 2,
      children: 0,
      infants: 0,
      dietary_required: false,
      dietary_notes: null,
      sales_channel: "shop",
      transport_required: false,
      office_comments: "No transport — own car",
    },
  ];

  const bookingInserts = seedBookings.map((b) => {
    const total = round2(
      b.adults * Number(b.product.adult_price) +
        b.children * Number(b.product.child_price) +
        b.infants * Number(b.product.infant_price),
    );
    const mode = b.supplier.billing_mode as "deposit" | "invoice";
    const deposit =
      mode === "invoice" ? 0 : round2(total * (Number(b.supplier.deposit_percent) / 100));
    const balance = mode === "invoice" ? 0 : round2(total - deposit);
    const stop = stopRows?.find((s) => s.id === b.hotel.bus_stop_id) ?? null;
    const adultNett = round2(b.adults * Number(b.product.adult_nett ?? 0));
    const childNett = round2(b.children * Number(b.product.child_nett ?? 0));
    return {
      business_id: businessId,
      booking_ref: b.booking_ref,
      show_date: b.show_date,
      guest_name: b.guest_name,
      guest_mobile: b.guest_mobile,
      hotel_id: b.hotel.id,
      hotel_name: b.hotel.name,
      transport_required: b.transport_required,
      pickup_stop_id: b.transport_required ? stop?.id ?? null : null,
      pickup_stop_name: b.transport_required ? stop?.stop_name ?? null : null,
      pickup_time: b.transport_required ? stop?.pickup_time ?? null : null,
      dietary_required: b.dietary_required,
      dietary_notes: b.dietary_notes,
      supplier_id: b.supplier.id,
      supplier_name: b.supplier.name,
      billing_mode: mode,
      product_id: b.product.id,
      show_name: b.product.name,
      island: b.product.island,
      adults: b.adults,
      children: b.children,
      infants: b.infants,
      total_cost: total,
      deposit_amount: deposit,
      balance_remaining: balance,
      nett_total: round2(adultNett + childNett),
      adult_nett_total: adultNett,
      child_nett_total: childNett,
      sales_channel: b.sales_channel,
      payment_status: mode === "invoice" ? "n_a" : b.booking_ref === "MHT-1004" ? "partial" : "unpaid",
      office_comments: b.office_comments,
      created_by: userId,
      updated_by: userId,
    };
  });

  const { data: bookingRows, error: bookErr } = await sb.from("show_bookings").insert(bookingInserts).select("*");
  if (bookErr) throw bookErr;

  const partial = (bookingRows ?? []).find((b) => b.booking_ref === "MHT-1004");
  if (partial) {
    const { error: payErr } = await sb.from("show_booking_payments").insert({
      business_id: businessId,
      booking_id: partial.id,
      amount: partial.deposit_amount,
      method: "card",
      note: "Deposit taken at desk",
      created_by: userId,
    });
    if (payErr) throw payErr;
  }

  const invBooking = (bookingRows ?? []).find((b) => b.booking_ref === "MHT-1002");
  if (invBooking) {
    const due = new Date(`${invBooking.show_date}T12:00:00Z`);
    due.setUTCDate(due.getUTCDate() + 30);
    const { data: inv, error: invErr } = await sb
      .from("show_invoices")
      .insert({
        business_id: businessId,
        supplier_id: invoiceSup.id,
        supplier_name: invoiceSup.name,
        island: invBooking.island,
        period_start: invBooking.show_date,
        period_end: invBooking.show_date,
        verifactu_number: "MHT-INV-0001",
        invoice_date: invBooking.show_date,
        payment_terms_days: 30,
        due_date: due.toISOString().slice(0, 10),
        total_amount: invBooking.nett_total,
        paid: false,
        created_by: userId,
      })
      .select("id")
      .single();
    if (invErr) throw invErr;
    const { error: lineErr } = await sb.from("show_invoice_lines").insert({
      business_id: businessId,
      invoice_id: inv.id,
      booking_id: invBooking.id,
      booking_ref: invBooking.booking_ref,
      guest_name: invBooking.guest_name,
      adults: invBooking.adults,
      children: invBooking.children,
      adult_nett_total: invBooking.adult_nett_total,
      child_nett_total: invBooking.child_nett_total,
      line_total: invBooking.nett_total,
    });
    if (lineErr) throw lineErr;
    await sb.from("show_bookings").update({ invoice_id: inv.id }).eq("id", invBooking.id);
  }

  await sb.from("show_bus_orders").insert([
    {
      business_id: businessId,
      show_date: isoDate(2),
      island: "Lanzarote",
      seats_ordered: 40,
      cost_total: 320,
      notes: "Two coaches evening show",
    },
    {
      business_id: businessId,
      show_date: isoDate(3),
      island: "Fuerteventura",
      seats_ordered: 25,
      cost_total: 210,
      notes: null,
    },
  ]);

  console.log("\nMHT Show Ops ready");
  console.log("Login:  https://www.solviosystems.com/login");
  console.log("Email: ", EMAIL);
  console.log("Pass:  ", PASSWORD);
  console.log("App:   https://www.solviosystems.com/dashboard/show-ops");
  console.log(`Seeded ${bookingRows?.length ?? 0} bookings, ${supplierRows?.length ?? 0} suppliers, ${productRows?.length ?? 0} shows`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
