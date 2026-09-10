import type { SupabaseClient } from "@supabase/supabase-js";

import { round2 } from "./calc";

/**
 * Partner rate cards ("tarifas" in the Lanzasoft export).
 *
 * Each partner points at a SALE rate card (`show_suppliers.sale_rate_id`). The
 * card holds, per show, the price that partner sells at — one row with the bus
 * included and one without. The imported bookings prove this is the real price:
 * 1,232 of 1,248 future deposit bookings and 440 of 449 invoice bookings match
 * the card exactly, while "master price + bus supplement" reproduces fewer than
 * one in five deposit bookings. The nett is then the partner's percentage of the
 * card price, rounded per head, which is what the invoice-rate cards also encode
 * (they are derived from the sale card and drift when the sale card is edited,
 * so they are not read).
 *
 * `tipo` is Lanzasoft's rate-row type. Every imported booking prices on tipo 1
 * (a handful on 2); when a card carries several rows for the same show and bus
 * choice, tipo 1 is preferred and otherwise the lowest tipo wins.
 */
export type RatePriceRow = {
  product_id: string;
  tipo: number | null;
  no_transport: boolean;
  adult_price: number | string | null;
  child_price: number | string | null;
};

export type RateCardUnit = {
  rate_id: string | null;
  rate_name: string | null;
  tipo: number | null;
  adult_price: number;
  child_price: number;
};

function money(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? round2(n) : null;
}

function tipoRank(t: number | null): number {
  if (t === 1) return -1;
  if (t === null || !Number.isFinite(t)) return Number.MAX_SAFE_INTEGER;
  return t;
}

/** The card row for one show and bus choice, or null when the card has no price for it. */
export function pickRatePrice(
  rows: RatePriceRow[] | null | undefined,
  productId: string | null | undefined,
  transportRequired: boolean,
  card?: { id?: string | null; name?: string | null } | null,
): RateCardUnit | null {
  if (!rows?.length || !productId) return null;
  const wantNoTransport = !transportRequired;
  const candidates = rows
    .filter((r) => r.product_id === productId && Boolean(r.no_transport) === wantNoTransport)
    .map((r) => ({ r, adult: money(r.adult_price), child: money(r.child_price) }))
    .filter((x): x is { r: RatePriceRow; adult: number; child: number } => x.adult !== null && x.child !== null)
    .sort((a, b) => tipoRank(a.r.tipo) - tipoRank(b.r.tipo));
  const hit = candidates[0];
  if (!hit) return null;
  return {
    rate_id: card?.id ?? null,
    rate_name: card?.name ?? null,
    tipo: hit.r.tipo ?? null,
    adult_price: hit.adult,
    child_price: hit.child,
  };
}

const RATE_PRICE_COLUMNS = "product_id,tipo,no_transport,adult_price,child_price";

/** Every price row on one rate card (a card is ~20–60 rows). */
export async function loadRatePrices(
  supabase: SupabaseClient,
  businessId: string,
  rateId: string | null | undefined,
): Promise<{ card: { id: string; name: string | null } | null; rows: RatePriceRow[] }> {
  if (!rateId) return { card: null, rows: [] };
  const [{ data: card }, { data: rows, error }] = await Promise.all([
    supabase.from("show_supplier_rates").select("id,name").eq("business_id", businessId).eq("id", rateId).maybeSingle(),
    supabase.from("show_rate_prices").select(RATE_PRICE_COLUMNS).eq("business_id", businessId).eq("rate_id", rateId).limit(2000),
  ]);
  if (error) throw new Error(`Could not load the partner's rate card: ${error.message}`);
  return {
    card: card ? { id: String(card.id), name: card.name ? String(card.name) : null } : { id: rateId, name: null },
    rows: (rows ?? []) as RatePriceRow[],
  };
}

/** The card price for one partner, show and bus choice — what the desk, seller and partner-link paths use. */
export async function loadSaleRateUnit(
  supabase: SupabaseClient,
  businessId: string,
  supplier: { sale_rate_id?: string | null } | null | undefined,
  productId: string | null | undefined,
  transportRequired: boolean,
): Promise<RateCardUnit | null> {
  if (!supplier?.sale_rate_id || !productId) return null;
  const { card, rows } = await loadRatePrices(supabase, businessId, supplier.sale_rate_id);
  return pickRatePrice(rows, productId, transportRequired, card);
}

/**
 * Price rows for one show across several rate cards — the reprice path, which
 * touches every partner that sold the show.
 */
export async function loadRatePricesForProduct(
  supabase: SupabaseClient,
  businessId: string,
  rateIds: string[],
  productId: string,
): Promise<Map<string, { card: { id: string; name: string | null }; rows: RatePriceRow[] }>> {
  const ids = [...new Set(rateIds.filter(Boolean))];
  const out = new Map<string, { card: { id: string; name: string | null }; rows: RatePriceRow[] }>();
  if (!ids.length) return out;
  const [{ data: cards }, { data: rows, error }] = await Promise.all([
    supabase.from("show_supplier_rates").select("id,name").eq("business_id", businessId).in("id", ids),
    supabase.from("show_rate_prices").select(`rate_id,${RATE_PRICE_COLUMNS}`).eq("business_id", businessId).eq("product_id", productId).in("rate_id", ids).limit(5000),
  ]);
  if (error) throw new Error(`Could not load rate cards: ${error.message}`);
  const nameById = new Map((cards ?? []).map((c) => [String(c.id), c.name ? String(c.name) : null]));
  for (const id of ids) out.set(id, { card: { id, name: nameById.get(id) ?? null }, rows: [] });
  for (const r of (rows ?? []) as Array<RatePriceRow & { rate_id: string }>) out.get(r.rate_id)?.rows.push(r);
  return out;
}
