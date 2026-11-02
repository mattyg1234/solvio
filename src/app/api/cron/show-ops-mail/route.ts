import { NextRequest, NextResponse } from "next/server";

import { describeMailError } from "@/lib/show-ops/email-bookings/gate";
import { adminClient, syncMailInbox } from "@/lib/show-ops/email-bookings/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Stop starting new batches after this, so a batch never runs into the 60s limit. */
const BUDGET_MS = 35_000;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = req.headers.get("authorization") || "";
  if (header === `Bearer ${secret}`) return true;
  return req.nextUrl.searchParams.get("secret") === secret;
}

/**
 * Every 5 minutes: lists new emails from the tracked senders into the queue (one search per
 * inbox), then reads queued emails into Email bookings until the queue is empty or time runs out.
 */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const started = Date.now();
  const { data, error } = await adminClient().from("show_email_booking_connections").select("business_id");
  if (error) return NextResponse.json({ error: "Could not list inboxes." }, { status: 500 });

  const results: { businessId: string; added: number; rounds: number; more: boolean; slowed: boolean; error?: string }[] = [];
  for (const { business_id } of data ?? []) {
    const r = { businessId: String(business_id), added: 0, rounds: 0, more: false, slowed: false } as (typeof results)[number];
    try {
      do {
        const out = await syncMailInbox(r.businessId, { listFirst: r.rounds === 0 });
        r.rounds++;
        if (!out) break;
        r.added += out.added;
        r.more = out.more;
        r.slowed = out.slowed;
      } while (r.more && !r.slowed && Date.now() - started < BUDGET_MS);
    } catch (e) {
      r.error = describeMailError(e);
      console.error(`[cron/show-ops-mail] ${r.businessId}: ${r.error}`);
    }
    results.push(r);
  }
  return NextResponse.json({ ok: true, results });
}
