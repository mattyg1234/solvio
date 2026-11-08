import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Tipsi numbers for the MHT Hub.
 *
 * Tipsi (QR bar ordering) runs on its own Supabase project, separate from the
 * Hub's. MHT Lanzarote is one Tipsi venue. The Hub reads that venue's orders
 * server-side with the Tipsi service key, which lives only in Vercel env vars.
 *
 *   TIPSI_SUPABASE_URL              Tipsi project URL (defaults to the live Tipsi project)
 *   TIPSI_SUPABASE_SERVICE_ROLE_KEY Tipsi service role key (required; read-only use here)
 *   TIPSI_VENUE_IDS                 comma list of Tipsi businesses.id (defaults to MHT Lanzarote)
 */

const DEFAULT_TIPSI_URL = "https://muzonmhumkzxwivzmzgx.supabase.co";
/** Tipsi businesses.id for "MHT Lanzarote" (slug mht-ace). */
export const MHT_LANZAROTE_TIPSI_ID = "628330e1-237d-4f3e-8d3a-9dc2b40d9373";

export const TIPSI_TZ = "Atlantic/Canary";

export type TipsiOrderItem = { name: string; price: number; quantity: number };

export type TipsiOrder = {
  id: string;
  venueId: string;
  createdAt: string;
  status: string;
  /** Gross the guest paid, EUR. */
  total: number;
  /** Tipsi's cut, EUR. */
  fee: number;
  refunded: boolean;
  refundAmount: number;
  tableNumber: string | null;
  items: TipsiOrderItem[];
  acceptanceSeconds: number | null;
  /** Sent to someone else through Tipsi's "send a drink" (gift) flow. */
  isGift: boolean;
};

/** A tip left through Tipsi (tips table or a review with a tip), EUR. */
export type TipsiTip = { createdAt: string; amount: number };

export function tipsiVenueIds(): string[] {
  const raw = process.env.TIPSI_VENUE_IDS?.trim();
  const ids = (raw ? raw.split(",") : [MHT_LANZAROTE_TIPSI_ID]).map((s) => s.trim()).filter(Boolean);
  return ids.length ? ids : [MHT_LANZAROTE_TIPSI_ID];
}

export function isTipsiStatsConfigured(): boolean {
  return Boolean(process.env.TIPSI_SUPABASE_SERVICE_ROLE_KEY?.trim());
}

export function createTipsiClient(): SupabaseClient {
  const url = process.env.TIPSI_SUPABASE_URL?.trim() || DEFAULT_TIPSI_URL;
  const key = process.env.TIPSI_SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) throw new Error("TIPSI_SUPABASE_SERVICE_ROLE_KEY is not set.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}

function parseItems(raw: unknown): TipsiOrderItem[] {
  if (!Array.isArray(raw)) return [];
  const out: TipsiOrderItem[] = [];
  for (const it of raw) {
    if (!it || typeof it !== "object") continue;
    const r = it as Record<string, unknown>;
    const name = String(r.name ?? "").trim();
    if (!name) continue;
    out.push({ name, price: num(r.price), quantity: Math.max(1, Math.round(num(r.quantity) || 1)) });
  }
  return out;
}

export function tipsiOrderFromRow(row: Record<string, unknown>): TipsiOrder {
  return {
    id: String(row.id ?? ""),
    venueId: String(row.business_id ?? ""),
    createdAt: String(row.created_at ?? ""),
    status: String(row.status ?? ""),
    total: num(row.total_amount),
    fee: num(row.platform_fee),
    refunded: Boolean(row.refunded),
    refundAmount: num(row.refund_amount),
    tableNumber: row.table_number == null || row.table_number === "" ? null : String(row.table_number),
    items: parseItems(row.items),
    acceptanceSeconds: row.acceptance_time_seconds == null ? null : num(row.acceptance_time_seconds),
    isGift: Boolean(row.is_gift_order),
  };
}

const ORDER_COLS =
  "id,business_id,created_at,status,total_amount,platform_fee,refunded,refund_amount,table_number,items,acceptance_time_seconds,is_gift_order";

/**
 * Orders for the configured Tipsi venues, created in [fromIso, toIso).
 * Either bound may be null (open-ended). Pages through 1000 rows at a time.
 */
export async function loadTipsiOrders(opts: {
  fromIso: string | null;
  toIso: string | null;
  client?: SupabaseClient;
}): Promise<TipsiOrder[]> {
  const client = opts.client ?? createTipsiClient();
  const venues = tipsiVenueIds();
  const out: TipsiOrder[] = [];
  const PAGE = 1000;
  for (let page = 0; page < 200; page++) {
    let q = client.from("orders").select(ORDER_COLS).in("business_id", venues);
    if (opts.fromIso) q = q.gte("created_at", opts.fromIso);
    if (opts.toIso) q = q.lt("created_at", opts.toIso);
    const { data, error } = await q
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error(`Tipsi orders: ${error.message}`);
    const rows = (data ?? []) as Record<string, unknown>[];
    for (const r of rows) out.push(tipsiOrderFromRow(r));
    if (rows.length < PAGE) break;
  }
  return out;
}

/** Tips for the configured venues in [fromIso, toIso): the tips table plus tips left with reviews. */
export async function loadTipsiTips(opts: {
  fromIso: string | null;
  toIso: string | null;
  client?: SupabaseClient;
}): Promise<TipsiTip[]> {
  const client = opts.client ?? createTipsiClient();
  const venues = tipsiVenueIds();
  const range = <T extends { gte: (c: string, v: string) => T; lt: (c: string, v: string) => T }>(q: T): T => {
    let next = q;
    if (opts.fromIso) next = next.gte("created_at", opts.fromIso);
    if (opts.toIso) next = next.lt("created_at", opts.toIso);
    return next;
  };
  const [tips, reviews] = await Promise.all([
    range(client.from("tips").select("created_at,amount_cents").in("business_id", venues)).limit(10000),
    range(client.from("reviews").select("created_at,tip_amount_cents").in("business_id", venues).gt("tip_amount_cents", 0)).limit(10000),
  ]);
  if (tips.error) throw new Error(`Tipsi tips: ${tips.error.message}`);
  if (reviews.error) throw new Error(`Tipsi review tips: ${reviews.error.message}`);
  const out: TipsiTip[] = [];
  for (const r of (tips.data ?? []) as Record<string, unknown>[]) {
    const amount = num(r.amount_cents) / 100;
    if (amount > 0) out.push({ createdAt: String(r.created_at ?? ""), amount });
  }
  for (const r of (reviews.data ?? []) as Record<string, unknown>[]) {
    const amount = num(r.tip_amount_cents) / 100;
    if (amount > 0) out.push({ createdAt: String(r.created_at ?? ""), amount });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Summary (pure)
 * ------------------------------------------------------------------ */

/** Orders that count as sales: not cancelled/failed/pending. */
export function isTipsiSale(o: TipsiOrder): boolean {
  const s = o.status.toLowerCase();
  return !["cancelled", "canceled", "failed", "pending", "pending_payment", "abandoned", "expired"].includes(s);
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

const DAY_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIPSI_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const HOUR_FMT = new Intl.DateTimeFormat("en-GB", { timeZone: TIPSI_TZ, hour: "2-digit", hourCycle: "h23" });
const WEEKDAY_FMT = new Intl.DateTimeFormat("en-GB", { timeZone: TIPSI_TZ, weekday: "short" });

export function tipsiLocalDay(iso: string): string {
  return DAY_FMT.format(new Date(iso));
}

/**
 * Stripe's card fee per order. Tipsi does not store it, so it is estimated with
 * Stripe's standard EEA card price: 1.5% + €0.25. Override with
 * TIPSI_STRIPE_FEE_PERCENT and TIPSI_STRIPE_FEE_FIXED (euros) if MHT's rate differs.
 */
export function tipsiStripeFeeRate(): { percent: number; fixed: number } {
  const pct = Number.parseFloat(process.env.TIPSI_STRIPE_FEE_PERCENT ?? "");
  const fixed = Number.parseFloat(process.env.TIPSI_STRIPE_FEE_FIXED ?? "");
  return {
    percent: Number.isFinite(pct) && pct >= 0 ? pct : 1.5,
    fixed: Number.isFinite(fixed) && fixed >= 0 ? fixed : 0.25,
  };
}

export function tipsiStripeFee(total: number, rate = tipsiStripeFeeRate()): number {
  if (!(total > 0)) return 0;
  return r2((total * rate.percent) / 100 + rate.fixed);
}

export type TipsiSummary = {
  orders: number;
  gross: number;
  /** Tipsi's commission. */
  fee: number;
  /** Estimated Stripe card fees. */
  stripeFees: number;
  /** Tipsi commission + Stripe fees. */
  totalFees: number;
  refunds: number;
  refundCount: number;
  /** What MHT keeps: gross minus refunds, Tipsi commission and Stripe fees. */
  venueNet: number;
  /**
   * "Tipsi made you": money MHT would not have had without Tipsi.
   * Gift orders (send-a-drink) + tips + an estimated share of sales from
   * how easy ordering is (TIPSI_EXTRA_SALES_PERCENT, default 5%).
   */
  madeYou: { total: number; gifts: number; giftOrders: number; tips: number; tipCount: number; extraSales: number; extraPercent: number };
  avgOrder: number;
  itemsSold: number;
  avgAcceptanceSeconds: number | null;
  activeNights: number;
  bestNight: { day: string; gross: number; orders: number } | null;
  byMonth: Array<{ month: string; orders: number; gross: number; fee: number; stripeFees: number; totalFees: number; net: number; madeYou: number }>;
  byDay: Array<{ day: string; orders: number; gross: number; fee: number }>;
  byHour: Array<{ hour: number; orders: number; gross: number }>;
  byWeekday: Array<{ weekday: string; orders: number; gross: number }>;
  topItems: Array<{ name: string; quantity: number; revenue: number }>;
  topTables: Array<{ table: string; orders: number; gross: number }>;
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Bar nights run past midnight: an order at 01:30 belongs to the night before.
 * Anything before 06:00 local counts towards the previous day.
 */
export function tipsiNightOf(iso: string): string {
  const d = new Date(iso);
  const hour = Number(HOUR_FMT.format(d));
  const shifted = hour < 6 ? new Date(d.getTime() - 6 * 3600_000) : d;
  return DAY_FMT.format(shifted);
}

/** Share of sales assumed to be extra because ordering through Tipsi is easy. Default 5% (Matty, 8 Nov). */
export function tipsiExtraSalesPercent(): number {
  const n = Number.parseFloat(process.env.TIPSI_EXTRA_SALES_PERCENT ?? "");
  return Number.isFinite(n) && n >= 0 ? n : 5;
}

export function summariseTipsiOrders(
  all: TipsiOrder[],
  opts: {
    topN?: number;
    stripeRate?: { percent: number; fixed: number };
    tips?: TipsiTip[];
    extraSalesPercent?: number;
  } = {},
): TipsiSummary {
  const topN = opts.topN ?? 15;
  const stripeRate = opts.stripeRate ?? tipsiStripeFeeRate();
  const extraPercent = opts.extraSalesPercent ?? tipsiExtraSalesPercent();
  const tips = opts.tips ?? [];
  let stripeFees = 0;
  let gifts = 0;
  let giftOrders = 0;
  const orders = all.filter(isTipsiSale);
  let gross = 0;
  let fee = 0;
  let refunds = 0;
  let refundCount = 0;
  let itemsSold = 0;
  let accSum = 0;
  let accN = 0;
  const month = new Map<string, { orders: number; gross: number; fee: number; stripe: number; refunds: number; gifts: number; tips: number }>();
  const monthRow = (m: string) => {
    let row = month.get(m);
    if (!row) {
      row = { orders: 0, gross: 0, fee: 0, stripe: 0, refunds: 0, gifts: 0, tips: 0 };
      month.set(m, row);
    }
    return row;
  };
  const day = new Map<string, { orders: number; gross: number; fee: number }>();
  const hour = new Map<number, { orders: number; gross: number }>();
  const weekday = new Map<string, { orders: number; gross: number }>();
  const items = new Map<string, { quantity: number; revenue: number }>();
  const tables = new Map<string, { orders: number; gross: number }>();

  for (const o of orders) {
    gross += o.total;
    fee += o.fee;
    // Stripe keeps its fee even when an order is refunded.
    const stripe = tipsiStripeFee(o.total, stripeRate);
    stripeFees += stripe;
    const refund = o.refunded ? (o.refundAmount > 0 ? o.refundAmount : o.total) : 0;
    if (o.refunded) {
      refundCount += 1;
      refunds += refund;
    }
    if (o.acceptanceSeconds != null && o.acceptanceSeconds >= 0) {
      accSum += o.acceptanceSeconds;
      accN += 1;
    }
    const night = tipsiNightOf(o.createdAt);
    const m = night.slice(0, 7);
    const mm = monthRow(m);
    mm.orders += 1;
    if (o.isGift) {
      mm.gifts += o.total;
      gifts += o.total;
      giftOrders += 1;
    }
    mm.gross += o.total;
    mm.fee += o.fee;
    mm.stripe += stripe;
    mm.refunds += refund;
    const dd = day.get(night) ?? { orders: 0, gross: 0, fee: 0 };
    dd.orders += 1;
    dd.gross += o.total;
    dd.fee += o.fee;
    day.set(night, dd);

    const d = new Date(o.createdAt);
    const h = Number(HOUR_FMT.format(d));
    const hh = hour.get(h) ?? { orders: 0, gross: 0 };
    hh.orders += 1;
    hh.gross += o.total;
    hour.set(h, hh);

    const wd = WEEKDAY_FMT.format(new Date(`${night}T12:00:00Z`));
    const ww = weekday.get(wd) ?? { orders: 0, gross: 0 };
    ww.orders += 1;
    ww.gross += o.total;
    weekday.set(wd, ww);

    for (const it of o.items) {
      const key = it.name;
      const cur = items.get(key) ?? { quantity: 0, revenue: 0 };
      cur.quantity += it.quantity;
      cur.revenue += it.price * it.quantity;
      items.set(key, cur);
      itemsSold += it.quantity;
    }
    if (o.tableNumber) {
      const t = tables.get(o.tableNumber) ?? { orders: 0, gross: 0 };
      t.orders += 1;
      t.gross += o.total;
      tables.set(o.tableNumber, t);
    }
  }

  let tipTotal = 0;
  for (const t of tips) {
    if (!(t.amount > 0) || !t.createdAt) continue;
    tipTotal += t.amount;
    monthRow(tipsiNightOf(t.createdAt).slice(0, 7)).tips += t.amount;
  }
  const extraSales = r2((gross * extraPercent) / 100);

  const byDay = [...day.entries()]
    .map(([d, v]) => ({ day: d, orders: v.orders, gross: r2(v.gross), fee: r2(v.fee) }))
    .sort((a, b) => a.day.localeCompare(b.day));
  const best = byDay.reduce<TipsiSummary["bestNight"]>(
    (acc, d) => (!acc || d.gross > acc.gross ? { day: d.day, gross: d.gross, orders: d.orders } : acc),
    null,
  );

  return {
    orders: orders.length,
    gross: r2(gross),
    fee: r2(fee),
    stripeFees: r2(stripeFees),
    totalFees: r2(fee + stripeFees),
    refunds: r2(refunds),
    refundCount,
    venueNet: r2(gross - refunds - fee - stripeFees),
    madeYou: {
      total: r2(gifts + tipTotal + extraSales),
      gifts: r2(gifts),
      giftOrders,
      tips: r2(tipTotal),
      tipCount: tips.filter((t) => t.amount > 0).length,
      extraSales,
      extraPercent,
    },
    avgOrder: orders.length ? r2(gross / orders.length) : 0,
    itemsSold,
    avgAcceptanceSeconds: accN ? Math.round(accSum / accN) : null,
    activeNights: day.size,
    bestNight: best,
    byMonth: [...month.entries()]
      .map(([m, v]) => ({
        month: m,
        orders: v.orders,
        gross: r2(v.gross),
        fee: r2(v.fee),
        stripeFees: r2(v.stripe),
        totalFees: r2(v.fee + v.stripe),
        net: r2(v.gross - v.refunds - v.fee - v.stripe),
        madeYou: r2(v.gifts + v.tips + (v.gross * extraPercent) / 100),
      }))
      .sort((a, b) => a.month.localeCompare(b.month)),
    byDay,
    byHour: [...hour.entries()]
      .map(([h, v]) => ({ hour: h, orders: v.orders, gross: r2(v.gross) }))
      // Bar day order: 12:00 → 05:00.
      .sort((a, b) => ((a.hour + 18) % 24) - ((b.hour + 18) % 24)),
    byWeekday: WEEKDAYS.filter((w) => weekday.has(w)).map((w) => ({
      weekday: w,
      orders: weekday.get(w)!.orders,
      gross: r2(weekday.get(w)!.gross),
    })),
    topItems: [...items.entries()]
      .map(([name, v]) => ({ name, quantity: v.quantity, revenue: r2(v.revenue) }))
      .sort((a, b) => b.revenue - a.revenue || b.quantity - a.quantity)
      .slice(0, topN),
    topTables: [...tables.entries()]
      .map(([table, v]) => ({ table, orders: v.orders, gross: r2(v.gross) }))
      .sort((a, b) => b.gross - a.gross)
      .slice(0, 10),
  };
}

/* ------------------------------------------------------------------ *
 * Periods
 * ------------------------------------------------------------------ */

export const TIPSI_PERIODS = [
  { key: "this-month", label: "This month" },
  { key: "last-month", label: "Last month" },
  { key: "30d", label: "Last 30 days" },
  { key: "season", label: "This year" },
  { key: "all", label: "All time" },
] as const;
export type TipsiPeriodKey = (typeof TIPSI_PERIODS)[number]["key"];

/** Canary is UTC+0 in winter, UTC+1 in summer: offset of local midnight for a YYYY-MM-DD. */
function canaryMidnightIso(ymd: string): string {
  const guess = new Date(`${ymd}T00:00:00Z`);
  const localHour = Number(HOUR_FMT.format(guess));
  // If local shows 01:00 at 00:00Z, local midnight was 23:00Z the day before.
  return new Date(guess.getTime() - (localHour === 0 ? 0 : localHour) * 3600_000).toISOString();
}

function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * [fromIso, toIso) for a period, as bar nights: each day runs 06:00 → 06:00 local
 * so a month includes the small hours of its last night.
 */
export function tipsiPeriodRange(
  key: string | undefined,
  now: Date = new Date(),
): { key: TipsiPeriodKey; fromIso: string | null; toIso: string | null; label: string } {
  const k = (TIPSI_PERIODS.find((p) => p.key === key)?.key ?? "all") as TipsiPeriodKey;
  const label = TIPSI_PERIODS.find((p) => p.key === k)!.label;
  const sixAm = (ymd: string) => new Date(new Date(canaryMidnightIso(ymd)).getTime() + 6 * 3600_000).toISOString();
  const today = tipsiNightOf(now.toISOString());
  const ym = today.slice(0, 7);
  switch (k) {
    case "this-month":
      return { key: k, label, fromIso: sixAm(`${ym}-01`), toIso: null };
    case "last-month":
      return { key: k, label, fromIso: sixAm(`${addMonths(ym, -1)}-01`), toIso: sixAm(`${ym}-01`) };
    case "30d": {
      const start = new Date(`${today}T12:00:00Z`);
      start.setUTCDate(start.getUTCDate() - 29);
      return { key: k, label, fromIso: sixAm(start.toISOString().slice(0, 10)), toIso: null };
    }
    case "season":
      return { key: k, label, fromIso: sixAm(`${ym.slice(0, 4)}-01-01`), toIso: null };
    default:
      return { key: "all", label, fromIso: null, toIso: null };
  }
}
