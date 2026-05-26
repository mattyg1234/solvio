"use server";

import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type BookingAnalyticsSnapshot = {
  periodDays: number;
  totalRequests: number;
  paidDeposits: number;
  pendingDeposits: number;
  conversionRate: number;
  bookingRevenueCents: number;
  requestsByKind: { kind: string; count: number }[];
  dailyRequests: { date: string; count: number }[];
};

export async function loadBookingAnalyticsSnapshot(periodDays = 30): Promise<BookingAnalyticsSnapshot | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: businesses } = await supabase.from("businesses").select("id").eq("owner_id", user.id);
  const businessIds = businesses?.map((b) => b.id) ?? [];
  if (!businessIds.length) return null;

  const start = new Date();
  start.setUTCDate(start.getUTCDate() - periodDays);
  start.setUTCHours(0, 0, 0, 0);
  const startIso = start.toISOString();

  const { data: rows } = await supabase
    .from("booking_requests")
    .select("booking_kind,payment_status,deposit_amount_cents,created_at")
    .in("business_id", businessIds)
    .gte("created_at", startIso)
    .order("created_at", { ascending: false });

  const requests = rows ?? [];
  const paidDeposits = requests.filter((r) => r.payment_status === "paid").length;
  const pendingDeposits = requests.filter((r) => r.payment_status === "pending").length;
  const bookingRevenueCents = requests.reduce(
    (sum, row) =>
      row.payment_status === "paid" && typeof row.deposit_amount_cents === "number"
        ? sum + row.deposit_amount_cents
        : sum,
    0,
  );

  const kindMap = new Map<string, number>();
  const dayMap = new Map<string, number>();
  for (const row of requests) {
    const kind = (row.booking_kind ?? "unknown").toLowerCase();
    kindMap.set(kind, (kindMap.get(kind) ?? 0) + 1);
    const day = row.created_at.slice(0, 10);
    dayMap.set(day, (dayMap.get(day) ?? 0) + 1);
  }

  const totalRequests = requests.length;
  const conversionRate = totalRequests > 0 ? Math.round((paidDeposits / totalRequests) * 1000) / 10 : 0;

  return {
    periodDays,
    totalRequests,
    paidDeposits,
    pendingDeposits,
    conversionRate,
    bookingRevenueCents,
    requestsByKind: [...kindMap.entries()]
      .map(([kind, count]) => ({ kind, count }))
      .sort((a, b) => b.count - a.count),
    dailyRequests: [...dayMap.entries()]
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}
