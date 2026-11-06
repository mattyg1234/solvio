/**
 * Night sale status (Joel, 6 Nov 2026) — replaces the nightly "RES HAND OVER FORM"
 * email. Per show night and island, staff cross off what has been done on the
 * outside channels. A cross means closed / done; blank means nothing done yet.
 *
 * Record only: it never blocks a booking or emails partners. Part close /
 * Full close (show_night_closes) still does that.
 */

export const SALE_STATUS_FIELDS = ["transport_closed", "part_stop_sale", "full_stop_sale"] as const;
export type SaleStatusField = (typeof SALE_STATUS_FIELDS)[number];

export const SALE_STATUS_LABEL: Record<SaleStatusField, string> = {
  transport_closed: "Transport",
  part_stop_sale: "Partial stop sale",
  full_stop_sale: "Full stop sale",
};

/** What a cross on each line means, for hover text and the key. */
export const SALE_STATUS_HINT: Record<SaleStatusField, string> = {
  transport_closed: "Transport no longer available",
  part_stop_sale: "Stop sale email sent · Tiqets & Viator closed · GYG / MHT web reduced",
  full_stop_sale: "Everything closed online",
};

export type NightSaleStatus = {
  show_date: string;
  island: string;
  transport_closed: boolean;
  part_stop_sale: boolean;
  full_stop_sale: boolean;
  updated_at: string | null;
  updated_by_name: string | null;
};

export const SALE_STATUS_COLUMNS =
  "show_date,island,transport_closed,part_stop_sale,full_stop_sale,updated_at,updated_by_name";

export function isSaleStatusField(v: string): v is SaleStatusField {
  return (SALE_STATUS_FIELDS as readonly string[]).includes(v);
}

export function saleStatusKey(date: string, island: string) {
  return `${date}|${island}`;
}

/** date|island -> status. Rows with nothing crossed are kept; callers just see false everywhere. */
export function saleStatusMap(rows: Array<Partial<NightSaleStatus>> | null | undefined): Map<string, NightSaleStatus> {
  const out = new Map<string, NightSaleStatus>();
  for (const r of rows ?? []) {
    if (!r.show_date || !r.island) continue;
    out.set(saleStatusKey(r.show_date, r.island), {
      show_date: r.show_date,
      island: r.island,
      transport_closed: Boolean(r.transport_closed),
      part_stop_sale: Boolean(r.part_stop_sale),
      full_stop_sale: Boolean(r.full_stop_sale),
      updated_at: r.updated_at ?? null,
      updated_by_name: r.updated_by_name ?? null,
    });
  }
  return out;
}

/** The fields crossed on a night, in display order. */
export function crossedFields(s: NightSaleStatus | null | undefined): SaleStatusField[] {
  if (!s) return [];
  return SALE_STATUS_FIELDS.filter((f) => s[f]);
}

/** Who last changed it, for the line under the marks, e.g. "Nic · 6 Nov 21:00". */
export function saleStatusStamp(s: NightSaleStatus | null | undefined): string | null {
  if (!s?.updated_at) return null;
  const when = new Date(s.updated_at).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Atlantic/Canary",
  });
  return s.updated_by_name ? `${s.updated_by_name} · ${when}` : when;
}
