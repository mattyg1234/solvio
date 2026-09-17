import { round2 } from "./calc";
import { pickRatePrice, type RatePriceRow } from "./rate-cards";

/**
 * The editable view of one rate card: for every show, the price with the bus
 * and the price without — the same two rows `pickRatePrice` reads when a
 * booking is priced, so what the grid shows is what the desk charges.
 */
export type RateGridCell = { adult: number | null; child: number | null };
export type RateGridRow = {
  product_id: string;
  product_name: string;
  product_active: boolean;
  bus: RateGridCell;
  noBus: RateGridCell;
};

export type RateGridProduct = { id: string; name: string; active: boolean };

function cellFor(rows: RatePriceRow[], productId: string, transportRequired: boolean): RateGridCell {
  const hit = pickRatePrice(rows, productId, transportRequired);
  return hit ? { adult: hit.adult_price, child: hit.child_price } : { adult: null, child: null };
}

/** One grid row per show — live shows first, then archived ones that still carry a price. */
export function buildRateGrid(products: RateGridProduct[], rows: RatePriceRow[]): RateGridRow[] {
  const priced = new Set(rows.map((r) => r.product_id));
  return products
    .filter((p) => p.active || priced.has(p.id))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name))
    .map((p) => ({
      product_id: p.id,
      product_name: p.name,
      product_active: p.active,
      bus: cellFor(rows, p.id, true),
      noBus: cellFor(rows, p.id, false),
    }));
}

export const rateGridField = (kind: "adult" | "child", productId: string, noTransport: boolean) =>
  `${kind}:${productId}:${noTransport ? "nobus" : "bus"}`;

export type RateGridChange = {
  product_id: string;
  no_transport: boolean;
  /** null clears the card price, so the show falls back to its own master price. */
  adult_price: number | null;
  child_price: number | null;
};

function parsePrice(raw: unknown): number | null | "bad" {
  const s = String(raw ?? "").trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > 100000) return "bad";
  return round2(n);
}

/**
 * Only the cells the user actually changed. A cell needs both prices or neither;
 * anything else is reported back rather than half-saved.
 */
export function rateGridChanges(
  grid: RateGridRow[],
  read: (field: string) => unknown,
): { changes: RateGridChange[]; error: string | null } {
  const changes: RateGridChange[] = [];
  for (const row of grid) {
    for (const noTransport of [false, true]) {
      const adultField = rateGridField("adult", row.product_id, noTransport);
      const childField = rateGridField("child", row.product_id, noTransport);
      const rawAdult = read(adultField);
      const rawChild = read(childField);
      // A show that was not on the submitted form is left alone.
      if (rawAdult === null || rawAdult === undefined || rawChild === null || rawChild === undefined) continue;
      const adult = parsePrice(rawAdult);
      const child = parsePrice(rawChild);
      const label = `${row.product_name} (${noTransport ? "no bus" : "with bus"})`;
      if (adult === "bad" || child === "bad") return { changes: [], error: `${label}: prices must be a number, 0 or more.` };
      if ((adult === null) !== (child === null)) {
        return { changes: [], error: `${label}: fill in both the adult and child price, or clear both.` };
      }
      const current = noTransport ? row.noBus : row.bus;
      if (current.adult === adult && current.child === child) continue;
      changes.push({ product_id: row.product_id, no_transport: noTransport, adult_price: adult, child_price: child });
    }
  }
  return { changes, error: null };
}
