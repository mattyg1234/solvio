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

/** 10:00 Canary time: WhatsApp last night's guests the after-show feedback message. */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await runShowOpsAfterShowFeedback());
}
