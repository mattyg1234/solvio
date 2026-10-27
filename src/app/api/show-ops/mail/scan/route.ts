import { NextResponse } from "next/server";

import { loadEmailConnection, openMailSource } from "@/lib/show-ops/email-bookings/connection";
import { mailErrorAnswer, mailGate } from "@/lib/show-ops/email-bookings/gate";
import { customSenderKey, SELLERS } from "@/lib/show-ops/email-bookings/sellers";
import { mapLimit } from "@/lib/show-ops/email-bookings/text";
import type { SellerFound } from "@/lib/show-ops/email-bookings/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DAYS = 90;
const CAP = 200;
/** How many booking-looking emails to sort through when suggesting senders the Hub doesn't know. */
const SUGGEST_CAP = 150;
const MAX_SUGGESTIONS = 6;

/**
 * Looks through the last 90 days of the bookings inbox for known booking partners, re-counts the
 * senders the office added itself, and suggests other senders whose emails look like bookings.
 * Ticks are kept; only counts and suggestions change.
 */
export async function POST() {
  const gate = await mailGate("booker");
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { ctx } = gate;
  try {
    const conn = await loadEmailConnection(ctx.supabase, ctx.business.id);
    if (!conn) return NextResponse.json({ error: "Connect the bookings inbox first." }, { status: 404 });
    const mail = await openMailSource(conn);

    // Senders the office added or ticked; untouched suggestions are found afresh below.
    const custom = conn.sellers.filter((s) => s.custom && (!s.suggested || s.track));
    const skip = [...SELLERS.flatMap((s) => s.domains), ...custom.map((s) => s.domain)];
    const [counts, customCounts, suggestions, total] = await Promise.all([
      mapLimit(SELLERS, 3, async (s) => ({ seller: s, ...(await mail.countFrom(s.domains, DAYS, CAP)) })),
      mapLimit(custom, 3, async (s) => ({ seller: s, ...(await mail.countFrom([s.domain], DAYS, CAP)) })),
      mail.bookingLikeSenders(conn.address, DAYS, skip, SUGGEST_CAP).catch(() => []),
      mail.inboxTotal(DAYS),
    ]);

    const previous = new Map(conn.sellers.map((s) => [s.key, s]));
    const seen = new Set<string>();
    const sellers: SellerFound[] = [];
    for (const { seller, found, lastSeen, examples, other } of counts) {
      const before = previous.get(seller.key);
      // Only partners that actually sent bookings are offered; adverts alone don't count.
      if (found === 0 && !before) continue;
      seen.add(seller.key);
      sellers.push({
        key: seller.key,
        name: seller.name,
        domain: seller.domains[0],
        found,
        lastSeen: lastSeen ?? before?.lastSeen ?? new Date(Date.now() - DAYS * 86400000).toISOString(),
        // Phone-first partners (TUI, Jet2) start unticked: their emails only ever get matched.
        track: before ? before.track : !seller.matchOnly,
        syncedAt: before?.syncedAt,
        examples,
        other,
      });
    }
    for (const { seller, found, lastSeen, examples, other } of customCounts) {
      seen.add(seller.key);
      sellers.push({ ...seller, found, lastSeen: lastSeen ?? seller.lastSeen, examples: examples.length ? examples : seller.examples, other, suggested: undefined });
    }
    // Senders chosen earlier that are no longer in the catalog stay, so a choice is never lost.
    // Suggestions nobody ticked are dropped here and only come back if the scan finds them again.
    for (const s of conn.sellers) if (!seen.has(s.key) && !(s.suggested && !s.track)) sellers.push({ ...s, found: 0 });
    sellers.sort((a, b) => b.found - a.found);
    for (const s of suggestions.slice(0, MAX_SUGGESTIONS)) {
      const key = customSenderKey(s.sender);
      if (seen.has(key)) continue;
      sellers.push({ key, name: s.name.slice(0, 60), domain: s.sender, found: s.found, lastSeen: s.lastSeen ?? new Date().toISOString(), track: false, examples: s.examples, custom: true, suggested: true });
    }

    const bookingCount = sellers.reduce((n, s) => n + (s.suggested ? 0 : s.found), 0);
    const skipped = Math.max(0, total - bookingCount);
    const { error } = await ctx.supabase
      .from("show_email_booking_connections")
      .update({ sellers, skipped, last_scan_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", conn.id)
      .eq("business_id", ctx.business.id);
    if (error) throw new Error(`senders not saved: ${error.message}`);
    return NextResponse.json({ sellers, skipped });
  } catch (e) {
    const a = mailErrorAnswer("show-ops/mail/scan", e);
    return NextResponse.json({ error: a.error, reconnect: a.reconnect }, { status: a.status });
  }
}
