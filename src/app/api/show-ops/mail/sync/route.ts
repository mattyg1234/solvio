import { NextResponse } from "next/server";

import { mailErrorAnswer, mailGate } from "@/lib/show-ops/email-bookings/gate";
import { syncMailInbox } from "@/lib/show-ops/email-bookings/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Refresh on Email bookings: one batch of new emails (the page keeps asking while more wait). */
export async function POST() {
  const gate = await mailGate("booker");
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { ctx } = gate;
  try {
    const result = await syncMailInbox(ctx.supabase, ctx.business.id);
    if (!result) return NextResponse.json({ error: "Connect the bookings inbox first." }, { status: 404 });
    return NextResponse.json(result);
  } catch (e) {
    const a = mailErrorAnswer("show-ops/mail/sync", e);
    return NextResponse.json({ error: a.error, reconnect: a.reconnect }, { status: a.status });
  }
}
