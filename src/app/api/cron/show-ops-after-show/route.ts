import { NextRequest, NextResponse } from "next/server";

import { runShowOpsAfterShowFeedback } from "@/lib/show-ops/after-show";

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
 * 19:00 UTC (about 24 hours after the show): last night's guests get the after-show feedback message.
 * The marketing-permission question runs hourly from /api/cron/show-ops-marketing-ask.
 */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const feedback = await runShowOpsAfterShowFeedback();
  return NextResponse.json({ feedback });
}
