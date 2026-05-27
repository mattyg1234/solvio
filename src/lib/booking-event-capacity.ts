import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

function sumGuestCounts(rows: { guest_count: number | null }[] | null | undefined): number {
  return (rows ?? []).reduce(
    (sum, row) => sum + (typeof row.guest_count === "number" && row.guest_count > 0 ? row.guest_count : 1),
    0,
  );
}

/** Fresh capacity check at submit time — confirmed diary + open event requests for the same listing. */
export async function assertEventCapacityForSubmit(args: {
  eventId: string;
  businessId: string;
  wantedGuests: number;
  eventTitle: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const admin = createSupabaseServiceRoleClient();
  const { data: ev } = await admin
    .from("business_events")
    .select("id,capacity,title")
    .eq("id", args.eventId)
    .eq("business_id", args.businessId)
    .maybeSingle();

  if (!ev || typeof ev.capacity !== "number" || ev.capacity <= 0) {
    return { ok: true };
  }

  const title = (ev.title ?? args.eventTitle).trim() || args.eventTitle;

  const [{ data: confirmed }, { data: pending }] = await Promise.all([
    admin
      .from("venue_calendar_bookings")
      .select("guest_count")
      .eq("business_event_id", args.eventId)
      .neq("status", "cancelled"),
    admin
      .from("booking_requests")
      .select("guest_count,intake_extras,event_title")
      .eq("business_id", args.businessId)
      .eq("booking_kind", "event"),
  ]);

  let pendingTaken = 0;
  for (const row of pending ?? []) {
    const extras =
      row.intake_extras && typeof row.intake_extras === "object" && !Array.isArray(row.intake_extras)
        ? (row.intake_extras as Record<string, unknown>)
        : null;
    const extraEventId = typeof extras?.hosted_event_id === "string" ? extras.hosted_event_id.trim() : "";
    const matchesEvent =
      extraEventId === args.eventId ||
      (typeof row.event_title === "string" && row.event_title.trim() === title);
    if (matchesEvent) {
      pendingTaken +=
        typeof row.guest_count === "number" && row.guest_count > 0 ? row.guest_count : 1;
    }
  }

  const taken = sumGuestCounts(confirmed) + pendingTaken;
  const remaining = ev.capacity - taken;

  if (remaining <= 0) {
    return { ok: false, message: `${title} is sold out — no seats remaining.` };
  }
  if (args.wantedGuests > remaining) {
    return {
      ok: false,
      message: `${title} only has ${remaining} seat${remaining === 1 ? "" : "s"} left — adjust party size to ${remaining} or fewer.`,
    };
  }

  return { ok: true };
}
