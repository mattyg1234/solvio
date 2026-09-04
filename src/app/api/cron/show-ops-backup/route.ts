import { gzipSync } from "node:zlib";

import { NextRequest, NextResponse } from "next/server";

import {
  SHOW_OPS_BACKUP_BUCKET,
  backupObjectPath,
  buildShowOpsBackup,
  snapshotsToPrune,
} from "@/lib/show-ops/backup";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = req.headers.get("authorization") || "";
  if (header === `Bearer ${secret}`) return true;
  return req.nextUrl.searchParams.get("secret") === secret;
}

type Admin = ReturnType<typeof createSupabaseServiceRoleClient>;

/** Every object in a tenant's folder — the Storage list API pages at 100 by default. */
async function listSnapshots(admin: Admin, businessId: string): Promise<string[]> {
  const names: string[] = [];
  const limit = 1000;
  for (let offset = 0; ; offset += limit) {
    const { data, error } = await admin.storage
      .from(SHOW_OPS_BACKUP_BUCKET)
      .list(businessId, { limit, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(error.message);
    const page = (data ?? []).map((o) => o.name);
    names.push(...page);
    if (page.length < limit) return names;
  }
}

/** Delete in batches — one remove() call with a thousand paths is refused. */
async function removeSnapshots(admin: Admin, businessId: string, names: string[]): Promise<number> {
  let removed = 0;
  for (let i = 0; i < names.length; i += 100) {
    const chunk = names.slice(i, i + 100).map((n) => `${businessId}/${n}`);
    const { error } = await admin.storage.from(SHOW_OPS_BACKUP_BUCKET).remove(chunk);
    if (error) throw new Error(error.message);
    removed += chunk.length;
  }
  return removed;
}

/**
 * Rolling mirror of every Show Ops tenant.
 *
 * Writes a complete, gzipped JSON snapshot per workspace into a private Storage
 * bucket, so if the app or the database goes down there is a recent, whole copy
 * of the operation to restore or read from.
 *
 * Cadence lives in vercel.json: every five minutes. It was cut to six-hourly on
 * 2 Sept 2026 because a full read of the tenant 288 times a day was 4 GB/day of
 * egress on a free-tier org shared with Tipsi (5 GB/month allowance). The org
 * moved to Pro on 4 Sept (250 GB/month); with gzip the snapshot is a few MB, so
 * five-minute copies are back. If egress ever climbs again, make it incremental
 * before slowing it down.
 *
 * Then prunes: everything from the last hour stays, one per hour for a day,
 * one per day for a month. Without this the bucket grew 4 GB a day.
 */
export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseServiceRoleClient();
  const exportedAt = new Date().toISOString();

  const { data: businesses, error } = await admin
    .from("businesses")
    .select(
      "id,name,show_ops_enabled,show_ops_config,show_ops_billing_tier,show_ops_display_name,show_ops_custom_domain",
    )
    .eq("show_ops_enabled", true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results: Array<{
    business_id: string;
    name: string;
    ok: boolean;
    path?: string;
    bytes?: number;
    raw_bytes?: number;
    counts?: Record<string, number>;
    pruned?: number;
    prune_error?: string;
    error?: string;
  }> = [];

  for (const business of businesses ?? []) {
    const entry: (typeof results)[number] = { business_id: business.id, name: business.name, ok: false };
    try {
      const backup = await buildShowOpsBackup(admin, business, exportedAt);
      const raw = Buffer.from(JSON.stringify(backup));
      const body = gzipSync(raw);
      const path = backupObjectPath(business.id, exportedAt);
      const { error: upErr } = await admin.storage
        .from(SHOW_OPS_BACKUP_BUCKET)
        .upload(path, body, { contentType: "application/gzip", upsert: true });
      if (upErr) throw new Error(upErr.message);
      Object.assign(entry, { ok: true, path, bytes: body.byteLength, raw_bytes: raw.byteLength, counts: backup.counts });
    } catch (e) {
      // One tenant failing must not stop the rest of the mirror.
      entry.error = e instanceof Error ? e.message : String(e);
    }

    // Prune only after this run's snapshot is safely written.
    if (entry.ok) {
      try {
        const names = await listSnapshots(admin, business.id);
        const stale = snapshotsToPrune(names);
        entry.pruned = stale.length ? await removeSnapshots(admin, business.id, stale) : 0;
      } catch (e) {
        entry.prune_error = e instanceof Error ? e.message : String(e);
      }
    }
    results.push(entry);
  }

  const failed = results.filter((r) => !r.ok).length;
  return NextResponse.json({ exported_at: exportedAt, tenants: results.length, failed, results }, {
    status: failed ? 207 : 200,
  });
}
