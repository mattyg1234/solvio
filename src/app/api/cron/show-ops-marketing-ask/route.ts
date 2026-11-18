import { NextRequest, NextResponse } from "next/server";

import { runShowOpsMarketingAsk } from "@/lib/show-ops/after-show";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = req.headers.get("authorization") || "";
  if (header === `Bearer ${secret}`) return true;
  return req.nextUrl.searchParams.get("secret") === secret;
}

/** Every hour: guests who booked about 23 hours ago get the marketing-permission WhatsApp (template 5), 09:00–20:59 Canary only. */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const marketing = await runShowOpsMarketingAsk();
  return NextResponse.json({ ok: true, marketing });
}
