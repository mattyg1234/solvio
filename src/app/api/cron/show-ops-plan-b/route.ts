import { NextRequest, NextResponse } from "next/server";

import { runPlanBPacks } from "@/lib/show-ops/plan-b-run";

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
 * Plan B pack, twice a day (see vercel.json): printable night and bus lists
 * plus an upcoming-bookings spreadsheet to each workspace's report addresses,
 * and the newest full snapshot to SHOW_OPS_OFFSITE_BACKUP_EMAILS when set.
 * The point is a copy that lives outside Vercel and Supabase.
 */
export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runPlanBPacks();
  return NextResponse.json(result, { status: result.failed ? 207 : 200 });
}
