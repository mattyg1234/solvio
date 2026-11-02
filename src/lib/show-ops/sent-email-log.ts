/**
 * Sent emails log: one row per email the Hub tries to send for a workspace, so
 * the office can see what went out, to whom, and whether it arrived.
 *
 * Rows are written with the service role and never block a send: a failed
 * insert is logged to the console and the send result is returned unchanged.
 * Delivery status (delivered, bounced, opened…) is read from Resend when the
 * Sent page loads, matched on `resend_id`.
 */

import { SHOW_OPS_OUTBOUND_HELD } from "@/lib/show-ops/outbound";

export type SentEmailKind =
  | "ticket"
  | "ticket_update"
  | "payment_link"
  | "partner_link"
  | "seller_invite"
  | "invoice"
  | "bus_list"
  | "meals_list"
  | "sale_closed"
  | "daily_report"
  | "other";

export const SENT_EMAIL_KIND_LABEL: Record<SentEmailKind, string> = {
  ticket: "Guest ticket",
  ticket_update: "Ticket update",
  payment_link: "Payment link",
  partner_link: "Partner link",
  seller_invite: "Seller login",
  invoice: "Invoice",
  bus_list: "Bus list",
  meals_list: "Special meals",
  sale_closed: "Sale closed",
  daily_report: "Daily report",
  other: "Email",
};

export type SentEmailLog = {
  businessId: string;
  kind: SentEmailKind;
  bookingId?: string | null;
};

type SendResult = { ok: true; id?: string } | { ok: false; message: string; reason?: string };

export type SentEmailStatus = "sent" | "held" | "failed";

/** Which row status a send result becomes. */
export function sentEmailStatus(result: SendResult): SentEmailStatus {
  if (result.ok) return "sent";
  return result.message === SHOW_OPS_OUTBOUND_HELD ? "held" : "failed";
}

function recipients(to: string | string[] | null | undefined): string[] {
  const list = Array.isArray(to) ? to : String(to ?? "").split(/[,;]/);
  return list
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 50);
}

/** Writes one log row. Never throws. */
export async function recordSentEmail(
  log: SentEmailLog,
  entry: { to: string | string[] | null | undefined; subject: string; result: SendResult },
): Promise<void> {
  try {
    const { createSupabaseServiceRoleClient } = await import("@/lib/supabase/server");
    const admin = createSupabaseServiceRoleClient();
    const status = sentEmailStatus(entry.result);
    const { error } = await admin.from("show_ops_sent_emails").insert({
      business_id: log.businessId,
      booking_id: log.bookingId ?? null,
      kind: log.kind,
      to_addresses: recipients(entry.to),
      subject: entry.subject.slice(0, 300),
      status,
      resend_id: entry.result.ok ? (entry.result.id ?? null) : null,
      error: entry.result.ok ? null : entry.result.message.slice(0, 500),
    });
    if (error) console.error("[sent-email-log] insert:", error.message);
  } catch (e) {
    console.error("[sent-email-log] insert failed:", e);
  }
}

/** Runs a send and, when `log` is given, records what happened. Returns the send result unchanged. */
export async function withSentEmailLog<T extends SendResult>(
  log: SentEmailLog | null | undefined,
  entry: { to: string | string[] | null | undefined; subject: string },
  send: () => Promise<T>,
): Promise<T> {
  const result = await send();
  if (log) await recordSentEmail(log, { ...entry, result });
  return result;
}
