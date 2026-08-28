import { NextRequest, NextResponse } from "next/server";

import {
  SHOW_OPS_BACKUP_BUCKET,
  backupObjectPath,
  buildShowOpsBackup,
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

/**
 * Rolling mirror of every Show Ops tenant.
 *
 * Writes a complete JSON snapshot per workspace into a private Storage bucket on
 * a schedule, so if the app or the database goes down there is a recent, whole
 * copy of the operation to restore or read from — not a nightly file that stops
 * at the first thousand bookings.
 *
 * Retention is handled by the bucket; snapshots are named by timestamp so the
 * newest is always last.
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
    counts?: Record<string, number>;
    error?: string;
  }> = [];

  for (const business of businesses ?? []) {
    try {
      const backup = await buildShowOpsBackup(admin, business, exportedAt);
      const body = JSON.stringify(backup);
      const path = backupObjectPath(business.id, exportedAt);
      const { error: upErr } = await admin.storage
        .from(SHOW_OPS_BACKUP_BUCKET)
        .upload(path, body, { contentType: "application/json", upsert: true });
      if (upErr) throw new Error(upErr.message);
      results.push({
        business_id: business.id,
        name: business.name,
        ok: true,
        path,
        bytes: Buffer.byteLength(body),
        counts: backup.counts,
      });
    } catch (e) {
      // One tenant failing must not stop the rest of the mirror.
      results.push({
        business_id: business.id,
        name: business.name,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const failed = results.filter((r) => !r.ok).length;
  return NextResponse.json({ exported_at: exportedAt, tenants: results.length, failed, results }, {
    status: failed ? 207 : 200,
  });
}
