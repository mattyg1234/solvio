import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Show Ops tenant backup.
 *
 * Every table is read in pages. PostgREST caps a plain select at 1000 rows and
 * says nothing about it, so the old one-shot export quietly wrote a backup holding
 * only the first page of a busy tenant's bookings — a file that looks fine and
 * restores a fraction of the business.
 */

const PAGE = 1000;

export const SHOW_OPS_BACKUP_TABLES = [
  "show_suppliers",
  "show_products",
  "show_bus_stops",
  "show_hotels",
  "show_bus_orders",
  "show_bookings",
  "show_booking_payments",
  "show_invoices",
  "show_invoice_lines",
  "show_ops_members",
] as const;

export type ShowOpsBackupTable = (typeof SHOW_OPS_BACKUP_TABLES)[number];

/** Reads a whole table for one tenant, page by page, ordered so paging is stable. */
export async function fetchAllRows(
  supabase: SupabaseClient,
  table: string,
  businessId: string,
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq("business_id", businessId)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const rows = (data ?? []) as Record<string, unknown>[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

export type ShowOpsBackup = {
  format: 2;
  exported_at: string;
  business: Record<string, unknown>;
  /** Row count per table, so a truncated or failed backup is obvious on sight. */
  counts: Record<string, number>;
  tables: Record<string, Record<string, unknown>[]>;
};

export async function buildShowOpsBackup(
  supabase: SupabaseClient,
  business: Record<string, unknown>,
  exportedAt = new Date().toISOString(),
): Promise<ShowOpsBackup> {
  const businessId = String(business.id);
  const tables: Record<string, Record<string, unknown>[]> = {};
  const counts: Record<string, number> = {};
  for (const table of SHOW_OPS_BACKUP_TABLES) {
    const rows = await fetchAllRows(supabase, table, businessId);
    tables[table] = rows;
    counts[table] = rows.length;
  }
  return { format: 2, exported_at: exportedAt, business, counts, tables };
}

/** Storage path for a snapshot — sorts newest-last inside the tenant's folder. */
export function backupObjectPath(businessId: string, exportedAt: string): string {
  return `${businessId}/${exportedAt.replace(/[:.]/g, "-")}.json`;
}

export const SHOW_OPS_BACKUP_BUCKET = "show-ops-backups";
