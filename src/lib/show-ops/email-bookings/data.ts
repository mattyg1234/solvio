import type { ShowOpsContext } from "@/lib/show-ops/access";

import { rankBookingMatches, type BookingCandidate, type BookingMatch } from "./mapping";
import type { EmailStatus, ExtractedBooking, InboundEmailRow } from "./types";

type Supabase = ShowOpsContext["supabase"];

export const EMAIL_COLUMNS =
  "id,provider,provider_message_id,from_name,from_email,subject,received_at,body,seller_key,seller_name,kind,extracted,confidence,reader,status,booking_id,system_note,notes,handled_at";

export const CANDIDATE_COLUMNS =
  "id,booking_ref,guest_name,show_date,show_name,supplier_name,adults,children,infants,hotel_name,channel,channel_ref,supplier_ticket_number,cancelled_at";

const cleanRef = (ref: string | null | undefined) => String(ref ?? "").trim();

/**
 * A live booking already carrying this reference: the channel's own reference first (GYG API,
 * earlier email bookings), then the partner ticket number the office typed (Lanzasoft imports).
 */
export async function findBookingByReference(
  supabase: Supabase,
  businessId: string,
  channel: string,
  reference: string | null | undefined,
): Promise<{ id: string; booking_ref: string; how: "channel" | "ticket" } | null> {
  const ref = cleanRef(reference);
  if (ref.length < 3) return null;
  const byChannel = await supabase
    .from("show_bookings")
    .select("id,booking_ref")
    .eq("business_id", businessId)
    .eq("channel", channel)
    .eq("channel_ref", ref)
    .is("cancelled_at", null)
    .limit(1)
    .maybeSingle();
  if (byChannel.data) return { id: String(byChannel.data.id), booking_ref: String(byChannel.data.booking_ref), how: "channel" };
  const byTicket = await supabase
    .from("show_bookings")
    .select("id,booking_ref")
    .eq("business_id", businessId)
    .eq("supplier_ticket_number", ref)
    .is("cancelled_at", null)
    .limit(1)
    .maybeSingle();
  if (byTicket.data) return { id: String(byTicket.data.id), booking_ref: String(byTicket.data.booking_ref), how: "ticket" };
  return null;
}

/** Existing bookings an email may be about: same reference, or same night and surname. */
export async function loadBookingMatches(supabase: Supabase, businessId: string, e: ExtractedBooking): Promise<BookingMatch[]> {
  const ref = cleanRef(e.reference);
  const found = new Map<string, BookingCandidate>();
  const add = (rows: unknown[] | null | undefined) => {
    for (const r of (rows ?? []) as BookingCandidate[]) found.set(r.id, r);
  };
  if (ref.length >= 3) {
    const [a, b] = await Promise.all([
      supabase.from("show_bookings").select(CANDIDATE_COLUMNS).eq("business_id", businessId).eq("channel_ref", ref).limit(5),
      supabase.from("show_bookings").select(CANDIDATE_COLUMNS).eq("business_id", businessId).eq("supplier_ticket_number", ref).limit(5),
    ]);
    add(a.data);
    add(b.data);
  }
  const parts = String(e.name ?? "").trim().split(/\s+/);
  const surname = (parts[parts.length - 1] ?? "").replace(/[%_,()*]/g, "");
  if (e.date && surname.length > 2) {
    const c = await supabase
      .from("show_bookings")
      .select(CANDIDATE_COLUMNS)
      .eq("business_id", businessId)
      .eq("show_date", e.date)
      .ilike("guest_name", `%${surname}%`)
      .limit(8);
    add(c.data);
  }
  return rankBookingMatches(e, [...found.values()]);
}

export type EmailTab = EmailStatus | "all";

export async function loadEmailQueue(
  supabase: Supabase,
  businessId: string,
  tab: EmailTab,
): Promise<{ emails: InboundEmailRow[]; counts: Record<EmailStatus, number>; missingTable: boolean }> {
  let q = supabase.from("show_email_bookings").select(EMAIL_COLUMNS).eq("business_id", businessId).order("received_at", { ascending: false }).limit(200);
  if (tab !== "all") q = q.eq("status", tab);
  const count = (status: EmailStatus) =>
    supabase.from("show_email_bookings").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("status", status);
  const [list, review, added, ignored] = await Promise.all([q, count("review"), count("added"), count("ignored")]);
  if (list.error) {
    if (/show_email_bookings|does not exist|schema cache/i.test(list.error.message)) {
      return { emails: [], counts: { review: 0, added: 0, ignored: 0 }, missingTable: true };
    }
    throw new Error("Could not load booking emails.");
  }
  return {
    emails: (list.data ?? []).map((r) => ({ ...(r as InboundEmailRow), extracted: ((r as InboundEmailRow).extracted ?? {}) as ExtractedBooking })),
    counts: { review: review.count ?? 0, added: added.count ?? 0, ignored: ignored.count ?? 0 },
    missingTable: false,
  };
}

export async function loadEmail(supabase: Supabase, businessId: string, id: string): Promise<InboundEmailRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await supabase.from("show_email_bookings").select(EMAIL_COLUMNS).eq("business_id", businessId).eq("id", id).maybeSingle();
  if (!data) return null;
  const row = data as InboundEmailRow;
  return { ...row, extracted: (row.extracted ?? {}) as ExtractedBooking };
}
