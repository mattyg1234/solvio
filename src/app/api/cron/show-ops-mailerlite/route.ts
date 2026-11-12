import { NextRequest, NextResponse } from "next/server";

import { runMailerLiteSync } from "@/lib/show-ops/mailerlite";

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

/** Every hour: guests who said YES to MHT updates go to MailerLite; STOP repliers come back out. */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const results = await runMailerLiteSync();
  return NextResponse.json({ ok: true, results });
}
