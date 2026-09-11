/**
 * Lanzasoft → Solvio booking sync (read-only against Lanzasoft).
 *
 *   npx tsx scripts/lanzasoft-sync.ts                # dry run: prints what would change, writes nothing
 *   npx tsx scripts/lanzasoft-sync.ts --apply        # write the changes to Solvio
 *   npx tsx scripts/lanzasoft-sync.ts --apply --fix-clashes
 *
 * Options: --refresh-days N (re-read our bookings whose show date is within the
 * last N days or in the future; default 3), --max-new N (safety cap on new ids,
 * default 3000), --business <uuid>, --report <path.json>.
 *
 * What it does
 *   1. Reads every Lanzasoft booking newer than the highest legacy id we hold
 *      (ids are sequential; it stops after 25 consecutive "Not Found").
 *   2. Re-reads every booking we hold whose show date is recent or future and
 *      applies any change Lanzasoft made (guest, hotel, pax, money, status…).
 *   3. A booking we hold that Lanzasoft no longer returns is marked cancelled
 *      with the reason "Deleted in Lanzasoft".
 *   4. Payments (/payments?booking=) become the paid amount; the ledger gets an
 *      opening-balance row so the desk shows the right balance.
 *
 * Lanzasoft is only ever read with GET. Solvio is written with the service
 * role straight into the tables: no server action runs, so nothing emails a
 * guest, prints a ticket, or pushes availability to GetYourGuide. Rows carry
 * legacy_id, so the desk treats them as imported (money is never recomputed).
 *
 * Ref clash: while both systems are live, Lanzasoft keeps issuing the numbers
 * Solvio's desk also used for test bookings. Such ids are reported and skipped
 * unless --fix-clashes renames the Solvio test rows to TEST-<n> (and frees the
 * number) — only rows without a legacy id are ever renamed.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { computeBookingMoney, paymentStatusAfter, round2 } from "../src/lib/show-ops/calc";
import { pickRatePrice, type RatePriceRow } from "../src/lib/show-ops/rate-cards";

const LANZASOFT = "http://mhtapp.lanzasoft.com";
const DEFAULT_BUSINESS = "5a16bfc4-3363-43e1-bd8c-30afcf3d3529";
const TRANSPORT_SUPPLEMENT = 10;
const NOT_FOUND_RUN = 25;
const CONCURRENCY = 6;
/**
 * Lanzasoft still carries retired "OLD RATE EXPIRED / NOT USED" show rows and
 * bookings occasionally sit on them. The original import folded those onto the
 * live show for the island, and so does the sync.
 */
const SHOW_ALIASES: Record<number, number> = { 2: 1, 62: 1, 52: 46, 53: 46, 72: 46, 73: 46, 74: 46, 75: 46, 76: 46, 77: 46 };
/** Dietary values that mean "nothing special". */
const NO_DIET = /^(no|none|normal( meal)?|n\/a|-)?$/i;

type LzBooking = {
  id: number;
  Today: string | null;
  Ticket_No: string | null;
  Details: string | null;
  Name: string | null;
  Rep: string | null;
  ShowDate: string;
  BusStop: string | null;
  TourOp: number | null;
  Hotel: string | null;
  Room: string | null;
  Adults: number;
  Ninos: number;
  DepositPaid: string | number | null;
  NoTransport: number;
  Email: string | null;
  Not_on_Board: string | null;
  Infants: number;
  Status: string | null;
  Invoice: number | string | null;
  lANGUAGE: string | null;
  excursion: number | null;
  Tipo: number | null;
  Total: string | number | null;
  TourOperatorName: string | null;
  Nationality: string | null;
  Phonenum: string | null;
  createuser: string | null;
  busstopId: number | null;
  lastupdate: string | null;
  updateuser: string | null;
  Dietary: string | null;
};
type LzPayment = { id: number; PaymentDate: string; Booking: number; Ammount: string | number; Method: string };

function loadEnv() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL && existsSync(".env.local")) {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
    }
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (.env.local).");
  return { url, key };
}

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const APPLY = process.argv.includes("--apply");
const FIX_CLASHES = process.argv.includes("--fix-clashes");
const REFRESH_DAYS = Number(arg("--refresh-days", "3"));
const MAX_NEW = Number(arg("--max-new", "3000"));
const BUSINESS = arg("--business", DEFAULT_BUSINESS);
const REPORT = arg("--report", "");

async function lzGet<T>(path: string): Promise<T | null> {
  const res = await fetch(`${LANZASOFT}${path}`, { method: "GET", headers: { accept: "application/json" } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Lanzasoft ${res.status} on ${path}`);
  return (await res.json()) as T;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

async function pageAll<T>(q: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await q(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

const num = (v: unknown, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const str = (v: unknown) => {
  const s = v == null ? "" : String(v).trim();
  return s || null;
};
/** Lanzasoft stores "0" for no phone; the desk should see an empty field. */
const phone = (v: unknown) => {
  const s = str(v);
  return s && s !== "0" ? s : null;
};
/** Staff append "**" to names as a marker in Lanzasoft; the import dropped it. */
const guestName = (v: unknown) => (str(v) ?? "(no name)").replace(/\*+$/, "").trim() || "(no name)";

type Lookups = {
  products: Map<number, Record<string, unknown>>;
  suppliers: Map<number, Record<string, unknown>>;
  hotelsByName: Map<string, Record<string, unknown>>;
  stopsByLegacy: Map<number, Record<string, unknown>>;
  stopsByName: Map<string, Record<string, unknown>>;
  ratesByCard: Map<string, RatePriceRow[]>;
  showNames: Map<number, string>;
};

function mapBooking(lz: LzBooking, paid: number | null, L: Lookups) {
  const supplier = lz.TourOp != null ? L.suppliers.get(lz.TourOp) ?? null : null;
  const showId = lz.excursion != null ? SHOW_ALIASES[lz.excursion] ?? lz.excursion : null;
  const product = showId != null ? L.products.get(showId) ?? null : null;
  const adults = Math.max(0, num(lz.Adults));
  const children = Math.max(0, num(lz.Ninos));
  const infants = Math.max(0, num(lz.Infants));
  const transport = num(lz.NoTransport, 1) === 0;
  const hotelName = str(lz.Hotel);
  const hotel = hotelName ? L.hotelsByName.get(hotelName.toLowerCase()) ?? null : null;
  const isPrivate = !transport && /^private\b/i.test(hotelName ?? "");
  const pickup_kind = transport ? "bus" : isPrivate ? "private" : "own_way";
  const stop = transport
    ? (lz.busstopId != null ? L.stopsByLegacy.get(lz.busstopId) : null) ?? (str(lz.BusStop) ? L.stopsByName.get(String(str(lz.BusStop)).toLowerCase()) ?? null : null)
    : null;
  const private_zone = isPrivate ? (hotelName ?? "").trim().split(/\s+/).pop()?.toUpperCase() ?? null : null;

  const total = round2(num(lz.Total));
  const billing_mode = (supplier?.billing_mode as string) === "invoice" ? "invoice" : "deposit";
  const pct = num(supplier?.invoice_nett_percent, 100);
  const cardRows = supplier?.sale_rate_id ? L.ratesByCard.get(String(supplier.sale_rate_id)) : undefined;
  const money = product
    ? computeBookingMoney({
        adults,
        children,
        infants,
        product: product as never,
        supplier: supplier as never,
        transportRequired: transport,
        transportSupplement: TRANSPORT_SUPPLEMENT,
        rateCard: pickRatePrice(cardRows, String(product.id), transport),
      })
    : null;
  let adult_nett_total: number;
  let child_nett_total: number;
  let nett_total: number;
  if (money && Math.abs(money.total_cost - total) < 0.011) {
    adult_nett_total = money.adult_nett_total;
    child_nett_total = money.child_nett_total;
    nett_total = money.nett_total;
  } else {
    // Sold at a price neither the card nor the master list knows: nett is the partner % of what was charged.
    nett_total = round2((total * pct) / 100);
    const heads = adults + children;
    adult_nett_total = heads ? round2((nett_total * adults) / heads) : nett_total;
    child_nett_total = round2(nett_total - adult_nett_total);
  }

  const paidAmount = round2(Math.max(0, paid ?? num(lz.DepositPaid)));
  const after = paymentStatusAfter(total, paidAmount);
  const pay = billing_mode === "invoice"
    ? { deposit_amount: 0, balance_remaining: 0, payment_status: "n_a" as const }
    : total <= 0
      ? { deposit_amount: 0, balance_remaining: 0, payment_status: paidAmount > 0 ? ("paid" as const) : ("unpaid" as const) }
      : { deposit_amount: round2(Math.min(total, num(lz.DepositPaid))), balance_remaining: after.balance, payment_status: after.payment_status };

  const status = str(lz.Status) ?? "Open";
  const cancelled = /^cancel/i.test(status);
  const dietary = str(lz.Dietary);
  const dietary_required = Boolean(dietary) && !NO_DIET.test(dietary!);

  return {
    row: {
      business_id: BUSINESS,
      legacy_id: lz.id,
      booking_ref: `MHT-${lz.id}`,
      show_date: String(lz.ShowDate).slice(0, 10),
      guest_name: guestName(lz.Name),
      guest_mobile: phone(lz.Phonenum),
      guest_email: str(lz.Email),
      hotel_id: hotel ? (hotel.id as string) : null,
      hotel_name: hotelName,
      transport_required: transport,
      pickup_kind,
      pickup_stop_id: stop ? (stop.id as string) : null,
      pickup_stop_name: transport ? (stop ? (stop.stop_name as string) : str(lz.BusStop)) : isPrivate ? hotelName : null,
      pickup_time: null,
      private_zone,
      dietary_required,
      dietary_notes: dietary_required ? dietary : null,
      supplier_id: supplier ? (supplier.id as string) : null,
      supplier_name: (supplier?.name as string | undefined) ?? str(lz.TourOperatorName),
      billing_mode,
      product_id: product ? (product.id as string) : null,
      show_name: (product?.name as string | undefined) ?? (lz.excursion != null ? L.showNames.get(lz.excursion) ?? null : null) ?? "(unknown show)",
      island: (product?.island as string | undefined) ?? null,
      adults,
      children,
      infants,
      total_cost: total,
      nett_total,
      adult_nett_total,
      child_nett_total,
      infant_nett_total: 0,
      ...pay,
      supplier_ticket_number: str(lz.Ticket_No),
      office_comments: str(lz.Details),
      sales_channel: (supplier?.partner_type as string | undefined) ?? "partner",
      room_number: str(lz.Room),
      language: str(lz.lANGUAGE),
      nationality: str(lz.Nationality),
      legacy_status: lz.Invoice != null && lz.Invoice !== "" ? "Invoiced" : status,
      created_by_name: str(lz.createuser),
      booked_on: lz.Today ? String(lz.Today).slice(0, 10) : null,
      created_at: lz.Today ?? new Date().toISOString(),
      updated_at: lz.lastupdate ?? lz.Today ?? new Date().toISOString(),
      cancelled_at: cancelled ? lz.lastupdate ?? new Date().toISOString() : null,
      cancel_reason: cancelled ? `Lanzasoft status: ${status}` : null,
    },
    paidAmount,
    unresolved: [
      !supplier && lz.TourOp != null ? `partner ${lz.TourOp} (${lz.TourOperatorName})` : null,
      !product && showId != null ? `show ${showId}` : null,
      transport && !stop ? `stop ${lz.busstopId} (${lz.BusStop})` : null,
      hotelName && !hotel ? `hotel "${hotelName}"` : null,
    ].filter(Boolean) as string[],
  };
}

/** A blank in Lanzasoft never wipes a value Solvio already holds for these. */
const KEEP_IF_BLANK = new Set(["hotel_id", "hotel_name", "supplier_id", "product_id", "island", "pickup_stop_id", "guest_mobile", "guest_email", "office_comments"]);

/** Columns Lanzasoft owns. Door/arrival/invoice fields stay Solvio's. */
const SYNC_COLUMNS = [
  "show_date", "guest_name", "guest_mobile", "guest_email", "hotel_id", "hotel_name", "transport_required", "pickup_kind",
  "pickup_stop_id", "pickup_stop_name", "private_zone", "dietary_required", "dietary_notes", "supplier_id", "supplier_name",
  "billing_mode", "product_id", "show_name", "island", "adults", "children", "infants", "total_cost", "nett_total",
  "adult_nett_total", "child_nett_total", "deposit_amount", "balance_remaining", "payment_status", "supplier_ticket_number",
  "office_comments", "sales_channel", "room_number", "language", "nationality", "legacy_status", "cancelled_at", "cancel_reason",
] as const;

function same(a: unknown, b: unknown): boolean {
  if (a == null && b == null) return true;
  if (typeof a === "number" || typeof b === "number") return Math.abs(num(a) - num(b)) < 0.011;
  if (typeof a === "boolean" || typeof b === "boolean") return Boolean(a) === Boolean(b);
  return String(a ?? "") === String(b ?? "");
}

async function main() {
  const { url, key } = loadEnv();
  const sb: SupabaseClient = createClient(url, key, { auth: { persistSession: false } });
  const refreshFrom = new Date(Date.now() - REFRESH_DAYS * 86400000).toISOString().slice(0, 10);
  console.log(`${APPLY ? "APPLY" : "DRY RUN"} · business ${BUSINESS} · refresh bookings from ${refreshFrom} · Lanzasoft is read-only`);

  // ---- lookups
  const [products, suppliers, hotels, stops, rates, lzShows] = await Promise.all([
    pageAll<Record<string, unknown>>((f, t) => sb.from("show_products").select("*").eq("business_id", BUSINESS).range(f, t)),
    pageAll<Record<string, unknown>>((f, t) => sb.from("show_suppliers").select("*").eq("business_id", BUSINESS).range(f, t)),
    pageAll<Record<string, unknown>>((f, t) => sb.from("show_hotels").select("id,name,legacy_id,bus_stop_id").eq("business_id", BUSINESS).range(f, t)),
    pageAll<Record<string, unknown>>((f, t) => sb.from("show_bus_stops").select("id,legacy_id,stop_name,pickup_time").eq("business_id", BUSINESS).range(f, t)),
    pageAll<RatePriceRow & { rate_id: string }>((f, t) => sb.from("show_rate_prices").select("rate_id,product_id,tipo,no_transport,adult_price,child_price").eq("business_id", BUSINESS).range(f, t)),
    lzGet<Array<{ id: number; Name: string }>>("/shows"),
  ]);
  const L: Lookups = {
    products: new Map(products.filter((p) => p.legacy_id != null).map((p) => [num(p.legacy_id), p])),
    suppliers: new Map(suppliers.filter((s) => s.legacy_tourop_id != null).map((s) => [num(s.legacy_tourop_id), s])),
    hotelsByName: new Map(hotels.map((h) => [String(h.name).trim().toLowerCase(), h])),
    stopsByLegacy: new Map(stops.filter((s) => s.legacy_id != null).map((s) => [num(s.legacy_id), s])),
    stopsByName: new Map(stops.map((s) => [String(s.stop_name).trim().toLowerCase(), s])),
    ratesByCard: new Map(),
    showNames: new Map((lzShows ?? []).map((s) => [s.id, s.Name])),
  };
  for (const r of rates) {
    const list = L.ratesByCard.get(r.rate_id) ?? [];
    list.push(r);
    L.ratesByCard.set(r.rate_id, list);
  }

  // ---- what we hold
  const held = await pageAll<Record<string, unknown>>((f, t) =>
    sb.from("show_bookings").select(`id,legacy_id,booking_ref,booking_ref_num,${SYNC_COLUMNS.join(",")}` as "*").eq("business_id", BUSINESS).range(f, t),
  );
  const byLegacy = new Map<number, Record<string, unknown>>();
  const refOwner = new Map<string, Record<string, unknown>>();
  let maxLegacy = 0;
  for (const b of held) {
    refOwner.set(String(b.booking_ref), b);
    if (b.legacy_id != null) {
      byLegacy.set(num(b.legacy_id), b);
      maxLegacy = Math.max(maxLegacy, num(b.legacy_id));
    }
  }
  console.log(`Solvio holds ${byLegacy.size} Lanzasoft bookings (highest id ${maxLegacy}) and ${held.length - byLegacy.size} of its own.`);

  // ---- 1. new ids above our highest
  const fetched = new Map<number, LzBooking | null>();
  let misses = 0;
  let id = maxLegacy + 1;
  let scanned = 0;
  while (misses < NOT_FOUND_RUN && scanned < MAX_NEW) {
    const batch = Array.from({ length: CONCURRENCY }, (_, i) => id + i);
    const results = await mapLimit(batch, CONCURRENCY, (n) => lzGet<LzBooking>(`/bookings/${n}`));
    for (let i = 0; i < batch.length; i += 1) {
      const b = results[i];
      fetched.set(batch[i], b);
      misses = b ? 0 : misses + 1;
    }
    id += batch.length;
    scanned += batch.length;
  }
  const newIds = [...fetched.entries()].filter(([, b]) => b).map(([n]) => n);
  console.log(`Lanzasoft has ${newIds.length} bookings newer than ${maxLegacy}${newIds.length ? ` (${newIds[0]}–${newIds[newIds.length - 1]})` : ""}.`);

  // ---- 2. refresh recent + future bookings we hold
  const refreshIds = [...byLegacy.values()].filter((b) => String(b.show_date) >= refreshFrom).map((b) => num(b.legacy_id));
  const refreshed = await mapLimit(refreshIds, CONCURRENCY, async (n) => [n, await lzGet<LzBooking>(`/bookings/${n}`)] as const);
  for (const [n, b] of refreshed) fetched.set(n, b);
  console.log(`Re-read ${refreshIds.length} bookings with a show date on or after ${refreshFrom}.`);

  // ---- payments for everything fetched (new + refreshed) that exists
  const liveIds = [...fetched.entries()].filter(([, b]) => b).map(([n]) => n);
  const paidById = new Map<number, number>();
  await mapLimit(liveIds, CONCURRENCY, async (n) => {
    const pays = (await lzGet<LzPayment[]>(`/payments?booking=${n}`)) ?? [];
    paidById.set(n, round2(pays.reduce((s, p) => s + num(p.Ammount), 0)));
  });

  // ---- partners and bus stops Lanzasoft added since the import
  const live = [...fetched.values()].filter((b): b is LzBooking => Boolean(b));
  const missingTourops = [...new Set(live.map((b) => b.TourOp).filter((t): t is number => t != null && !L.suppliers.has(t)))];
  const missingStops = [...new Set(live.filter((b) => num(b.NoTransport, 1) === 0 && b.busstopId != null && !L.stopsByLegacy.has(b.busstopId)).map((b) => b.busstopId as number))];
  const newSuppliers: Array<Record<string, unknown>> = [];
  const newStops: Array<Record<string, unknown>> = [];
  if (missingTourops.length || missingStops.length) {
    const [lzTos, lzStops, rateCards] = await Promise.all([
      lzGet<Array<Record<string, unknown>>>("/touroperators"),
      lzGet<Array<Record<string, unknown>>>("/busstops"),
      pageAll<Record<string, unknown>>((f, t) => sb.from("show_supplier_rates").select("id,legacy_rate_id,commission_percent").eq("business_id", BUSINESS).range(f, t)),
    ]);
    const rateByLegacy = new Map(rateCards.filter((r) => r.legacy_rate_id != null).map((r) => [num(r.legacy_rate_id), r]));
    for (const t of lzTos ?? []) {
      if (!missingTourops.includes(num(t.id))) continue;
      const sale = t.SaleRate != null ? rateByLegacy.get(num(t.SaleRate)) : undefined;
      const inv = t.InvoiceRate != null ? rateByLegacy.get(num(t.InvoiceRate)) : undefined;
      const commission = t.Percentage != null ? num(t.Percentage) : inv?.commission_percent != null ? num(inv.commission_percent) : null;
      const location = str(t.Location);
      newSuppliers.push({
        business_id: BUSINESS,
        name: str(t.Name) ?? `Partner ${t.id}`,
        legal_name: str(t.Legalname),
        tax_id: str(t.NIF),
        partner_type: str(t.Tipo) ?? "partner",
        island: location && location.toUpperCase() !== "ALL" ? location : null,
        billing_mode: num(t.Invoice) === 1 ? "invoice" : "deposit",
        invoice_nett_percent: commission != null ? round2(100 - commission) : 100,
        deposit_percent: 30,
        active: num(t.Archived) === 0,
        legacy_id: num(t.id),
        legacy_tourop_id: num(t.id),
        sale_rate_id: sale ? (sale.id as string) : null,
        invoice_rate_id: inv ? (inv.id as string) : null,
        notes: "Added by the Lanzasoft sync",
      });
    }
    for (const st of lzStops ?? []) {
      if (!missingStops.includes(num(st.id))) continue;
      newStops.push({
        business_id: BUSINESS,
        stop_name: str(st.Name) ?? `Stop ${st.id}`,
        island: str(st.Location) ?? "Unknown",
        resort: str(st.Zone) ?? "",
        zone: str(st.Zone),
        sort_order: num(st.StopOrder),
        legacy_id: num(st.id),
        active: true,
      });
    }
    console.log(`Lanzasoft has ${newSuppliers.length} partner(s) and ${newStops.length} bus stop(s) Solvio lacks: ${[...newSuppliers.map((x) => x.name), ...newStops.map((x) => x.stop_name)].join(", ")}`);
    if (APPLY) {
      if (newSuppliers.length) {
        const { data, error } = await sb.from("show_suppliers").insert(newSuppliers).select("*");
        if (error) throw new Error(`Could not add partners: ${error.message}`);
        for (const srow of data ?? []) L.suppliers.set(num(srow.legacy_tourop_id), srow);
      }
      if (newStops.length) {
        const { data, error } = await sb.from("show_bus_stops").insert(newStops).select("id,legacy_id,stop_name,pickup_time");
        if (error) throw new Error(`Could not add bus stops: ${error.message}`);
        for (const srow of data ?? []) L.stopsByLegacy.set(num(srow.legacy_id), srow);
      }
    }
  }

  // ---- plan
  const inserts: Array<ReturnType<typeof mapBooking>> = [];
  const updates: Array<{ existing: Record<string, unknown>; next: ReturnType<typeof mapBooking>; changed: string[] }> = [];
  const deletions: Array<Record<string, unknown>> = [];
  const clashes: Array<{ id: number; ref: string; owner: string }> = [];
  const unresolved: Array<{ id: number; problems: string[] }> = [];
  for (const [n, lz] of [...fetched.entries()].sort((a, b) => a[0] - b[0])) {
    const existing = byLegacy.get(n);
    if (!lz) {
      if (existing && !existing.cancelled_at) deletions.push(existing);
      continue;
    }
    const mapped = mapBooking(lz, paidById.get(n) ?? null, L);
    if (mapped.unresolved.length) unresolved.push({ id: n, problems: mapped.unresolved });
    if (existing) {
      const row = mapped.row as Record<string, unknown>;
      for (const c of KEEP_IF_BLANK) if (row[c] == null && existing[c] != null) row[c] = existing[c];
      if (row.product_id == null && existing.product_id != null) {
        row.show_name = existing.show_name;
        row.island = existing.island;
      }
      const changed = SYNC_COLUMNS.filter((c) => !same(existing[c], row[c]));
      if (changed.length) updates.push({ existing, next: mapped, changed });
      continue;
    }
    const owner = refOwner.get(mapped.row.booking_ref);
    if (owner && owner.legacy_id == null) {
      clashes.push({ id: n, ref: mapped.row.booking_ref, owner: String(owner.guest_name) });
      if (!FIX_CLASHES) continue;
    }
    inserts.push(mapped);
  }

  console.log(`\nPlan: ${inserts.length} new, ${updates.length} changed, ${deletions.length} gone from Lanzasoft, ${clashes.length} ref clashes${FIX_CLASHES ? " (will be fixed)" : " (skipped — run with --fix-clashes)"}, ${unresolved.length} with unresolved links.`);
  for (const u of updates.slice(0, 25)) console.log(`  ~ ${u.existing.booking_ref} ${u.existing.guest_name}: ${u.changed.join(", ")}`);
  if (updates.length > 25) console.log(`  … ${updates.length - 25} more`);
  for (const d of deletions) console.log(`  × ${d.booking_ref} ${d.guest_name} ${d.show_date} — not in Lanzasoft any more`);
  for (const c of clashes) console.log(`  ! ${c.ref} is a Solvio test booking (${c.owner}) but Lanzasoft issued the same number`);
  for (const u of unresolved.slice(0, 15)) console.log(`  ? MHT-${u.id}: ${u.problems.join("; ")}`);

  if (REPORT) {
    writeFileSync(REPORT, JSON.stringify({ at: new Date().toISOString(), apply: APPLY, newSuppliers, newStops, inserts: inserts.map((i) => i.row), updates: updates.map((u) => ({ ref: u.existing.booking_ref, changed: u.changed, next: u.next.row })), deletions: deletions.map((d) => d.booking_ref), clashes, unresolved }, null, 2));
    console.log(`Report written to ${REPORT}`);
  }
  if (!APPLY) {
    console.log("\nDry run — nothing written. Re-run with --apply to write to Solvio.");
    return;
  }

  // ---- apply
  let written = 0;
  if (FIX_CLASHES) {
    for (const c of clashes) {
      const owner = refOwner.get(c.ref)!;
      const { error } = await sb.from("show_bookings")// booking_ref_num is generated from the trailing digits, so the new ref must not end in digits.
      .update({ booking_ref: `TEST-${c.id}-old`, updated_at: new Date().toISOString() }).eq("id", owner.id as string).eq("business_id", BUSINESS).is("legacy_id", null);
      if (error) throw new Error(`Could not free ${c.ref}: ${error.message}`);
    }
    if (clashes.length) console.log(`Freed ${clashes.length} refs (test rows renamed to TEST-<n>-old).`);
  }
  for (let i = 0; i < inserts.length; i += 200) {
    const chunk = inserts.slice(i, i + 200);
    const { data, error } = await sb.from("show_bookings").insert(chunk.map((c) => c.row)).select("id,legacy_id");
    if (error) throw new Error(`Insert failed at ${chunk[0].row.booking_ref}: ${error.message}`);
    const ledger = (data ?? [])
      .map((d) => ({ d, paid: chunk.find((c) => c.row.legacy_id === num(d.legacy_id))?.paidAmount ?? 0 }))
      .filter((x) => x.paid > 0)
      .map((x) => ({ business_id: BUSINESS, booking_id: d(x.d.id), amount: x.paid, method: "import", paid_at: new Date().toISOString(), note: "Opening balance synced from Lanzasoft (paid before Solvio)" }));
    if (ledger.length) {
      const { error: lerr } = await sb.from("show_booking_payments").insert(ledger);
      if (lerr) throw new Error(`Ledger insert failed: ${lerr.message}`);
    }
    written += chunk.length;
  }
  for (const u of updates) {
    const patch: Record<string, unknown> = { updated_at: u.next.row.updated_at };
    for (const c of u.changed) patch[c] = (u.next.row as Record<string, unknown>)[c];
    const { error } = await sb.from("show_bookings").update(patch).eq("id", u.existing.id as string).eq("business_id", BUSINESS);
    if (error) throw new Error(`Update failed for ${u.existing.booking_ref}: ${error.message}`);
    if (u.next.row.billing_mode === "deposit" && u.changed.includes("balance_remaining")) {
      // Ledger follows the paid amount: add the difference as an import row (never negative).
      const { data: rows } = await sb.from("show_booking_payments").select("amount").eq("booking_id", u.existing.id as string);
      const ledgerSum = round2((rows ?? []).reduce((s, r) => s + num(r.amount), 0));
      const delta = round2(u.next.paidAmount - ledgerSum);
      if (delta > 0) {
        await sb.from("show_booking_payments").insert({ business_id: BUSINESS, booking_id: u.existing.id, amount: delta, method: "import", paid_at: u.next.row.updated_at, note: "Payment synced from Lanzasoft" });
      } else if (delta < 0) {
        console.log(`  ! ${u.existing.booking_ref}: Lanzasoft paid (${u.next.paidAmount}) is below the Solvio ledger (${ledgerSum}); left for the office.`);
      }
    }
    written += 1;
  }
  for (const d of deletions) {
    const { error } = await sb.from("show_bookings").update({ cancelled_at: new Date().toISOString(), cancel_reason: "Deleted in Lanzasoft (sync)", updated_at: new Date().toISOString() }).eq("id", d.id as string).eq("business_id", BUSINESS);
    if (error) throw new Error(`Cancel failed for ${d.booking_ref}: ${error.message}`);
    written += 1;
  }
  console.log(`\nWrote ${written} changes to Solvio. Lanzasoft untouched.`);
  function d(v: unknown): string {
    return String(v);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
