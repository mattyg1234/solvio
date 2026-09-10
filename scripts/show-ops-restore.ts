/**
 * Restore a Show Ops tenant snapshot into a Supabase project.
 *
 *   npx tsx scripts/show-ops-restore.ts --file <snapshot.json.gz> --dry-run
 *   npx tsx scripts/show-ops-restore.ts --file <snapshot.json.gz> \
 *       --target-url https://<ref>.supabase.co --target-service-key <service-role-key>
 *
 * Flags
 *   --file <path>                Snapshot written by the backup cron (.json.gz) or the
 *                                dashboard export (.json). Format 2 and 3 accepted.
 *   --target-url <url>           Supabase project URL to write into. REFUSED when it
 *                                contains the production ref (aasfahcrdcoqxwnlkdnv).
 *   --target-service-key <key>   Service-role key of that project (bypasses RLS).
 *   --dry-run                    Parse and validate the file, print what would be
 *                                written, touch nothing. --target-url is optional
 *                                here but still checked against production.
 *
 * What it does
 *   1. Upserts the `businesses` row from the snapshot (only the columns the
 *      snapshot carries). On a brand-new project that row needs an owner_id, so
 *      create the business there first and let this step merge into it.
 *   2. Upserts every table in dependency order (parents first) in chunks of 500,
 *      keyed on the primary key. Rows already present with the same key are
 *      overwritten; rows only present in the target are left alone.
 *   3. Retries any table that failed once all others are in, which resolves
 *      back-references such as show_suppliers.sale_rate_id.
 *   4. Prints a per-table count and exits non-zero if any table failed.
 *
 * Not restored by this script
 *   - Storage objects. The snapshot's `files` manifest lists them; the cron
 *     mirrors them into the show-ops-backups bucket under
 *     <businessId>/files/<bucket>/<path>. Copy those back by hand.
 *   - show_ops_members.user_id references auth.users; in a project without the
 *     same users those rows fail and are reported. Re-invite the team instead.
 *   - Secrets. show_ops_integrations.secret_ciphertext is encrypted with
 *     SHOW_OPS_SECRETS_KEY; the target must carry the same key to read them.
 */
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  assertRestoreTarget,
  chunk,
  conflictColumns,
  parseRestoreArgs,
  parseSnapshot,
  restoreOrder,
  tablesMissingFromSnapshot,
  type RestoreSnapshot,
} from "../src/lib/show-ops/restore";

const CHUNK = 500;

function readSnapshot(file: string): RestoreSnapshot {
  const bytes = readFileSync(file);
  const isGzip = file.endsWith(".gz") || (bytes[0] === 0x1f && bytes[1] === 0x8b);
  const text = (isGzip ? gunzipSync(bytes) : bytes).toString("utf8");
  return parseSnapshot(JSON.parse(text));
}

function describe(snapshot: RestoreSnapshot, order: string[]): void {
  const biz = snapshot.business;
  console.log(`Snapshot format ${snapshot.format}, exported ${snapshot.exported_at || "(unknown)"}`);
  console.log(`Business ${biz.id} — ${String(biz.name ?? "(unnamed)")}`);
  console.log("");
  console.log("Tables in restore order:");
  let total = 0;
  for (const table of order) {
    const n = snapshot.tables[table].length;
    total += n;
    console.log(`  ${table.padEnd(36)} ${String(n).padStart(7)} rows  (key: ${conflictColumns(table)})`);
  }
  console.log(`  ${"total".padEnd(36)} ${String(total).padStart(7)} rows`);
  const missing = tablesMissingFromSnapshot(snapshot);
  if (missing.length) console.log(`\nTables the backup knows but this snapshot lacks (older format?): ${missing.join(", ")}`);
  const errs = Object.entries(snapshot.errors);
  if (errs.length) {
    console.log("\nErrors recorded at backup time (these tables/listings are NOT in the file):");
    for (const [k, v] of errs) console.log(`  ${k}: ${v}`);
  }
  console.log(`\nFiles in manifest: ${snapshot.files.length} (not restored by this script — see header).`);
}

async function upsertTable(
  db: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
): Promise<{ written: number; error: string | null }> {
  let written = 0;
  for (const part of chunk(rows, CHUNK)) {
    const { error } = await db.from(table).upsert(part, { onConflict: conflictColumns(table) });
    if (error) return { written, error: `${error.code ?? ""} ${error.message}`.trim() };
    written += part.length;
  }
  return { written, error: null };
}

async function main(): Promise<number> {
  const args = parseRestoreArgs(process.argv.slice(2));
  const snapshot = readSnapshot(args.file);
  const order = restoreOrder(Object.keys(snapshot.tables));
  describe(snapshot, order);

  if (args.dryRun) {
    console.log("\nDry run: nothing written." + (args.targetUrl ? ` Target ${args.targetUrl} accepted (not production).` : ""));
    return 0;
  }

  const targetUrl = args.targetUrl!;
  assertRestoreTarget(targetUrl);
  const db = createClient(targetUrl, args.targetServiceKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  console.log(`\nRestoring into ${targetUrl}`);

  const { error: bizErr } = await db.from("businesses").upsert(snapshot.business, { onConflict: "id" });
  if (bizErr) {
    console.error(`businesses: ${bizErr.message}`);
    console.error("Every Show Ops table references the business row, so stopping here. Create the business in the target first.");
    return 1;
  }
  console.log(`  ${"businesses".padEnd(36)} ${"1".padStart(7)} row`);

  const failed = new Map<string, string>();
  for (const table of order) {
    const res = await upsertTable(db, table, snapshot.tables[table]);
    if (res.error) {
      failed.set(table, res.error);
      console.log(`  ${table.padEnd(36)} ${String(res.written).padStart(7)} rows  FAILED: ${res.error}`);
    } else {
      console.log(`  ${table.padEnd(36)} ${String(res.written).padStart(7)} rows`);
    }
  }

  if (failed.size) {
    console.log("\nRetrying failed tables now that everything else is in:");
    for (const table of restoreOrder(failed.keys())) {
      const res = await upsertTable(db, table, snapshot.tables[table]);
      if (res.error) {
        failed.set(table, res.error);
        console.log(`  ${table.padEnd(36)} ${String(res.written).padStart(7)} rows  FAILED: ${res.error}`);
      } else {
        failed.delete(table);
        console.log(`  ${table.padEnd(36)} ${String(res.written).padStart(7)} rows`);
      }
    }
  }

  if (failed.size) {
    console.error(`\n${failed.size} table(s) failed: ${[...failed.keys()].join(", ")}`);
    return 1;
  }
  console.log("\nDone.");
  return 0;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  },
);
