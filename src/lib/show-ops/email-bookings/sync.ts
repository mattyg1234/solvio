import type { ShowOpsContext } from "@/lib/show-ops/access";

import { loadEmailConnection, openMailSource } from "./connection";
import { findBookingByReference } from "./data";
import { extractBooking } from "./extract";
import { needsReconnect } from "./gmail";
import { describeMailError } from "./gate";
import { channelFor, channelRefFor, normRef, sellerSource } from "./mapping";
import { isFailedPayment, isForward, isReply, looksLikeSupplierBooking, sendersFor } from "./sellers";
import { readKnownTemplate } from "./templates";
import { mapLimit } from "./text";
import type { MailMessage } from "./extract";
import type { EmailRead, EmailReader } from "./types";

type Supabase = ShowOpsContext["supabase"];

export type MailSyncResult = { added: number; stored: number; more: boolean; slowed: boolean };

const FIRST_SYNC_DAYS = 30;
/** Emails read per run. Most are quick to set aside (receipts, replies), and each is read only once. */
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
  reader: EmailReader | null;
  status: "review" | "ignored";
  booking_id: string | null;
  system_note: string | null;
};

/**
 * Brings new emails from the tracked senders into Email bookings, as a review queue. Nothing is
 * ever turned into a booking here: a booking already in the Hub with the same reference is marked
 * as a duplicate, everything else waits for the office to check. Run by Refresh (as the signed-in
 * office user) and by the every-10-minutes cron (service role). Null when no inbox is connected.
 */
export async function syncMailInbox(supabase: Supabase, businessId: string): Promise<MailSyncResult | null> {
  const conn = await loadEmailConnection(supabase, businessId);
  if (!conn) return null;
  const tracked = conn.sellers.filter((s) => s.track);
  if (tracked.length === 0) return { added: 0, stored: 0, more: false, slowed: false };

  const startedAt = new Date();
  const lookBack = new Date(Date.now() - FIRST_SYNC_DAYS * 86400000);
  const since = conn.last_sync_at ? new Date(new Date(conn.last_sync_at).getTime() - OVERLAP_MS) : lookBack;
  const mail = await openMailSource(conn);

  // Every new email from each tracked sender, once. One sender Gmail won't list right now
  // doesn't stop the rest: that sender goes back to its full look-back so the next run tries again.
  const candidates = new Map<string, Candidate>();
  const unfinished = new Set<string>();
  let failed = 0;
  let listError: unknown = null;
  const listed = await mapLimit(tracked, 3, async (seller) => {
    // A sender ticked since the last check hasn't had its past emails read yet.
    const from = seller.syncedAt ? since : lookBack;
    try {
      return await mail.idsFrom(sendersFor(seller), from, PER_SELLER);
    } catch (e) {
      if (needsReconnect(e)) throw e;
      failed++;
      unfinished.add(seller.key);
      listError = e;
      console.error(`[show-ops/mail/sync] skipped sender ${seller.key}: ${describeMailError(e)}`);
      return [];
    }
  });
  tracked.forEach((seller, i) => {
    for (const id of listed[i]) {
      if (!candidates.has(id)) candidates.set(id, { id, sellerKey: seller.key, sellerName: seller.name, custom: Boolean(seller.custom) });
    }
  });
  // Nothing could be listed at all: say why rather than "up to date".
  if (failed === tracked.length && listError) throw listError;
  // Drop the ones already stored.
  const allIds = [...candidates.keys()];
  for (let i = 0; i < allIds.length; i += 100) {
    const { data } = await supabase
      .from("show_email_bookings")
      .select("provider_message_id")
      .eq("business_id", businessId)
      .eq("provider", conn.provider)
      .in("provider_message_id", allIds.slice(i, i + 100));
    for (const r of data ?? []) candidates.delete(String(r.provider_message_id));
  }

  const aiReads = Boolean(process.env.ANTHROPIC_API_KEY);
  const ownAddress = conn.address.trim().toLowerCase();
  const batch = [...candidates.values()].slice(0, MAX_PER_RUN);
  const more = candidates.size > batch.length;

  /** Why an email isn't read as a booking at all, or null when it might be one. */
  function setAside(m: MailMessage, item: Candidate): string | null {
    if (isReply(m.subject)) return "A reply in an email conversation, not a new booking.";
    if (isForward(m.subject) && m.fromEmail.trim().toLowerCase() === ownAddress) return "Forwarded from this inbox, not a new booking.";
    // Adverts from the same company are dropped before the AI reads anything. A sender the
    // office added is its own channel (the website shop, say), so an email from it also goes
    // through when an exact reader knows the layout or the AI is there to judge it.
    const passes = looksLikeSupplierBooking(m.subject) || (item.custom && (aiReads || readKnownTemplate(m.fromEmail, m.subject, m.text) !== null));
    return passes ? null : "Doesn't look like a booking, so nothing from it was kept.";
  }

  const read = await mapLimit(batch, 3, async (item): Promise<Row | null> => {
    try {
      const m = await mail.message(item.id);
      // Emails set aside are still saved (subject only), so they're never read again.
      const aside = setAside(m, item);
      const r = aside ? null : await extractBooking(m, item.sellerName);
      const booking = r !== null && r.kind !== "not-booking";
      return {
        business_id: businessId,
        connection_id: conn.id,
        provider: conn.provider,
        provider_message_id: m.providerId,
        from_name: (m.fromName || item.sellerName).slice(0, 200),
        from_email: m.fromEmail.slice(0, 320),
        subject: m.subject.slice(0, 500),
        received_at: m.date,
        // Emails that aren't bookings keep only their subject.
        body: booking ? m.text.slice(0, MAX_BODY) : "",
        seller_key: item.sellerKey,
        seller_name: item.sellerName,
        kind: r?.kind ?? "not-booking",
        extracted: booking ? r.extracted : { partner: item.sellerName },
        reference: booking ? normRef(r.extracted.reference) || null : null,
        confidence: r?.confidence ?? 0,
        reader: r?.reader ?? null,
        status: booking ? "review" : "ignored",
        booking_id: null,
        system_note: booking ? null : (aside ?? "Not a booking, so nothing from it was kept."),
      };
    } catch (e) {
      failed++;
      unfinished.add(item.sellerKey);
      console.error(`[show-ops/mail/sync] skipped one message: ${describeMailError(e)}`);
      return null;
    }
  });
  const rows = read.filter((r): r is Row => r !== null).sort((a, b) => a.received_at.localeCompare(b.received_at));

  // Duplicates: the same booking already in the Hub, or a second copy of the same email booking.
  const seenRefs = new Set<string>();
  for (const row of rows) {
    // The website's "Order … has failed": the card payment didn't go through, so there's no
    // booking to cancel. Set aside unless a booking with that reference is somehow in the Hub.
    if (row.kind === "cancel" && row.reference && isFailedPayment(row.subject)) {
      const source = sellerSource(row.seller_key, row.extracted);
      const existing = await findBookingByReference(supabase, businessId, channelFor(source, row.seller_key), channelRefFor(row.extracted));
      if (!existing) {
        row.status = "ignored";
        row.system_note = "Payment failed, so no booking was made. Nothing to do.";
      }
      continue;
    }
    if (row.kind !== "new" || !row.reference) continue;
    const source = sellerSource(row.seller_key, row.extracted);
    const existing = await findBookingByReference(supabase, businessId, channelFor(source, row.seller_key), channelRefFor(row.extracted));
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
            await supabase
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
    const { data, error } = await supabase
      .from("show_email_bookings")
      .upsert(rows, { onConflict: "business_id,provider,provider_message_id", ignoreDuplicates: true })
      .select("id,status");
    if (error) throw new Error(`emails not saved: ${error.message}`);
    added = (data ?? []).filter((r) => r.status === "review").length;
  }

  // With more waiting, keep the old position so the next run picks up the rest. Otherwise move on;
  // a sender that failed this time loses its mark, so the next run reads its full look-back again
  // (message ids stop repeats), and one stubborn sender never holds the rest back.
  if (!more) {
    const fresh = await loadEmailConnection(supabase, businessId);
    const done = new Set(tracked.map((s) => s.key));
    const sellers = (fresh?.sellers ?? conn.sellers).map((s) => {
      if (!done.has(s.key) || !s.track) return s;
      if (unfinished.has(s.key)) return { ...s, syncedAt: undefined };
      return { ...s, syncedAt: startedAt.toISOString() };
    });
    await supabase
      .from("show_email_booking_connections")
      .update({ sellers, last_sync_at: startedAt.toISOString(), updated_at: new Date().toISOString() })
      .eq("id", conn.id)
      .eq("business_id", businessId);
  }
  // `slowed`: Gmail asked to slow down (or a read failed), so the next run tries those again.
  return { added, stored: rows.length, more: more || failed > 0, slowed: failed > 0 };
}
