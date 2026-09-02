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

/**
 * Storage path for a snapshot — sorts newest-last inside the tenant's folder.
 * Snapshots are gzipped: a 15 MB tenant JSON is ~1.5 MB on the wire and on disk.
 */
export function backupObjectPath(businessId: string, exportedAt: string): string {
  return `${businessId}/${exportedAt.replace(/[:.]/g, "-")}.json.gz`;
}

export const SHOW_OPS_BACKUP_BUCKET = "show-ops-backups";

/** Recover the ISO timestamp a snapshot file name encodes; null for anything else. */
export function snapshotTimestamp(name: string): string | null {
  const base = name.split("/").pop() ?? name;
  const m = base.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z\.json(?:\.gz)?$/);
  if (!m) return null;
  const iso = `${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

export const SHOW_OPS_BACKUP_RETENTION = {
  /** Keep every snapshot from the last hour (12 at five-minute cadence). */
  everyMinutes: 60,
  /** Then one per hour for a day. */
  hourlyHours: 24,
  /** Then one per day for a month. */
  dailyDays: 30,
} as const;

/**
 * Which snapshots to delete so the mirror stays a mirror, not a landfill.
 *
 * The five-minute job wrote 288 full copies a day and nothing ever removed
 * one — 19 GB in six days on a free-tier bucket shared with Tipsi. Retention
 * is tiered: everything from the last hour, the newest per hour for a day,
 * the newest per day for a month, and always the single newest file. The
 * newest copy is a complete snapshot, so pruning loses nothing operational.
 */
export function snapshotsToPrune(names: string[], now = new Date()): string[] {
  const r = SHOW_OPS_BACKUP_RETENTION;
  const nowMs = now.getTime();
  const dated = names
    .map((name) => ({ name, iso: snapshotTimestamp(name) }))
    .filter((x): x is { name: string; iso: string } => Boolean(x.iso))
    .map((x) => ({ ...x, ms: Date.parse(x.iso) }))
    .sort((a, b) => b.ms - a.ms);
  if (!dated.length) return [];

  const keep = new Set<string>([dated[0].name]);
  const hourKept = new Set<string>();
  const dayKept = new Set<string>();
  for (const s of dated) {
    const age = nowMs - s.ms;
    if (age <= r.everyMinutes * 60_000) {
      keep.add(s.name);
      continue;
    }
    if (age <= r.hourlyHours * 3_600_000) {
      const bucket = s.iso.slice(0, 13); // YYYY-MM-DDTHH
      if (!hourKept.has(bucket)) {
        hourKept.add(bucket);
        keep.add(s.name);
      }
      continue;
    }
    if (age <= r.dailyDays * 86_400_000) {
      const bucket = s.iso.slice(0, 10); // YYYY-MM-DD
      if (!dayKept.has(bucket)) {
        dayKept.add(bucket);
        keep.add(s.name);
      }
    }
  }
  return dated.filter((s) => !keep.has(s.name)).map((s) => s.name);
}
