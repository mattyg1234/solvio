import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BarChart3 } from "lucide-react";

import { loadBookingAnalyticsSnapshot } from "@/app/dashboard/analytics/booking-analytics";
import { loadPrimaryStripeMerchantDashboardAction } from "@/app/dashboard/payments/merchant-data-actions";
import { DashboardAnalyticsPanels } from "@/components/dashboard/dashboard-analytics-panels";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Analytics · Dashboard · Solvio",
};

export default async function DashboardAnalyticsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [booking, stripeResult] = await Promise.all([
    loadBookingAnalyticsSnapshot(30),
    loadPrimaryStripeMerchantDashboardAction(),
  ]);

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
        Dashboard home
      </Link>

      <section className="relative overflow-hidden rounded-[28px] border border-[#ebe7f7]/90 bg-white p-8 shadow-sm md:p-10">
        <div className="pointer-events-none absolute -right-14 top-4 h-32 w-32 rounded-full bg-[#ede9fe]/70 blur-3xl" aria-hidden />
        <div className="relative space-y-4">
          <Badge className="rounded-full bg-[#ede9fe] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#5b21b6] hover:bg-[#ede9fe]">
            Intelligence lane
          </Badge>
          <h1 className="flex items-center gap-3 text-[clamp(1.45rem,3vw,2rem)] font-semibold tracking-tight text-[#0f172a]">
            <BarChart3 className="h-9 w-9 text-[#7c3aed]" aria-hidden />
            Analytics & reporting
          </h1>
          <p className="max-w-2xl text-[15px] leading-relaxed text-[#64748b]">
            Booking intake, deposit conversion, and live Stripe balance data — your own dashboard inside Solvio, synced from
            Connect direct charges on each venue account.
          </p>
        </div>
      </section>

      <DashboardAnalyticsPanels
        booking={booking}
        stripe={stripeResult.ok ? stripeResult.data : null}
        stripeBusinessId={stripeResult.businessId ?? null}
        stripeError={stripeResult.ok ? null : stripeResult.message}
      />
    </div>
  );
}
