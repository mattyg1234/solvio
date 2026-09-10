import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Show Ops tenant backup.
 *
 * Every table is read in pages. PostgREST caps a plain select at 1000 rows and
 * says nothing about it, so the old one-shot export quietly wrote a backup holding
 * only the first page of a busy tenant's bookings — a file that looks fine and
 * restores a fraction of the business.
 *
 * Format 3 adds two things format 2 lacked:
 *   - `files`: a manifest of every storage object the tenant owns (receipts,
 *     ticket photos, no-show proofs in `show-ops-proofs`, plus the logo in
 *     `business-logos`). The cron mirrors those objects into the backup bucket
 *     under `<businessId>/files/<bucket>/<path>` — see mirrorShowOpsFiles.
 *   - `errors`: tables that could not be read because they do not exist in the
 *     database being backed up. A staging project that lags a migration must not
 *     abort the whole snapshot; the missing table is named here instead.
 *
 * Restore note: `show_ops_integrations.secret_ciphertext` is encrypted with
 * SHOW_OPS_SECRETS_KEY (see ./secrets.ts). A snapshot restored into another
 * project only yields working integrations if that project is given the same
 * SHOW_OPS_SECRETS_KEY; otherwise the rows restore but the secrets are opaque.
 */

const PAGE = 1000;

/**
 * Every business-scoped Show Ops table in production. Order here is the read
 * order only; the restore script (scripts/show-ops-restore.ts) applies its own
 * dependency order.
 */
export const SHOW_OPS_BACKUP_TABLES = [
  "show_suppliers",
  "show_supplier_rates",
  "show_rate_prices",
  "show_products",
  "show_ticket_types",
  "show_extras",
  "show_bus_stops",
  "show_hotels_directory",
  "show_hotels",
  "show_pickup_timetables",
  "show_bus_orders",
  "show_bus_night_orders",
  "show_bookings",
  "show_booking_payments",
  "show_booking_history",
  "show_invoices",
  "show_invoice_lines",
  "show_invoice_external_events",
  "show_expenses",
  "show_night_closes",
  "show_seat_holds",
  "show_channel_products",
  "show_channel_availability_pushes",
  "show_ops_integrations",
  "show_ops_members",
] as const;

export type ShowOpsBackupTable = (typeof SHOW_OPS_BACKUP_TABLES)[number];

/** Tables without an `id` column need another stable ordering for paging. */
const ORDER_COLUMNS: Partial<Record<string, readonly string[]>> = {
  show_channel_availability_pushes: ["channel", "external_product_id", "show_date"],
};

/** Columns a table is paged by — `id` unless the table has no such column. */
export function backupOrderColumns(table: string): readonly string[] {
  return ORDER_COLUMNS[table] ?? ["id"];
}

type PostgrestErrorLike = { code?: string | null; message?: string | null } | null | undefined;

/**
 * True when PostgREST says the relation is not there at all. 42P01 is Postgres'
 * undefined_table; PGRST205 is PostgREST's own "table not in schema cache".
 */
export function isMissingTableError(error: PostgrestErrorLike): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  const message = String(error.message ?? "");
  return /relation .* does not exist/i.test(message) || /could not find the table/i.test(message);
}

/** Reads a whole table for one tenant, page by page, ordered so paging is stable. */
export async function fetchAllRows(
  supabase: SupabaseClient,
  table: string,
  businessId: string,
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = supabase.from(table).select("*").eq("business_id", businessId);
    for (const column of backupOrderColumns(table)) query = query.order(column, { ascending: true });
    const { data, error } = await query.range(from, from + PAGE - 1);
    if (error) {
      const err = new Error(`${table}: ${error.message}`) as Error & { code?: string; missingTable?: boolean };
      err.code = error.code ?? undefined;
      err.missingTable = isMissingTableError(error);
      throw err;
    }
    const rows = (data ?? []) as Record<string, unknown>[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

export type ShowOpsBackupFile = {
  bucket: string;
  path: string;
  size: number | null;
  updated_at: string | null;
};

export type ShowOpsBackup = {
  format: 3;
  exported_at: string;
  business: Record<string, unknown>;
  /** Row count per table, so a truncated or failed backup is obvious on sight. */
  counts: Record<string, number>;
  tables: Record<string, Record<string, unknown>[]>;
  /** Tables (or storage listings) that could not be read, keyed by name. */
  errors: Record<string, string>;
  /** Every storage object the tenant owns; mirrored by the cron, not embedded. */
  files: ShowOpsBackupFile[];
};

/** Private bucket holding receipts, ticket photos and no-show proofs under `<businessId>/`. */
export const SHOW_OPS_PROOFS_BUCKET = "show-ops-proofs";
/** Public bucket holding tenant logos under `<businessId>/logo-<uuid>.<ext>`. */
export const BUSINESS_LOGOS_BUCKET = "business-logos";

const STORAGE_PAGE = 1000;

type StorageObject = {
  name: string;
  id?: string | null;
  updated_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

/**
 * Every object under a prefix, recursing into folders. Supabase Storage `list`
 * is one folder at a time and pages with limit/offset, so a tenant with
 * `expenses/` and `tickets/` sub-folders needs one walk per folder.
 */
export async function listBucketObjects(
  supabase: SupabaseClient,
  bucket: string,
  prefix: string,
): Promise<ShowOpsBackupFile[]> {
  const out: ShowOpsBackupFile[] = [];
  const folders = [prefix.replace(/\/+$/, "")];
  while (folders.length) {
    const folder = folders.shift()!;
    for (let offset = 0; ; offset += STORAGE_PAGE) {
      const { data, error } = await supabase.storage
        .from(bucket)
        .list(folder, { limit: STORAGE_PAGE, offset, sortBy: { column: "name", order: "asc" } });
      if (error) throw new Error(`${bucket}/${folder}: ${error.message}`);
      const page = (data ?? []) as StorageObject[];
      for (const obj of page) {
        if (!obj.name || obj.name === ".emptyFolderPlaceholder") continue;
        const path = folder ? `${folder}/${obj.name}` : obj.name;
        // Folders come back with no id and no metadata.
        if (!obj.id && !obj.metadata) {
          folders.push(path);
          continue;
        }
        const size = obj.metadata?.size;
        out.push({
          bucket,
          path,
          size: typeof size === "number" ? size : size != null ? Number(size) : null,
          updated_at: obj.updated_at ?? null,
        });
      }
      if (page.length < STORAGE_PAGE) break;
    }
  }
  return out;
}

/**
 * Object paths inside the logos bucket that the business row points at.
 * `logo_url` / `show_ops_logo_url` hold public URLs of the form
 * `.../storage/v1/object/public/business-logos/<businessId>/logo-<uuid>.png`;
 * anything not in that bucket (an external URL, say) is not ours to back up.
 */
export function logoObjectPaths(business: Record<string, unknown>, bucket = BUSINESS_LOGOS_BUCKET): string[] {
  const out = new Set<string>();
  for (const key of ["logo_url", "show_ops_logo_url"]) {
    const url = business[key];
    if (typeof url !== "string" || !url.trim()) continue;
    const m = url.match(new RegExp(`/storage/v1/object/(?:public|sign|authenticated)/${bucket}/([^?#]+)`));
    if (m) out.add(decodeURIComponent(m[1]));
  }
  return [...out];
}

async function statObject(supabase: SupabaseClient, bucket: string, path: string): Promise<ShowOpsBackupFile | null> {
  const slash = path.lastIndexOf("/");
  const folder = slash >= 0 ? path.slice(0, slash) : "";
  const base = slash >= 0 ? path.slice(slash + 1) : path;
  const { data, error } = await supabase.storage.from(bucket).list(folder, { limit: 100, offset: 0, search: base });
  if (error) throw new Error(`${bucket}/${path}: ${error.message}`);
  const obj = ((data ?? []) as StorageObject[]).find((o) => o.name === base);
  if (!obj) return null;
  const size = obj.metadata?.size;
  return {
    bucket,
    path,
    size: typeof size === "number" ? size : size != null ? Number(size) : null,
    updated_at: obj.updated_at ?? null,
  };
}

/** Manifest of every file the tenant owns: proofs folder plus the logo(s) on the business row. */
export async function listShowOpsFiles(
  supabase: SupabaseClient,
  business: Record<string, unknown>,
  errors: Record<string, string>,
): Promise<ShowOpsBackupFile[]> {
  const businessId = String(business.id);
  const files: ShowOpsBackupFile[] = [];
  try {
    files.push(...(await listBucketObjects(supabase, SHOW_OPS_PROOFS_BUCKET, businessId)));
  } catch (e) {
    errors[`storage:${SHOW_OPS_PROOFS_BUCKET}`] = e instanceof Error ? e.message : String(e);
  }
  for (const path of logoObjectPaths(business)) {
    try {
      const file = await statObject(supabase, BUSINESS_LOGOS_BUCKET, path);
      if (file) files.push(file);
      else errors[`storage:${BUSINESS_LOGOS_BUCKET}:${path}`] = "logo object referenced by the business row is missing";
    } catch (e) {
      errors[`storage:${BUSINESS_LOGOS_BUCKET}:${path}`] = e instanceof Error ? e.message : String(e);
    }
  }
  return files;
}

export async function buildShowOpsBackup(
  supabase: SupabaseClient,
  business: Record<string, unknown>,
  exportedAt = new Date().toISOString(),
): Promise<ShowOpsBackup> {
  const businessId = String(business.id);
  const tables: Record<string, Record<string, unknown>[]> = {};
  const counts: Record<string, number> = {};
  const errors: Record<string, string> = {};
  for (const table of SHOW_OPS_BACKUP_TABLES) {
    try {
      const rows = await fetchAllRows(supabase, table, businessId);
      tables[table] = rows;
      counts[table] = rows.length;
    } catch (e) {
      // A table this database has not got yet is recorded, not fatal. Anything else is.
      if (e instanceof Error && (e as Error & { missingTable?: boolean }).missingTable) {
        errors[table] = e.message;
        continue;
      }
      throw e;
    }
  }
  const files = await listShowOpsFiles(supabase, business, errors);
  return { format: 3, exported_at: exportedAt, business, counts, tables, errors, files };
}

/**
 * Storage path for a snapshot — sorts newest-last inside the tenant's folder.
 * Snapshots are gzipped: a 15 MB tenant JSON is ~1.5 MB on the wire and on disk.
 */
export function backupObjectPath(businessId: string, exportedAt: string): string {
  return `${businessId}/${exportedAt.replace(/[:.]/g, "-")}.json.gz`;
}

export const SHOW_OPS_BACKUP_BUCKET = "show-ops-backups";

/** Sub-folder of the tenant's backup folder that holds mirrored storage objects. */
export const SHOW_OPS_BACKUP_FILES_FOLDER = "files";

/** Where a tenant's storage object is mirrored inside the backup bucket. */
export function mirrorObjectPath(businessId: string, file: Pick<ShowOpsBackupFile, "bucket" | "path">): string {
  return `${businessId}/${SHOW_OPS_BACKUP_FILES_FOLDER}/${file.bucket}/${file.path}`;
}

/** True when the path sits inside a tenant's mirrored-files folder. */
export function isMirrorPath(name: string): boolean {
  return new RegExp(`(^|/)${SHOW_OPS_BACKUP_FILES_FOLDER}(/|$)`).test(name);
}

/**
 * Whether a source object still needs copying. The mirrored copy's own
 * updated_at is the time we copied it, so "same updated_at" is read as: the
 * copy is at least as new as the source and the same size.
 */
export function needsMirror(file: ShowOpsBackupFile, existing: ShowOpsBackupFile | undefined): boolean {
  if (!existing) return true;
  if (existing.size !== file.size) return true;
  if (!file.updated_at || !existing.updated_at) return false;
  return Date.parse(existing.updated_at) < Date.parse(file.updated_at);
}

/** Everything already mirrored for a tenant, keyed by mirror path. */
export async function listShowOpsMirror(supabase: SupabaseClient, businessId: string): Promise<ShowOpsBackupFile[]> {
  return listBucketObjects(supabase, SHOW_OPS_BACKUP_BUCKET, `${businessId}/${SHOW_OPS_BACKUP_FILES_FOLDER}`);
}

export type MirrorResult = {
  mirrored: number;
  skipped: number;
  errors: Record<string, string>;
};

/**
 * Copies each listed object into the backup bucket at
 * `<businessId>/files/<bucket>/<path>` unless an up-to-date copy is already
 * there. Uses server-side copy across buckets; if the storage API refuses that
 * (older gateways), downloads and re-uploads. One file failing is recorded and
 * the rest still mirror.
 */
export async function mirrorShowOpsFiles(
  supabase: SupabaseClient,
  businessId: string,
  files: ShowOpsBackupFile[],
  existingMirror: ShowOpsBackupFile[],
): Promise<MirrorResult> {
  const existing = new Map(existingMirror.map((f) => [f.path, f]));
  const result: MirrorResult = { mirrored: 0, skipped: 0, errors: {} };
  for (const file of files) {
    const dest = mirrorObjectPath(businessId, file);
    if (!needsMirror(file, existing.get(dest))) {
      result.skipped += 1;
      continue;
    }
    try {
      const { error: copyErr } = await supabase.storage
        .from(file.bucket)
        .copy(file.path, dest, { destinationBucket: SHOW_OPS_BACKUP_BUCKET });
      if (copyErr) {
        const { data: blob, error: dlErr } = await supabase.storage.from(file.bucket).download(file.path);
        if (dlErr || !blob) throw new Error(`copy: ${copyErr.message}; download: ${dlErr?.message ?? "no data"}`);
        const { error: upErr } = await supabase.storage
          .from(SHOW_OPS_BACKUP_BUCKET)
          .upload(dest, blob, { contentType: blob.type || "application/octet-stream", upsert: true });
        if (upErr) throw new Error(`copy: ${copyErr.message}; upload: ${upErr.message}`);
      }
      result.mirrored += 1;
    } catch (e) {
      result.errors[`${file.bucket}/${file.path}`] = e instanceof Error ? e.message : String(e);
    }
  }
  return result;
}

/** Recover the ISO timestamp a snapshot file name encodes; null for anything else. */
export function snapshotTimestamp(name: string): string | null {
  if (isMirrorPath(name)) return null;
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
 *
 * Only timestamped snapshot names are ever candidates. Mirrored storage
 * objects under `files/` are never selected, whatever they are called.
 */
export function snapshotsToPrune(names: string[], now = new Date()): string[] {
  const r = SHOW_OPS_BACKUP_RETENTION;
  const nowMs = now.getTime();
  const dated = names
    .filter((name) => !isMirrorPath(name))
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
