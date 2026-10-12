import { NextResponse } from "next/server";

import { getEmailAccessToken, loadEmailConnection } from "@/lib/show-ops/email-bookings/connection";
import { findBookingByReference } from "@/lib/show-ops/email-bookings/data";
import { extractBooking } from "@/lib/show-ops/email-bookings/extract";
import { describeMailError, mailErrorAnswer, mailGate } from "@/lib/show-ops/email-bookings/gate";
import { gmailMessage } from "@/lib/show-ops/email-bookings/gmail";
import { idsFrom } from "@/lib/show-ops/email-bookings/inbox";
import { channelFor, channelRefFor, normRef, sellerSource } from "@/lib/show-ops/email-bookings/mapping";
import { looksLikeSupplierBooking, sendersFor } from "@/lib/show-ops/email-bookings/sellers";
import { readKnownTemplate } from "@/lib/show-ops/email-bookings/templates";
import { mapLimit } from "@/lib/show-ops/email-bookings/text";
import type { EmailRead, EmailReader } from "@/lib/show-ops/email-bookings/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const FIRST_SYNC_DAYS = 30;
const MAX_PER_RUN = 50;
const PER_SELLER = 100;
/** Look a little before the last sync so nothing slips between runs; message ids stop repeats. */
const OVERLAP_MS = 10 * 60 * 1000;
const MAX_BODY = 20000;

type Candidate = { id: string; sellerKey: string; sellerName: string; custom: boolean };
type Row = {
  business_id: string;
  connection_id: string;
  provider: string;
  provider_message_id: string;
  from_name: string;
  from_email: string;
  subject: string;
  received_at: string;
  body: string;
  seller_key: string;
  seller_name: string;
  kind: EmailRead["kind"];
  extracted: EmailRead["extracted"];
  reference: string | null;
  confidence: number;
  reader: EmailReader;
  status: "review" | "ignored";
  booking_id: string | null;
  system_note: string | null;
};

/**
 * Brings new emails from the tracked senders into Email bookings, as a review queue. Nothing is
 * ever turned into a booking here: a booking already in the Hub with the same reference is marked
 * as a duplicate, everything else waits for the office to check.
 */
export async function POST() {
  const gate = await mailGate("booker");
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { ctx } = gate;
  const businessId = ctx.business.id;

  try {
    const conn = await loadEmailConnection(ctx.supabase, businessId);
    if (!conn) return NextResponse.json({ error: "Connect the bookings inbox first." }, { status: 404 });
    const tracked = conn.sellers.filter((s) => s.track);
    if (tracked.length === 0) return NextResponse.json({ added: 0, more: false });

    const startedAt = new Date();
    const lookBack = new Date(Date.now() - FIRST_SYNC_DAYS * 86400000);
    const since = conn.last_sync_at ? new Date(new Date(conn.last_sync_at).getTime() - OVERLAP_MS) : lookBack;
    const token = await getEmailAccessToken(conn);

    // Every new email from each tracked sender, once.
    const candidates = new Map<string, Candidate>();
    for (const seller of tracked) {
      // A sender ticked since the last check hasn't had its past emails read yet.
      const from = seller.syncedAt ? since : lookBack;
      for (const id of await idsFrom(token, sendersFor(seller), from, PER_SELLER)) {
        if (!candidates.has(id)) candidates.set(id, { id, sellerKey: seller.key, sellerName: seller.name, custom: Boolean(seller.custom) });
      }
    }
    // Drop the ones already stored.
    const allIds = [...candidates.keys()];
    for (let i = 0; i < allIds.length; i += 100) {
      const { data } = await ctx.supabase
        .from("show_email_bookings")
        .select("provider_message_id")
        .eq("business_id", businessId)
        .eq("provider", "gmail")
        .in("provider_message_id", allIds.slice(i, i + 100));
      for (const r of data ?? []) candidates.delete(String(r.provider_message_id));
    }

    const aiReads = Boolean(process.env.ANTHROPIC_API_KEY);
    const batch = [...candidates.values()].slice(0, MAX_PER_RUN);
    const more = candidates.size > batch.length;
    let failed = 0;

    const read = await mapLimit(batch, 5, async (item): Promise<Row | null> => {
      try {
        const m = await gmailMessage(token, item.id);
        // Adverts from the same company are dropped before the AI reads anything. A sender the
        // office added is its own channel (the website shop, say), so an email from it also goes
        // through when an exact reader knows the layout or the AI is there to judge it.
        const passes = looksLikeSupplierBooking(m.subject) || (item.custom && (aiReads || readKnownTemplate(m.fromEmail, m.subject, m.text) !== null));
        if (!passes) return null;
        const r = await extractBooking(m, item.sellerName);
        const booking = r.kind !== "not-booking";
        return {
          business_id: businessId,
          connection_id: conn.id,
          provider: "gmail",
          provider_message_id: m.providerId,
          from_name: (m.fromName || item.sellerName).slice(0, 200),
          from_email: m.fromEmail.slice(0, 320),
          subject: m.subject.slice(0, 500),
          received_at: m.date,
          // Emails that aren't bookings keep only their subject.
          body: booking ? m.text.slice(0, MAX_BODY) : "",
          seller_key: item.sellerKey,
          seller_name: item.sellerName,
          kind: r.kind,
          extracted: booking ? r.extracted : { partner: item.sellerName },
          reference: booking ? normRef(r.extracted.reference) || null : null,
          confidence: r.confidence,
          reader: r.reader,
          status: booking ? "review" : "ignored",
          booking_id: null,
          system_note: booking ? null : "Not a booking, so nothing from it was kept.",
        };
      } catch (e) {
        failed++;
        console.error(`[show-ops/mail/sync] skipped one message: ${describeMailError(e)}`);
        return null;
      }
    });
    const rows = read.filter((r): r is Row => r !== null).sort((a, b) => a.received_at.localeCompare(b.received_at));

    // Duplicates: the same booking already in the Hub, or a second copy of the same email booking.
    const seenRefs = new Set<string>();
    for (const row of rows) {
      if (row.kind !== "new" || !row.reference) continue;
      const source = sellerSource(row.seller_key, row.extracted);
      const existing = await findBookingByReference(ctx.supabase, businessId, channelFor(source, row.seller_key), channelRefFor(row.extracted));
      if (existing) {
        row.status = "ignored";
        row.booking_id = existing.id;
        row.system_note = `Already in bookings as ${existing.booking_ref} (${existing.how === "channel" ? "same reference" : "same ticket number"}), so it wasn't added again.`;
        continue;
      }
      const earlier = seenRefs.has(row.reference)
        ? true
        : Boolean(
            (
              await ctx.supabase
                .from("show_email_bookings")
                .select("id")
                .eq("business_id", businessId)
                .eq("reference", row.reference)
                .eq("kind", "new")
                .neq("status", "ignored")
                .limit(1)
                .maybeSingle()
            ).data,
          );
      if (earlier) {
        row.status = "ignored";
        row.system_note = `Duplicate: the same booking ${row.extracted.reference} arrived twice. Only one is kept.`;
      }
      seenRefs.add(row.reference);
    }

    let added = 0;
    if (rows.length) {
      const { data, error } = await ctx.supabase
        .from("show_email_bookings")
        .upsert(rows, { onConflict: "business_id,provider,provider_message_id", ignoreDuplicates: true })
        .select("id,status");
      if (error) throw new Error(`emails not saved: ${error.message}`);
      added = (data ?? []).filter((r) => r.status === "review").length;
    }

    // With more waiting (or a read that failed), keep the old position so the next run picks up the rest.
    if (!more && failed === 0) {
      const fresh = await loadEmailConnection(ctx.supabase, businessId);
      const done = new Set(tracked.map((s) => s.key));
      const sellers = (fresh?.sellers ?? conn.sellers).map((s) => (done.has(s.key) && s.track ? { ...s, syncedAt: startedAt.toISOString() } : s));
      await ctx.supabase
        .from("show_email_booking_connections")
        .update({ sellers, last_sync_at: startedAt.toISOString(), updated_at: new Date().toISOString() })
        .eq("id", conn.id)
        .eq("business_id", businessId);
    }
    return NextResponse.json({ added, stored: rows.length, more: more || failed > 0 });
  } catch (e) {
    const a = mailErrorAnswer("show-ops/mail/sync", e);
    return NextResponse.json({ error: a.error, reconnect: a.reconnect }, { status: a.status });
  }
}
