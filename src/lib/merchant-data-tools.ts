import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Read-only data accessors the "Ask Solvio" assistant calls as tools.
 * Every function takes the businessIds the caller owns; all returned data
 * is filtered by that, so the assistant can never leak across merchants.
 */

export type SearchCallsResult = {
  call_id: string;
  business_id: string;
  business_name: string;
  started_at: string;
  caller_name: string | null;
  caller_phone: string | null;
  duration_seconds: number;
  outcome: string | null;
  excerpt: string;
};

export async function searchCalls(
  supabase: SupabaseClient,
  businessIds: string[],
  bizNameById: Map<string, string>,
  args: { query: string; days_back?: number; limit?: number },
): Promise<SearchCallsResult[]> {
  if (!businessIds.length || !args.query.trim()) return [];
  const days = Math.min(Math.max(args.days_back ?? 30, 1), 365);
  const sinceIso = new Date(Date.now() - days * 86400_000).toISOString();
  const q = args.query.trim().slice(0, 120);
  const limit = Math.min(args.limit ?? 10, 25);

  // Pull recent calls then filter by transcript text client-side (Supabase ilike on jsonb is awkward).
  const { data } = await supabase
    .from("voice_call_logs")
    .select("id, business_id, started_at, caller_name, caller_phone, duration_seconds, outcome, transcript_summary, raw_transcript")
    .in("business_id", businessIds)
    .gte("started_at", sinceIso)
    .order("started_at", { ascending: false })
    .limit(200);

  const needle = q.toLowerCase();
  const matches: SearchCallsResult[] = [];
  for (const row of data ?? []) {
    const summary = (row as { transcript_summary?: unknown }).transcript_summary;
    const raw = (row as { raw_transcript?: unknown }).raw_transcript;
    const rawText =
      typeof raw === "string"
        ? raw
        : raw && typeof raw === "object" && typeof (raw as { text?: unknown }).text === "string"
          ? (raw as { text: string }).text
          : "";
    const blob = `${typeof summary === "string" ? summary : ""}\n${rawText}`.toLowerCase();
    if (!blob.includes(needle)) continue;
    // Build a small excerpt around the first hit.
    const idx = blob.indexOf(needle);
    const sourceText = typeof summary === "string" && summary.toLowerCase().includes(needle) ? summary : rawText;
    const start = Math.max(0, idx - 80);
    const excerpt = sourceText.slice(start, start + 320).trim();
    matches.push({
      call_id: row.id as string,
      business_id: row.business_id as string,
      business_name: bizNameById.get(row.business_id as string) ?? "—",
      started_at: row.started_at as string,
      caller_name: (row.caller_name as string | null) ?? null,
      caller_phone: (row.caller_phone as string | null) ?? null,
      duration_seconds: (row.duration_seconds as number) ?? 0,
      outcome: (row.outcome as string | null) ?? null,
      excerpt,
    });
    if (matches.length >= limit) break;
  }
  return matches;
}

export type BookingMatch = {
  id: string;
  business_id: string;
  business_name: string;
  source: "confirmed" | "request";
  guest_name: string;
  guest_email: string | null;
  guest_phone: string | null;
  starts_at: string | null;
  booking_kind: string | null;
  title: string | null;
  table_label?: string | null;
  guest_count: number | null;
  status?: string | null;
};

export async function findBooking(
  supabase: SupabaseClient,
  businessIds: string[],
  bizNameById: Map<string, string>,
  args: { guest_name?: string; phone?: string; date?: string; limit?: number },
): Promise<BookingMatch[]> {
  if (!businessIds.length) return [];
  if (!args.guest_name?.trim() && !args.phone?.trim()) return [];
  const limit = Math.min(args.limit ?? 8, 20);
  const out: BookingMatch[] = [];

  const confirmedQuery = supabase
    .from("venue_calendar_bookings")
    .select("id, business_id, guest_name, guest_email, guest_phone, starts_at, booking_kind, title, floor_plan_table_id, guest_count, status")
    .in("business_id", businessIds)
    .order("starts_at", { ascending: false })
    .limit(limit);
  if (args.guest_name?.trim()) confirmedQuery.ilike("guest_name", `%${args.guest_name.trim()}%`);
  if (args.phone?.trim()) confirmedQuery.ilike("guest_phone", `%${args.phone.trim()}%`);
  if (args.date) {
    const start = `${args.date}T00:00:00Z`;
    const end = `${args.date}T23:59:59Z`;
    confirmedQuery.gte("starts_at", start).lte("starts_at", end);
  }
  const { data: confirmed } = await confirmedQuery;
  for (const row of confirmed ?? []) {
    out.push({
      id: row.id as string,
      business_id: row.business_id as string,
      business_name: bizNameById.get(row.business_id as string) ?? "—",
      source: "confirmed",
      guest_name: (row.guest_name as string) ?? "",
      guest_email: (row.guest_email as string | null) ?? null,
      guest_phone: (row.guest_phone as string | null) ?? null,
      starts_at: (row.starts_at as string | null) ?? null,
      booking_kind: (row.booking_kind as string | null) ?? null,
      title: (row.title as string | null) ?? null,
      table_label: null,
      guest_count: (row.guest_count as number | null) ?? null,
      status: (row.status as string | null) ?? null,
    });
  }

  if (out.length < limit) {
    const remaining = limit - out.length;
    const reqQuery = supabase
      .from("booking_requests")
      .select("id, business_id, customer_name, email, phone, requested_date, preferred_time, event_title, booking_kind, guest_count")
      .in("business_id", businessIds)
      .order("created_at", { ascending: false })
      .limit(remaining);
    if (args.guest_name?.trim()) reqQuery.ilike("customer_name", `%${args.guest_name.trim()}%`);
    if (args.phone?.trim()) reqQuery.ilike("phone", `%${args.phone.trim()}%`);
    if (args.date) reqQuery.eq("requested_date", args.date);
    const { data: reqs } = await reqQuery;
    for (const row of reqs ?? []) {
      out.push({
        id: row.id as string,
        business_id: row.business_id as string,
        business_name: bizNameById.get(row.business_id as string) ?? "—",
        source: "request",
        guest_name: (row.customer_name as string) ?? "",
        guest_email: (row.email as string | null) ?? null,
        guest_phone: (row.phone as string | null) ?? null,
        starts_at: row.requested_date ? `${row.requested_date}T${(row.preferred_time as string | null) ?? "00:00"}` : null,
        booking_kind: (row.booking_kind as string | null) ?? null,
        title: (row.event_title as string | null) ?? null,
        guest_count: (row.guest_count as number | null) ?? null,
        status: "pending",
      });
    }
  }
  return out;
}

export type DateBookingCount = {
  business_id: string;
  business_name: string;
  date: string;
  confirmed_count: number;
  total_guests: number;
  requests_pending: number;
};

export async function countBookingsForDate(
  supabase: SupabaseClient,
  businessIds: string[],
  bizNameById: Map<string, string>,
  args: { date: string },
): Promise<DateBookingCount[]> {
  if (!businessIds.length || !args.date) return [];
  const start = `${args.date}T00:00:00Z`;
  const end = `${args.date}T23:59:59Z`;

  const [{ data: confirmed }, { data: reqs }] = await Promise.all([
    supabase
      .from("venue_calendar_bookings")
      .select("business_id, guest_count, status")
      .in("business_id", businessIds)
      .gte("starts_at", start)
      .lte("starts_at", end),
    supabase
      .from("booking_requests")
      .select("business_id, guest_count")
      .in("business_id", businessIds)
      .eq("requested_date", args.date),
  ]);

  const out = new Map<string, DateBookingCount>();
  for (const bid of businessIds) {
    out.set(bid, {
      business_id: bid,
      business_name: bizNameById.get(bid) ?? "—",
      date: args.date,
      confirmed_count: 0,
      total_guests: 0,
      requests_pending: 0,
    });
  }
  for (const row of confirmed ?? []) {
    if ((row.status as string | null) === "cancelled") continue;
    const tally = out.get(row.business_id as string);
    if (!tally) continue;
    tally.confirmed_count++;
    tally.total_guests += Number(row.guest_count ?? 0);
  }
  for (const row of reqs ?? []) {
    const tally = out.get(row.business_id as string);
    if (!tally) continue;
    tally.requests_pending++;
  }
  return [...out.values()].filter((r) => r.confirmed_count > 0 || r.requests_pending > 0);
}

export type UpcomingEvent = {
  id: string;
  business_id: string;
  business_name: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  description: string | null;
  ticket_price_cents: number | null;
  capacity: number | null;
};

export async function listUpcomingEvents(
  supabase: SupabaseClient,
  businessIds: string[],
  bizNameById: Map<string, string>,
  args: { days_ahead?: number },
): Promise<UpcomingEvent[]> {
  if (!businessIds.length) return [];
  const days = Math.min(Math.max(args.days_ahead ?? 30, 1), 180);
  const nowIso = new Date().toISOString();
  const untilIso = new Date(Date.now() + days * 86400_000).toISOString();

  const { data } = await supabase
    .from("business_events")
    .select("id, business_id, title, starts_at, ends_at, description, ticket_price_cents, capacity")
    .in("business_id", businessIds)
    .gte("starts_at", nowIso)
    .lte("starts_at", untilIso)
    .order("starts_at", { ascending: true })
    .limit(20);

  return (data ?? []).map((row) => ({
    id: row.id as string,
    business_id: row.business_id as string,
    business_name: bizNameById.get(row.business_id as string) ?? "—",
    title: (row.title as string) ?? "Event",
    starts_at: row.starts_at as string,
    ends_at: (row.ends_at as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    ticket_price_cents: (row.ticket_price_cents as number | null) ?? null,
    capacity: (row.capacity as number | null) ?? null,
  }));
}
