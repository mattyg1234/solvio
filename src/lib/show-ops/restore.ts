import { SHOW_OPS_BACKUP_TABLES, type ShowOpsBackup, type ShowOpsBackupFile } from "./backup";

/**
 * Pure parts of the Show Ops snapshot restore, kept out of the script so they
 * can be unit-tested: argument parsing, snapshot validation, table ordering
 * and the production guard. The script (scripts/show-ops-restore.ts) does the
 * network I/O.
 */

/** Supabase project ref of the live Solvio database. A restore must never target it. */
export const PRODUCTION_PROJECT_REF = "aasfahcrdcoqxwnlkdnv";

export function isProductionTarget(url: string): boolean {
  return url.toLowerCase().includes(PRODUCTION_PROJECT_REF);
}

/** Throws when the URL points at production; a restore there would overwrite live bookings. */
export function assertRestoreTarget(url: string): void {
  if (!/^https?:\/\//i.test(url)) throw new Error(`--target-url must be an http(s) URL, got "${url}"`);
  if (isProductionTarget(url)) {
    throw new Error(
      `Refusing to restore into production (project ref ${PRODUCTION_PROJECT_REF}). ` +
        "Point --target-url at a staging or freshly created project.",
    );
  }
}

/**
 * Restore order. Parents before children so foreign keys resolve on the first
 * pass; the script retries any table that fails once everything else is in,
 * which covers the one known back-reference (show_suppliers.sale_rate_id).
 */
export const RESTORE_ORDER: readonly string[] = [
  "show_suppliers",
  "show_products",
  "show_supplier_rates",
  "show_rate_prices",
  "show_bus_stops",
  "show_hotels_directory",
  "show_hotels",
  "show_ticket_types",
  "show_extras",
  "show_bookings",
  "show_booking_payments",
  "show_booking_history",
  "show_invoices",
  "show_invoice_lines",
  "show_invoice_external_events",
  "show_pickup_timetables",
  "show_bus_orders",
  "show_bus_night_orders",
  "show_expenses",
  "show_night_closes",
  "show_ops_integrations",
  "show_channel_products",
  "show_seat_holds",
  "show_channel_availability_pushes",
  "show_ops_members",
];

/** Orders the tables present in a snapshot: known tables by RESTORE_ORDER, unknown ones after, alphabetically. */
export function restoreOrder(tables: Iterable<string>): string[] {
  const present = new Set(tables);
  const known = RESTORE_ORDER.filter((t) => present.has(t));
  const unknown = [...present].filter((t) => !RESTORE_ORDER.includes(t)).sort();
  return [...known, ...unknown];
}

const CONFLICT_COLUMNS: Partial<Record<string, string>> = {
  show_channel_availability_pushes: "business_id,channel,external_product_id,show_date",
};

/** Upsert key per table — the primary key, which is `id` everywhere but one table. */
export function conflictColumns(table: string): string {
  return CONFLICT_COLUMNS[table] ?? "id";
}

export type RestoreSnapshot = {
  format: 2 | 3;
  exported_at: string;
  business: Record<string, unknown> & { id: string };
  counts: Record<string, number>;
  tables: Record<string, Record<string, unknown>[]>;
  errors: Record<string, string>;
  files: ShowOpsBackupFile[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Validates a parsed snapshot. Accepts format 2 (no `errors`/`files`) and
 * format 3; refuses anything else so a stray file is never half-restored.
 */
export function parseSnapshot(raw: unknown): RestoreSnapshot {
  if (!isRecord(raw)) throw new Error("Snapshot is not a JSON object.");
  const format = raw.format;
  if (format !== 2 && format !== 3) throw new Error(`Unsupported snapshot format ${String(format)}; expected 2 or 3.`);
  if (!isRecord(raw.business) || typeof raw.business.id !== "string" || !raw.business.id) {
    throw new Error("Snapshot has no business.id.");
  }
  if (!isRecord(raw.tables)) throw new Error("Snapshot has no tables object.");
  const tables: Record<string, Record<string, unknown>[]> = {};
  for (const [name, rows] of Object.entries(raw.tables)) {
    if (!Array.isArray(rows)) throw new Error(`Table ${name} is not an array.`);
    for (const row of rows) {
      if (!isRecord(row)) throw new Error(`Table ${name} holds a non-object row.`);
      if (row.business_id !== raw.business.id) {
        throw new Error(`Table ${name} holds a row for business ${String(row.business_id)}, not ${raw.business.id}.`);
      }
    }
    tables[name] = rows as Record<string, unknown>[];
  }
  const counts = isRecord(raw.counts) ? (raw.counts as Record<string, number>) : {};
  for (const [name, rows] of Object.entries(tables)) {
    if (typeof counts[name] === "number" && counts[name] !== rows.length) {
      throw new Error(`Table ${name}: counts says ${counts[name]} rows but ${rows.length} are present.`);
    }
  }
  const errors = format === 3 && isRecord(raw.errors) ? (raw.errors as Record<string, string>) : {};
  const files = format === 3 && Array.isArray(raw.files) ? (raw.files as ShowOpsBackupFile[]) : [];
  return {
    format,
    exported_at: typeof raw.exported_at === "string" ? raw.exported_at : "",
    business: raw.business as RestoreSnapshot["business"],
    counts,
    tables,
    errors,
    files,
  };
}

/** Tables the backup knows about that the snapshot is silent on — neither rows nor a recorded error. */
export function tablesMissingFromSnapshot(snapshot: Pick<RestoreSnapshot, "tables" | "errors">): string[] {
  return SHOW_OPS_BACKUP_TABLES.filter((t) => !(t in snapshot.tables) && !(t in snapshot.errors));
}

export type RestoreArgs = {
  file: string;
  targetUrl: string | null;
  targetServiceKey: string | null;
  dryRun: boolean;
};

export function parseRestoreArgs(argv: string[]): RestoreArgs {
  const out: RestoreArgs = { file: "", targetUrl: null, targetServiceKey: null, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith("--")) throw new Error(`${arg} needs a value.`);
      i += 1;
      return v;
    };
    if (arg === "--file") out.file = next();
    else if (arg === "--target-url") out.targetUrl = next().replace(/\/+$/, "");
    else if (arg === "--target-service-key") out.targetServiceKey = next();
    else if (arg === "--dry-run") out.dryRun = true;
    else throw new Error(`Unknown argument ${arg}.`);
  }
  if (!out.file) throw new Error("--file <snapshot.json.gz> is required.");
  if (out.targetUrl) assertRestoreTarget(out.targetUrl);
  if (!out.dryRun) {
    if (!out.targetUrl) throw new Error("--target-url is required unless --dry-run.");
    if (!out.targetServiceKey) throw new Error("--target-service-key is required unless --dry-run.");
  }
  return out;
}

export function chunk<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

export type { ShowOpsBackup };
