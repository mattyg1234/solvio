import { NextRequest, NextResponse } from "next/server";

import type { ShowOpsContext } from "@/lib/show-ops/access";
import { describeMailError } from "@/lib/show-ops/email-bookings/gate";
import { syncMailInbox } from "@/lib/show-ops/email-bookings/sync";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

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
 * Every 10 minutes: checks each connected bookings inbox for new emails, so Email bookings fills
 * up without anyone pressing Refresh. Same work as Refresh; nothing becomes a booking here.
 */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const started = Date.now();
  const admin = createSupabaseServiceRoleClient();
  const supabase = admin as unknown as ShowOpsContext["supabase"];
  const { data, error } = await admin.from("show_email_booking_connections").select("business_id");
  if (error) return NextResponse.json({ error: "Could not list inboxes." }, { status: 500 });

  const results: { businessId: string; added: number; rounds: number; more: boolean; error?: string }[] = [];
  for (const { business_id: businessId } of data ?? []) {
    const r = { businessId: String(businessId), added: 0, rounds: 0, more: false } as (typeof results)[number];
    try {
      do {
        const out = await syncMailInbox(supabase, r.businessId);
        r.rounds++;
        if (!out) break;
        r.added += out.added;
        r.more = out.more;
      } while (r.more && Date.now() - started < BUDGET_MS);
    } catch (e) {
      r.error = describeMailError(e);
      console.error(`[cron/show-ops-mail] ${r.businessId}: ${r.error}`);
    }
    results.push(r);
  }
  return NextResponse.json({ ok: true, results });
}
