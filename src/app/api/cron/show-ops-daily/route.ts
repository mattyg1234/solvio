import { NextRequest, NextResponse } from "next/server";

import { runShowOpsDailyDigests } from "@/lib/show-ops/daily-report";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = req.headers.get("authorization") || "";
  if (header === `Bearer ${secret}`) return true;
  const query = req.nextUrl.searchParams.get("secret");
  return query === secret;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runShowOpsDailyDigests();
  return NextResponse.json(result);
}
