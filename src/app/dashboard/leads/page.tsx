import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CalendarDays, Flame, Radar } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { BOOKING_GUEST_MODE_LABELS, isBookingGuestMode } from "@/lib/booking-guest-modes";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Lead generation · Dashboard · Solvio",
};

type BookingLeadRow = {
  id: string;
  customer_name: string;
  email: string;
  booking_kind: string | null;
  guest_count: number | null;
  created_at: string;
};

function kindLabel(kind: string | null): string {
  if (!kind) return "—";
  return isBookingGuestMode(kind) ? BOOKING_GUEST_MODE_LABELS[kind] : kind;
}

function recentCutoff(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export default async function DashboardLeadsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: businessesRaw } = await supabase
    .from("businesses")
    .select("id,name")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true });

  const businesses = businessesRaw ?? [];
  const businessIds = businesses.map((b) => b.id);

  let leads: BookingLeadRow[] = [];

  if (businessIds.length > 0) {
    const { data } = await supabase
      .from("booking_requests")
      .select("id,customer_name,email,booking_kind,guest_count,created_at")
      .in("business_id", businessIds)
      .order("created_at", { ascending: false })
      .limit(120);

    leads = (data ?? []) as BookingLeadRow[];
  }

  const cutoff30 = recentCutoff(30);
  const leads30 = leads.filter((row) => row.created_at >= cutoff30);

  const countsByKind = leads30.reduce<Record<string, number>>((acc, row) => {
    const key = row.booking_kind ?? "unknown";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const hotPreview = leads.slice(0, 8);

  return (
    <div className="space-y-10">
      <Link
        href="/dashboard"
        className={cn(
          buttonVariants({ variant: "ghost" }),
          "inline-flex h-10 items-center gap-2 px-2 text-sm font-semibold text-[#64748b] hover:text-[#0f172a]",
        )}
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Overview
      </Link>

      <section className="rounded-[28px] border border-[#ebe7f7]/90 bg-white p-8 shadow-sm md:p-10">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f5f3ff] text-[#7c3aed] ring-1 ring-[#ebe7f7]">
          <Radar className="h-7 w-7" aria-hidden />
        </span>
        <div className="mt-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-3">
            <Badge className="rounded-full bg-[#ede9fe] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#5b21b6] hover:bg-[#ede9fe]">
              Warm pipeline
            </Badge>
            <h1 className="text-[clamp(1.55rem,3vw,2rem)] font-semibold tracking-tight text-[#0f172a]">
              Lead workspace fed by live booking intake
            </h1>
            <p className="max-w-2xl text-[15px] leading-relaxed text-[#64748b]">
              Every Solvio booking request is already structured contact data — perfect hand-offs before outbound dialers or CRM sync lands.
              Downstream enrichment stays gated behind compliance review.
            </p>
          </div>
          <Link
            href="/dashboard/bookings"
            className={cn(
              buttonVariants({ variant: "outline" }),
              "inline-flex h-11 items-center justify-center rounded-full border-[#ddd6fe] px-6 font-semibold text-[#5b21b6]",
            )}
          >
            <CalendarDays className="mr-2 h-4 w-4" aria-hidden />
            Open bookings hub
          </Link>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          <article className="rounded-2xl border border-[#f1eefc] bg-[#fafbff] p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-[#94a3b8]">Active venues</p>
            <p className="mt-3 text-4xl font-semibold text-[#0f172a]">{businesses.length}</p>
            <p className="mt-2 text-sm text-[#64748b]">Locations tied to your Solvio workspace.</p>
          </article>
          <article className="rounded-2xl border border-[#f1eefc] bg-[#fafbff] p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-[#94a3b8]">Fresh leads · 30 days</p>
            <p className="mt-3 text-4xl font-semibold text-[#0f172a]">{leads30.length}</p>
            <p className="mt-2 text-sm text-[#64748b]">Booking submissions captured via hosted links.</p>
          </article>
          <article className="rounded-2xl border border-[#f1eefc] bg-[#fafbff] p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-[#94a3b8]">Need breakdown</p>
            <div className="mt-4 space-y-2 text-sm text-[#475569]">
              {Object.keys(countsByKind).length === 0 ? (
                <p>No typed leads yet — publish your booking link to start collecting signal.</p>
              ) : (
                Object.entries(countsByKind)
                  .sort((a, b) => b[1] - a[1])
                  .map(([kind, count]) => (
                    <div key={kind} className="flex items-center justify-between rounded-xl bg-white px-3 py-2">
                      <span className="font-medium text-[#0f172a]">{kindLabel(kind)}</span>
                      <span className="tabular-nums text-[#64748b]">{count}</span>
                    </div>
                  ))
              )}
            </div>
          </article>
        </div>

        <div className="mt-10 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Flame className="h-5 w-5 text-[#f97316]" aria-hidden />
              <h2 className="text-lg font-semibold text-[#0f172a]">Latest conversations-ready contacts</h2>
            </div>
            <Link
              href="/dashboard/bookings"
              className={cn(buttonVariants({ variant: "ghost" }), "rounded-full px-4 text-sm font-semibold text-[#7c3aed]")}
            >
              View entire inbox →
            </Link>
          </div>

          <div className="overflow-hidden rounded-[22px] border border-[#ebe7f7]">
            <table className="min-w-full divide-y divide-[#f1eefc] text-left text-sm">
              <thead className="bg-[#fafbff] text-[11px] font-semibold uppercase tracking-[0.18em] text-[#94a3b8]">
                <tr>
                  <th className="px-5 py-3">Guest</th>
                  <th className="px-5 py-3">Need</th>
                  <th className="px-5 py-3">Guests</th>
                  <th className="px-5 py-3">Captured</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f8fafc] bg-white">
                {hotPreview.length === 0 ? (
                  <tr>
                    <td className="px-5 py-6 text-[15px] text-[#64748b]" colSpan={4}>
                      No booking requests yet. Share your public booking URL from the bookings page (
                      <code className="rounded bg-[#f1f5f9] px-1.5 py-0.5 text-[13px]">/book/your-slug</code>) to populate this grid
                      automatically.
                    </td>
                  </tr>
                ) : (
                  hotPreview.map((row) => (
                    <tr key={row.id} className="hover:bg-[#fafbff]/60">
                      <td className="px-5 py-4">
                        <p className="font-semibold text-[#0f172a]">{row.customer_name}</p>
                        <p className="text-xs text-[#94a3b8]">{row.email}</p>
                      </td>
                      <td className="px-5 py-4 text-[#475569]">{kindLabel(row.booking_kind)}</td>
                      <td className="px-5 py-4 text-[#475569]">{row.guest_count ?? "—"}</td>
                      <td className="px-5 py-4 text-[#64748b]">
                        {new Date(row.created_at).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
