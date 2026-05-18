"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type BookingMessageRow = {
  id: string;
  direction: "outbound" | "inbound";
  channel: "sms" | "email" | "voice" | "note";
  body: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  return { supabase, user };
}

async function assertBookingsOwned(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, userId: string, ids: string[]) {
  const unique = [...new Set(ids)].filter(Boolean);
  if (!unique.length) {
    throw new Error("Nothing selected.");
  }

  const { data: reqs, error } = await supabase.from("booking_requests").select("id,business_id").in("id", unique);

  if (error) {
    throw new Error(error.message);
  }
  if (!reqs?.length || reqs.length !== unique.length) {
    throw new Error("One or more bookings could not be found.");
  }

  const bizIds = [...new Set(reqs.map((r) => r.business_id))];
  const { data: owned } = await supabase.from("businesses").select("id").eq("owner_id", userId).in("id", bizIds);

  const ownedSet = new Set((owned ?? []).map((o) => o.id));
  const ok = reqs.every((r) => ownedSet.has(r.business_id));
  if (!ok) {
    throw new Error("You cannot modify those bookings.");
  }

  return reqs;
}

export async function fetchBookingMessages(bookingRequestId: string): Promise<BookingMessageRow[]> {
  const { supabase, user } = await requireUser();

  const { data: req } = await supabase
    .from("booking_requests")
    .select("business_id")
    .eq("id", bookingRequestId)
    .maybeSingle();

  if (!req?.business_id) {
    return [];
  }

  const { data: biz } = await supabase
    .from("businesses")
    .select("id")
    .eq("id", req.business_id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!biz) {
    throw new Error("Unauthorized.");
  }

  const { data, error } = await supabase
    .from("booking_messages")
    .select("id,direction,channel,body,metadata,created_at")
    .eq("booking_request_id", bookingRequestId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => ({
    ...row,
    metadata: (typeof row.metadata === "object" && row.metadata !== null ? row.metadata : {}) as Record<string, unknown>,
  })) as BookingMessageRow[];
}

export async function sendBookingOutboundBulk(params: {
  bookingRequestIds: string[];
  channel: "sms" | "email" | "voice";
  body: string;
  fromNoreply?: boolean;
}) {
  const { supabase, user } = await requireUser();
  const body = params.body.trim();
  if (!body) {
    throw new Error("Write something to send.");
  }

  const reqs = await assertBookingsOwned(supabase, user.id, params.bookingRequestIds);

  const meta = {
    from_noreply: params.channel === "voice" ? false : params.fromNoreply !== false,
    delivery: "logged_in_app",
    bulk: reqs.length > 1,
  };

  const rows = reqs.map((r) => ({
    booking_request_id: r.id,
    business_id: r.business_id,
    direction: "outbound" as const,
    channel: params.channel,
    body,
    metadata: meta,
  }));

  const { error } = await supabase.from("booking_messages").insert(rows);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/dashboard/bookings");
}

export async function recordBookingInbound(bookingRequestId: string, channel: "sms" | "email", body: string) {
  const { supabase, user } = await requireUser();
  const trimmed = body.trim();
  if (!trimmed) {
    throw new Error("Paste what the guest said.");
  }

  const reqs = await assertBookingsOwned(supabase, user.id, [bookingRequestId]);
  const req = reqs[0];

  const { error } = await supabase.from("booking_messages").insert({
    booking_request_id: req.id,
    business_id: req.business_id,
    direction: "inbound",
    channel,
    body: trimmed,
    metadata: { captured_by: "merchant_console", source: "manual" },
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/dashboard/bookings");
}
