import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { ShowOpsContext } from "@/lib/show-ops/access";

import { loadEmailConnection, openMailSource, type EmailBookingConnection } from "./connection";
import { findBookingByReference } from "./data";
import { extractBooking } from "./extract";
import { isRateLimited, MailProviderError, needsReconnect } from "./gmail";
import { describeMailError } from "./gate";
import { channelFor, channelRefFor, normRef, sellerSource } from "./mapping";
import { isFailedPayment, isForward, isNoise, isReply, looksBookingish, senderMatches, sendersFor } from "./sellers";
import { mapLimit } from "./text";
import type { MailMessage } from "./extract";
import type { MailSource } from "./inbox";
import type { EmailRead, EmailReader, SellerFound } from "./types";

/**
 * Email bookings, save first (2 Nov 2026). Two steps, run by Refresh and by the every-5-minutes cron:
 *
 * 1. List: ONE inbox search for every tracked sender since the last check (plus the 30-day look-back
 *    for senders ticked since then). Each message id is saved to show_email_ingest straight away.
 *    The check time only moves on once the whole list is saved, so nothing slips through.
 * 2. Read: a few queued emails at a time are downloaded, read and stored in Email bookings. A read
 *    Gmail refuses stays queued and is retried later (1, 2, 4… minutes, up to an hour), so a slowdown
 *    only delays an email, never loses it.
 *
 * Nothing here ever creates a booking: the office checks each one in To check.
 */

type Admin = ShowOpsContext["supabase"];

export type MailSyncResult = { added: number; stored: number; more: boolean; slowed: boolean };

const FIRST_SYNC_DAYS = 30;
/** Look a little before the last check so nothing slips between runs; message ids stop repeats. */
const OVERLAP_MS = 10 * 60 * 1000;
const MAX_LISTED = 2000;
/** Emails read per run (the page and the cron ask again while more are waiting). */
const READ_BATCH = 30;
const MAX_ATTEMPTS = 10;
const MAX_BODY = 20000;

type QueueRow = { id: number; provider_message_id: string; reread: boolean; attempts: number };
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

export function adminClient(): Admin {
  return createSupabaseServiceRoleClient() as unknown as Admin;
}

/** Which tracked sender an email came from (by exact address or domain). */
function sellerOf(fromEmail: string, tracked: SellerFound[]): SellerFound | undefined {
  return tracked.find((s) => sendersFor(s).some((sender) => senderMatches(fromEmail, sender)));
}

/** Retry in 1, 2, 4, 8… minutes, never more than an hour. */
function retryAt(attempts: number): string {
  const minutes = Math.min(60, 2 ** Math.max(0, attempts - 1));
  return new Date(Date.now() + minutes * 60000).toISOString();
}

function slowDown(e: unknown): boolean {
  return e instanceof MailProviderError && (isRateLimited(e.status, e.message) || e.status === 429 || /RATE_LIMIT|rateLimit|quota/i.test(e.message));
}

/** Step 1: save every new message id from the tracked senders. Moves the check time on only when complete. */
async function listNew(admin: Admin, conn: EmailBookingConnection, mail: MailSource, tracked: SellerFound[]): Promise<number> {
  const startedAt = new Date();
  const lookBack = new Date(Date.now() - FIRST_SYNC_DAYS * 86400000);
  const since = conn.last_sync_at ? new Date(new Date(conn.last_sync_at).getTime() - OVERLAP_MS) : lookBack;
  const known = tracked.filter((s) => s.syncedAt && conn.last_sync_at);
  const fresh = tracked.filter((s) => !(s.syncedAt && conn.last_sync_at));

  const ids = new Set<string>();
  if (known.length) for (const id of await mail.idsFrom(known.flatMap(sendersFor), since, MAX_LISTED)) ids.add(id);
  if (fresh.length) for (const id of await mail.idsFrom(fresh.flatMap(sendersFor), lookBack, MAX_LISTED)) ids.add(id);

  // Already in Email bookings: nothing to queue.
  const all = [...ids];
  for (let i = 0; i < all.length; i += 200) {
    const { data, error } = await admin
      .from("show_email_bookings")
      .select("provider_message_id")
      .eq("business_id", conn.business_id)
      .eq("provider", conn.provider)
      .in("provider_message_id", all.slice(i, i + 200));
    if (error) throw new Error(`stored emails not checked: ${error.message}`);
    for (const r of data ?? []) ids.delete(String(r.provider_message_id));
  }
  const queue = [...ids].map((id) => ({ business_id: conn.business_id, connection_id: conn.id, provider: conn.provider, provider_message_id: id }));
  for (let i = 0; i < queue.length; i += 500) {
    const { error } = await admin
      .from("show_email_ingest")
      .upsert(queue.slice(i, i + 500), { onConflict: "business_id,provider,provider_message_id", ignoreDuplicates: true });
    if (error) throw new Error(`emails not queued: ${error.message}`);
  }

  // Everything is saved: the next run only needs what arrives after this one started.
  const latest = await loadEmailConnection(admin, conn.business_id);
  const done = new Set(tracked.map((s) => s.key));
  const sellers = (latest?.sellers ?? conn.sellers).map((s) => (done.has(s.key) && s.track ? { ...s, syncedAt: startedAt.toISOString() } : s));
  await admin
    .from("show_email_booking_connections")
    .update({ sellers, last_sync_at: startedAt.toISOString(), updated_at: new Date().toISOString() })
    .eq("id", conn.id)
    .eq("business_id", conn.business_id);
  return queue.length;
}

/** How one email is filed: set aside with a reason, or read into To check. */
async function readOne(m: MailMessage, conn: EmailBookingConnection, tracked: SellerFound[]): Promise<Row> {
  const seller = sellerOf(m.fromEmail, tracked);
  const sellerKey = seller?.key ?? `custom:${m.fromEmail.toLowerCase()}`;
  const sellerName = seller?.name ?? (m.fromName || m.fromEmail);
  const own = conn.address.trim().toLowerCase();
  const base = {
    business_id: conn.business_id,
    connection_id: conn.id,
    provider: conn.provider,
    provider_message_id: m.providerId,
    from_name: (m.fromName || sellerName).slice(0, 200),
    from_email: m.fromEmail.slice(0, 320),
    subject: m.subject.slice(0, 500),
    received_at: m.date,
    body: m.text.slice(0, MAX_BODY),
    seller_key: sellerKey,
    seller_name: sellerName,
    booking_id: null,
  };
  const aside = (note: string): Row => ({ ...base, kind: "not-booking", extracted: { partner: sellerName }, reference: null, confidence: 0, reader: null, status: "ignored", system_note: note });

  if (isReply(m.subject)) return { ...aside("A reply in an email conversation, not a new booking."), body: "" };
  if (isForward(m.subject) && m.fromEmail.trim().toLowerCase() === own) return { ...aside("Forwarded from this inbox, not a new booking."), body: "" };
  if (isNoise(m.subject)) return aside("A code, report or notice, not a booking. Move it to To check if it is one.");

  const r = await extractBooking(m, sellerName);
  // Mail sent from this inbox itself (the office's own confirmations to guests) is only kept when
  // an exact reader knows it (the website's "New order" emails).
  if (m.fromEmail.trim().toLowerCase() === own && r.reader !== "template") return aside("Sent from this inbox, not a new booking.");
  // The pattern reader calls anything with a "?" in it a question; that's not worth a look on its own.
  if (r.kind === "not-booking" || (r.kind === "question" && r.reader === "pattern")) {
    // From a sender the office tracks and the subject sounds like a booking: let the office decide.
    if (looksBookingish(m.subject)) {
      return {
        ...base,
        kind: "new",
        extracted: { ...r.extracted, partner: r.extracted.partner ?? sellerName },
        reference: normRef(r.extracted.reference) || null,
        confidence: Math.min(r.confidence, 0.3),
        reader: r.reader,
        status: "review",
        system_note: "The Hub couldn't read this layout. Check the email and fill in the details.",
      };
    }
    return aside("No booking details found. Move it to To check if it is one.");
  }
  return {
    ...base,
    kind: r.kind,
    extracted: r.extracted,
    reference: normRef(r.extracted.reference) || null,
    confidence: r.confidence,
    reader: r.reader,
    status: "review",
    system_note: null,
  };
}

/** Same booking already in the Hub, a second copy of one email booking, or a failed card payment. */
async function markDuplicates(admin: Admin, businessId: string, rows: Row[]): Promise<void> {
  const seenRefs = new Set<string>();
  for (const row of rows.sort((a, b) => a.received_at.localeCompare(b.received_at))) {
    if (row.status !== "review" || !row.reference) continue;
    const source = sellerSource(row.seller_key, row.extracted);
    const channel = channelFor(source, row.seller_key);
    if (row.kind === "cancel" && isFailedPayment(row.subject)) {
      if (!(await findBookingByReference(admin, businessId, channel, channelRefFor(row.extracted)))) {
        row.status = "ignored";
        row.system_note = "Payment failed, so no booking was made. Nothing to do.";
      }
      continue;
    }
    if (row.kind !== "new") continue;
    const existing = await findBookingByReference(admin, businessId, channel, channelRefFor(row.extracted));
    if (existing) {
      row.status = "ignored";
      row.booking_id = existing.id;
      row.system_note = `Already in bookings as ${existing.booking_ref} (${existing.how === "channel" ? "same reference" : "same ticket number"}), so it wasn't added again.`;
      continue;
    }
    const earlier =
      seenRefs.has(row.reference) ||
      Boolean(
        (
          await admin
            .from("show_email_bookings")
            .select("id")
            .eq("business_id", businessId)
            .eq("reference", row.reference)
            .eq("kind", "new")
            .neq("status", "ignored")
            .neq("provider_message_id", row.provider_message_id)
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
}

/** Step 2: read a batch of queued emails into Email bookings. */
async function readQueued(admin: Admin, conn: EmailBookingConnection, mail: MailSource, tracked: SellerFound[]) {
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("show_email_ingest")
    .select("id,provider_message_id,reread,attempts")
    .eq("business_id", conn.business_id)
    .eq("provider", conn.provider)
    .eq("state", "pending")
    .lte("next_attempt_at", now)
    .order("created_at", { ascending: true })
    .limit(READ_BATCH);
  if (error) throw new Error(`queue not read: ${error.message}`);
  const batch = (data ?? []) as QueueRow[];

  let slowed = false;
  const failures: { q: QueueRow; why: string }[] = [];
  const read = await mapLimit(batch, 2, async (q): Promise<{ q: QueueRow; row: Row } | null> => {
    if (slowed) return null; // Gmail said slow down: leave the rest queued for the next run.
    try {
      return { q, row: await readOne(await mail.message(q.provider_message_id), conn, tracked) };
    } catch (e) {
      if (needsReconnect(e)) throw e;
      if (slowDown(e)) slowed = true;
      failures.push({ q, why: describeMailError(e).slice(0, 500) });
      return null;
    }
  });
  const ok = read.filter((x): x is { q: QueueRow; row: Row } => x !== null);
  await markDuplicates(admin, conn.business_id, ok.map((x) => x.row));

  let added = 0;
  const fresh = ok.filter((x) => !x.q.reread).map((x) => x.row);
  if (fresh.length) {
    const { data: saved, error: saveError } = await admin
      .from("show_email_bookings")
      .upsert(fresh, { onConflict: "business_id,provider,provider_message_id", ignoreDuplicates: true })
      .select("id,status");
    if (saveError) throw new Error(`emails not saved: ${saveError.message}`);
    added += (saved ?? []).filter((r) => r.status === "review").length;
  }
  // Re-reads replace an email that was filed wrongly, unless someone has dealt with it since.
  for (const { row } of ok.filter((x) => x.q.reread)) {
    const { data: updated } = await admin
      .from("show_email_bookings")
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq("business_id", conn.business_id)
      .eq("provider", conn.provider)
      .eq("provider_message_id", row.provider_message_id)
      .in("status", ["ignored", "review"])
      .is("handled_by", null)
      .select("status");
    added += (updated ?? []).filter((r) => r.status === "review").length;
  }

  const doneIds = ok.map((x) => x.q.id);
  if (doneIds.length) {
    await admin.from("show_email_ingest").update({ state: "done", processed_at: new Date().toISOString(), last_error: null }).in("id", doneIds);
  }
  for (const { q, why } of failures) {
    const attempts = q.attempts + 1;
    await admin
      .from("show_email_ingest")
      .update({ attempts, last_error: why, state: attempts >= MAX_ATTEMPTS ? "failed" : "pending", next_attempt_at: retryAt(attempts) })
      .eq("id", q.id);
    console.error(`[show-ops/mail/sync] email ${q.provider_message_id} not read (try ${attempts}): ${why}`);
  }
  return { added, stored: ok.length, slowed: slowed || failures.length > 0 };
}

/**
 * One round for one business: list (unless `listFirst` is false), then read one batch. Null when no
 * inbox is connected. Uses the service role: callers check who is asking first.
 */
export async function syncMailInbox(businessId: string, opts: { listFirst?: boolean } = {}): Promise<MailSyncResult | null> {
  const admin = adminClient();
  const conn = await loadEmailConnection(admin, businessId);
  if (!conn) return null;
  const tracked = conn.sellers.filter((s) => s.track);
  if (tracked.length === 0) return { added: 0, stored: 0, more: false, slowed: false };
  const mail = await openMailSource(conn);

  let listSlowed = false;
  if (opts.listFirst !== false) {
    try {
      await listNew(admin, conn, mail, tracked);
    } catch (e) {
      if (needsReconnect(e)) throw e;
      // The check time didn't move, so the next run lists this window again. Carry on reading.
      listSlowed = true;
      console.error(`[show-ops/mail/sync] listing failed, will retry: ${describeMailError(e)}`);
    }
  }
  const r = await readQueued(admin, conn, mail, tracked);
  const { count } = await admin
    .from("show_email_ingest")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("state", "pending")
    .lte("next_attempt_at", new Date().toISOString());
  return { added: r.added, stored: r.stored, more: (count ?? 0) > 0, slowed: r.slowed || listSlowed };
}
