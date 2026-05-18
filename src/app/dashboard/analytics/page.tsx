import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BarChart3 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
        <div className="relative flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="space-y-4">
            <Badge className="rounded-full bg-[#ede9fe] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#5b21b6] hover:bg-[#ede9fe]">
              Intelligence lane
            </Badge>
            <h1 className="text-[clamp(1.45rem,3vw,2rem)] font-semibold tracking-tight text-[#0f172a] flex items-center gap-3">
              <BarChart3 className="h-9 w-9 text-[#7c3aed]" aria-hidden />
              Analytics & reporting
            </h1>
            <p className="max-w-2xl text-[15px] leading-relaxed text-[#64748b]">
              Call volume curves, funnel drop-offs and revenue deltas will land here alongside your inbound booking stream — calm
              on the surface, sharp underneath.
            </p>
          </div>
          <Card className="w-full shrink-0 border border-dashed border-[#cbd5e1] bg-[#fafbff]/90 shadow-none md:max-w-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-[#0f172a]">What ships next</CardTitle>
              <CardDescription>Nothing to configure yet — we&apos;re reserving the rails.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 pb-6 text-[14px] text-[#475569]">
              <p>Voice session exports, SLA timers for missed calls and blended conversion paths from AI → Stripe.</p>
              <Link href="/dashboard/bookings" className="inline-block pt-2 text-sm font-semibold text-[#7c3aed] underline-offset-4 hover:underline">
                Inspect live intake instead →
              </Link>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
