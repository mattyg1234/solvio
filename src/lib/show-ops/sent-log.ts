/**
 * The Sent page: everything the Hub sent to people for one workspace, newest
 * first — emails (from show_ops_sent_emails, with Resend's latest delivery
 * event) and WhatsApp/SMS (outgoing messages in the customer inbox).
 *
 * Reads use the service role; the page checks who may see it first.
 */

import { Resend } from "resend";

import { SENT_EMAIL_KIND_LABEL, type SentEmailKind } from "@/lib/show-ops/sent-email-log";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export type SentChannel = "email" | "whatsapp" | "sms";
export type SentFilter = "all" | "email" | "phone" | "problems";
export type SentTone = "ok" | "info" | "warn" | "bad";

export type SentRow = {
  id: string;
  at: string;
  channel: SentChannel;
  to: string;
  toName: string | null;
  what: string;
  detail: string;
  bookingId: string | null;
  bookingRef: string | null;
  status: string;
  tone: SentTone;
  error: string | null;
};

const LIMIT = 200;

type ResendEvent = string;

/** Resend's latest event for each recent email id. Empty when Resend is not configured or unreachable. */
async function resendEvents(): Promise<Map<string, ResendEvent>> {
  const out = new Map<string, ResendEvent>();
  const apiKey =
    process.env.SOLVIO_RESEND_API_KEY?.trim() || process.env.RESEND_API_KEY?.trim() || process.env.RESEND_API_TOKEN?.trim();
  if (!apiKey) return out;
  try {
    const client = new Resend(apiKey);
    let after: string | undefined;
    for (let page = 0; page < 3; page += 1) {
      const { data, error } = await client.emails.list(after ? { limit: 100, after } : { limit: 100 });
      if (error || !data) break;
      for (const e of data.data) out.set(e.id, e.last_event);
      if (!data.has_more || !data.data.length) break;
      after = data.data[data.data.length - 1].id;
    }
  } catch (e) {
    console.error("[sent-log] Resend list failed:", e);
  }
  return out;
}

/** Plain-words status for an email row. */
export function emailStatus(status: string, event: ResendEvent | undefined): { label: string; tone: SentTone } {
  if (status === "held") return { label: "Held (test mode)", tone: "warn" };
  if (status === "failed") return { label: "Not sent", tone: "bad" };
  switch (event) {
    case "delivered":
      return { label: "Delivered", tone: "ok" };
    case "opened":
      return { label: "Opened", tone: "ok" };
    case "clicked":
      return { label: "Opened and clicked", tone: "ok" };
    case "bounced":
      return { label: "Bounced", tone: "bad" };
    case "complained":
      return { label: "Marked as spam", tone: "bad" };
    case "suppressed":
      return { label: "Blocked by Resend", tone: "bad" };
    case "failed":
      return { label: "Failed at Resend", tone: "bad" };
    case "delivery_delayed":
      return { label: "Delayed", tone: "warn" };
    default:
      return { label: "Sent", tone: "info" };
  }
}

/** Plain-words status for a WhatsApp/SMS row. */
export function phoneStatus(status: string): { label: string; tone: SentTone } {
  switch (status) {
    case "read":
      return { label: "Read", tone: "ok" };
    case "delivered":
      return { label: "Delivered", tone: "ok" };
    case "failed":
      return { label: "Not sent", tone: "bad" };
    case "undelivered":
      return { label: "Not delivered", tone: "bad" };
    case "sending":
    case "queued":
      return { label: "Sending", tone: "info" };
    default:
      return { label: "Sent", tone: "info" };
  }
}

function matches(row: SentRow, q: string): boolean {
  if (!q) return true;
  const hay = [row.to, row.toName, row.what, row.detail, row.bookingRef].filter(Boolean).join(" ").toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

export async function loadSentLog(
  businessId: string,
  opts: { filter: SentFilter; q: string },
): Promise<{ rows: SentRow[]; emailLogReady: boolean }> {
  const admin = createSupabaseServiceRoleClient();
  const wantEmail = opts.filter !== "phone";
  const wantPhone = opts.filter !== "email";

  const [emailsRes, messagesRes, events] = await Promise.all([
    wantEmail
      ? admin
          .from("show_ops_sent_emails")
          .select("id,created_at,kind,to_addresses,subject,status,resend_id,error,booking_id")
          .eq("business_id", businessId)
          .order("created_at", { ascending: false })
          .limit(LIMIT)
      : Promise.resolve({ data: [], error: null }),
    wantPhone
      ? admin
          .from("show_ops_inbox_messages")
          .select("id,created_at,body,source,status,error,conversation_id")
          .eq("business_id", businessId)
          .eq("direction", "out")
          .order("created_at", { ascending: false })
          .limit(LIMIT)
      : Promise.resolve({ data: [], error: null }),
    wantEmail ? resendEvents() : Promise.resolve(new Map<string, ResendEvent>()),
  ]);

  // The table arrives with this release's migration; until it exists, show phones only.
  const emailLogReady = !emailsRes.error;
  if (emailsRes.error) console.error("[sent-log] emails:", emailsRes.error.message);
  if (messagesRes.error) console.error("[sent-log] messages:", messagesRes.error.message);

  type EmailRow = {
    id: string;
    created_at: string;
    kind: string;
    to_addresses: string[] | null;
    subject: string;
    status: string;
    resend_id: string | null;
    error: string | null;
    booking_id: string | null;
  };
  type MessageRow = {
    id: string;
    created_at: string;
    body: string;
    source: string;
    status: string;
    error: string | null;
    conversation_id: string;
  };
  const emails = ((emailsRes.error ? [] : emailsRes.data) ?? []) as EmailRow[];
  const messages = ((messagesRes.error ? [] : messagesRes.data) ?? []) as MessageRow[];

  const convIds = [...new Set(messages.map((m) => m.conversation_id))];
  const convs = new Map<string, { channel: string; phone: string; name: string; bookingId: string | null }>();
  if (convIds.length) {
    const { data } = await admin
      .from("show_ops_inbox_conversations")
      .select("id,channel,customer_phone,customer_name,booking_id")
      .eq("business_id", businessId)
      .in("id", convIds);
    for (const c of data ?? []) {
      convs.set(String(c.id), {
        channel: String(c.channel),
        phone: String(c.customer_phone),
        name: String(c.customer_name ?? ""),
        bookingId: c.booking_id ? String(c.booking_id) : null,
      });
    }
  }

  const bookingIds = [
    ...new Set(
      [...emails.map((e) => e.booking_id), ...[...convs.values()].map((c) => c.bookingId)].filter(
        (id): id is string => Boolean(id),
      ),
    ),
  ];
  const refs = new Map<string, { ref: string; guest: string }>();
  for (let i = 0; i < bookingIds.length; i += 150) {
    const { data } = await admin
      .from("show_bookings")
      .select("id,booking_ref,guest_name")
      .eq("business_id", businessId)
      .in("id", bookingIds.slice(i, i + 150));
    for (const b of data ?? []) refs.set(String(b.id), { ref: String(b.booking_ref ?? ""), guest: String(b.guest_name ?? "") });
  }

  const rows: SentRow[] = [];
  for (const e of emails) {
    const s = emailStatus(e.status, e.resend_id ? events.get(e.resend_id) : undefined);
    const booking = e.booking_id ? refs.get(e.booking_id) : undefined;
    rows.push({
      id: `e:${e.id}`,
      at: e.created_at,
      channel: "email",
      to: (e.to_addresses ?? []).join(", ") || "—",
      toName: booking?.guest ?? null,
      what: SENT_EMAIL_KIND_LABEL[e.kind as SentEmailKind] ?? "Email",
      detail: e.subject,
      bookingId: e.booking_id,
      bookingRef: booking?.ref ?? null,
      status: s.label,
      tone: s.tone,
      error: e.status === "sent" ? null : e.error,
    });
  }
  for (const m of messages) {
    const c = convs.get(m.conversation_id);
    const s = phoneStatus(m.status);
    const booking = c?.bookingId ? refs.get(c.bookingId) : undefined;
    rows.push({
      id: `m:${m.id}`,
      at: m.created_at,
      channel: c?.channel === "sms" ? "sms" : "whatsapp",
      to: c?.phone ?? "—",
      toName: c?.name || booking?.guest || null,
      what: m.source === "ticket" ? "Booking ticket" : m.source === "template" ? "Template" : "Inbox reply",
      detail: m.body.replace(/\s+/g, " ").trim().slice(0, 160),
      bookingId: c?.bookingId ?? null,
      bookingRef: booking?.ref ?? null,
      status: s.label,
      tone: s.tone,
      error: m.error,
    });
  }

  rows.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  const q = opts.q.trim();
  const filtered = rows.filter((r) => (opts.filter === "problems" ? r.tone === "bad" || r.tone === "warn" : true) && matches(r, q));
  return { rows: filtered.slice(0, LIMIT), emailLogReady };
}
