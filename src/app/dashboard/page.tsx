import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CalendarClock, Coins, Layers, PhoneForwarded, Radar, TrendingUp } from "lucide-react";

import { OverviewSetupTabs } from "@/components/dashboard/overview-setup-tabs";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Overview · Dashboard · Solvio",
};

export default async function DashboardOverviewPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: businesses } = await supabase
    .from("businesses")
    .select(
      "id,name,stripe_connect_account_id,voice_receptionist_completed_at,booking_flow_completed_at,booking_flow_kind",
    )
    .eq("owner_id", user.id);

  const stripeConnected = businesses?.some((b) => Boolean(b.stripe_connect_account_id)) ?? false;
  const primaryBiz = businesses?.[0];
  const primaryBusinessName = primaryBiz?.name ?? null;
  const voiceComplete = Boolean(primaryBiz?.voice_receptionist_completed_at);
  const bookingFlowComplete = Boolean(primaryBiz?.booking_flow_completed_at);
  const bookingFlowKind = (primaryBiz?.booking_flow_kind as string | null | undefined) ?? null;

  const flowLabels: Record<string, string> = {
    restaurant_tables: "Table bookings",
    salon_appointments: "Appointments",
    walk_in_waitlist: "Customer waitlists",
    mixed: "Mixed operations",
  };
  const bookingFlowShortLabel =
    bookingFlowKind && flowLabels[bookingFlowKind] ? flowLabels[bookingFlowKind] : bookingFlowKind;

  const businessIds = businesses?.map((b) => b.id) ?? [];
  let inboundBookingCount = 0;
  let todayInboundCount = 0;
  if (businessIds.length > 0) {
    const startUtc = new Date();
    startUtc.setUTCHours(0, 0, 0, 0);
    const [{ count }, { count: todayCount }] = await Promise.all([
      supabase
        .from("booking_requests")
        .select("*", { count: "exact", head: true })
        .in("business_id", businessIds),
      supabase
        .from("booking_requests")
        .select("*", { count: "exact", head: true })
        .in("business_id", businessIds)
        .gte("created_at", startUtc.toISOString()),
    ]);
    inboundBookingCount = count ?? 0;
    /** UTC-midnight “today”; swap to merchant `businesses.time_zone` when analytics ship. */
    todayInboundCount = todayCount ?? 0;
  }

  let recentSignals: {
    customer_name: string | null;
    booking_kind: string | null;
    preferred_time: string | null;
    created_at: string;
  }[] = [];

  if (businessIds.length > 0) {
    const { data } = await supabase
      .from("booking_requests")
      .select("customer_name,booking_kind,preferred_time,created_at")
      .in("business_id", businessIds)
      .order("created_at", { ascending: false })
      .limit(6);
    recentSignals =
      data?.map((row) => ({
        customer_name: row.customer_name,
        booking_kind: row.booking_kind,
        preferred_time: row.preferred_time,
        created_at: row.created_at,
      })) ?? [];
  }

  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-[28px] border border-[#ebe7f7]/90 bg-gradient-to-br from-white via-[#fafbff] to-[#f8fafc] p-8 shadow-[0_28px_90px_-58px_rgba(124,58,237,0.38)] md:p-10">
        <div className="pointer-events-none absolute -right-24 top-0 h-56 w-56 rounded-full bg-[#a78bfa]/15 blur-3xl" aria-hidden />
        <div className="relative max-w-2xl space-y-5">
          <Badge className="rounded-full bg-[#ede9fe] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#5b21b6] hover:bg-[#ede9fe]">
            Ops pulse
          </Badge>
          <h2 className="text-[clamp(1.65rem,4vw,2.35rem)] font-semibold tracking-tight text-[#0f172a] leading-tight">
            Calmer shifts, fuller books — without living on the phone.
          </h2>
          <p className="text-[17px] leading-relaxed text-[#64748b]">
            {primaryBusinessName ? (
              <>
                You&apos;re assembling Solvio around{" "}
                <span className="font-semibold text-[#0f172a]">{primaryBusinessName}</span> — dashboards stay quiet until ops need
                them.
              </>
            ) : (
              <>
                Add venues and Stripe — these tiles tighten into live telemetry automatically.
              </>
            )}
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              href="/dashboard/bookings"
              className={cn(
                buttonVariants({ variant: "default" }),
                "inline-flex h-11 items-center gap-2 rounded-full px-6 text-base font-semibold shadow-lg shadow-[#7c3aed]/25",
              )}
            >
              Review bookings
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href={bookingFlowComplete ? "/dashboard/bookings" : "/dashboard/setup/bookings"}
              className={cn(
                buttonVariants({ variant: "secondary" }),
                "inline-flex h-11 items-center rounded-full px-6 text-base font-semibold text-[#5b21b6] hover:bg-[#ede9fe]",
              )}
            >
              {bookingFlowComplete ? "Edit or create bookings" : "Guest booking setup"}
            </Link>
            <Link
              href="/dashboard/payments"
              className={cn(
                buttonVariants({ variant: "outline" }),
                "inline-flex h-11 items-center rounded-full border-[#ebe7f7] px-6 text-base font-semibold text-[#0f172a]",
              )}
            >
              Payments & Stripe
            </Link>
          </div>
        </div>
      </section>

      <OverviewSetupTabs
        key={`${voiceComplete}-${bookingFlowComplete}`}
        hasBusiness={Boolean(businesses?.length)}
        voiceComplete={voiceComplete}
        bookingComplete={bookingFlowComplete}
        bookingFlowKind={bookingFlowKind}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Card className="rounded-[20px] border border-[#ebe7f7] bg-white shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[13px] font-semibold text-[#64748b]">Today&apos;s bookings</CardTitle>
            <CalendarClock className="h-4 w-4 text-[#7c3aed]" aria-hidden />
          </CardHeader>
          <CardContent className="pb-5 pt-1">
            <p className="text-3xl font-semibold text-[#0f172a]">{todayInboundCount}</p>
            <p className="text-[13px] text-[#64748b]">New requests since midnight UTC.</p>
          </CardContent>
        </Card>
        <Card className="rounded-[20px] border border-[#ebe7f7] bg-white shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[13px] font-semibold text-[#64748b]">Revenue today</CardTitle>
            <Coins className="h-4 w-4 text-[#7c3aed]" aria-hidden />
          </CardHeader>
          <CardContent className="pb-5 pt-1 space-y-1">
            <p className="text-3xl font-semibold text-[#0f172a]">{stripeConnected ? "Live" : "—"}</p>
            <p className="text-[13px] text-[#64748b]">
              {stripeConnected ? "Webhooks hydrate this card next." : "Connect Stripe below to unlock payouts."}
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-[20px] border border-[#ebe7f7] bg-white shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[13px] font-semibold text-[#64748b]">AI calls handled</CardTitle>
            <PhoneForwarded className="h-4 w-4 text-[#7c3aed]" aria-hidden />
          </CardHeader>
          <CardContent className="pb-5 pt-1 space-y-1">
            <p className="text-3xl font-semibold text-[#0f172a]">{voiceComplete ? "Ready" : "—"}</p>
            <p className="text-[13px] text-[#64748b]">
              {voiceComplete ? "Persona saved · telephony KPIs dock here." : "Finish AI receptionist setup."}
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-[20px] border border-[#ebe7f7] bg-white shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[13px] font-semibold text-[#64748b]">After-hours catches</CardTitle>
            <Layers className="h-4 w-4 text-[#7c3aed]" aria-hidden />
          </CardHeader>
          <CardContent className="pb-5 pt-1 space-y-1">
            <p className="text-3xl font-semibold text-[#64748b]">{voiceComplete ? "Auto" : "Soon"}</p>
            <p className="text-[13px] text-[#64748b]">Missed-call recovery surfaces once SIP / carrier hooks land.</p>
          </CardContent>
        </Card>
        <Card className="rounded-[20px] border border-[#ebe7f7] bg-white shadow-sm sm:col-span-2 xl:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[13px] font-semibold text-[#64748b]">Pipeline depth</CardTitle>
            <Radar className="h-4 w-4 text-[#7c3aed]" aria-hidden />
          </CardHeader>
          <CardContent className="pb-5 pt-1 space-y-1">
            <p className="text-3xl font-semibold text-[#0f172a]">{inboundBookingCount}</p>
            <p className="text-[13px] text-[#64748b]">All inbound requests across connected venues.</p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <Card className="rounded-[22px] border border-[#ebe7f7] bg-white shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg text-[#0f172a]">Living activity</CardTitle>
            <CardDescription>Latest guest signals — merges with AI transcripts later.</CardDescription>
          </CardHeader>
          <CardContent className="pb-6">
            {!recentSignals.length ? (
              <p className="text-sm leading-relaxed text-[#64748b]">
                Silence is fine — plug your hosted booking slug and prompts to start seeing entries.
              </p>
            ) : (
              <ul className="space-y-3 text-sm leading-relaxed text-[#475569]">
                {recentSignals.map((row, idx) => {
                  const who = row.customer_name?.trim() || "Guest";
                  const flavour = row.booking_kind ? row.booking_kind.replace(/_/g, " ") : "booking";
                  const when = row.preferred_time?.trim() || "Flexible window";
                  return (
                    <li key={`${row.created_at}-${idx}-${who}`} className="rounded-2xl border border-[#f1eefc] bg-[#fafbff] px-4 py-3">
                      <span className="font-semibold text-[#0f172a]">{who}</span> submitted a {flavour.toLowerCase()}
                      {when ? <> — prefers {when}</> : null}.
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card className="rounded-[22px] border border-[#ebe7f7] bg-white shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg text-[#0f172a]">AI-ready insight</CardTitle>
            <CardDescription>Lightweight heuristic — evolves into nightly reporting.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pb-6 text-[15px] leading-relaxed text-[#475569]">
            {inboundBookingCount === 0 ? (
              <p>
                You haven&apos;t published intake yet — when you flip the booking link live, Solvio will summarise lead
                surges automatically.
              </p>
            ) : inboundBookingCount < 10 ? (
              <p>Funnel looks healthy early — stage voice + SMS confirmations and we&apos;ll start inferring busiest windows.</p>
            ) : (
              <p>Nice velocity — carve time to route higher intent leads into Stripe deposits while AI answers the FAQs.</p>
            )}
            <Link href="/dashboard/analytics" className="inline-flex items-center gap-2 text-sm font-semibold text-[#7c3aed] underline-offset-4 hover:underline">
              Explore analytics roadmap
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-5 md:grid-cols-3">
        <Card className="rounded-[22px] border border-[#ebe7f7] bg-white shadow-sm">
          <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
            <div>
              <CardTitle className="text-base font-semibold text-[#0f172a]">Bookings pulse</CardTitle>
              <CardDescription className="text-[13px] leading-relaxed text-[#64748b]">
                Guests submitting via your Solvio-hosted booking links.
              </CardDescription>
            </div>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#f5f3ff] text-[#7c3aed] ring-1 ring-[#ebe7f7]">
              <CalendarClock className="h-5 w-5" aria-hidden />
            </span>
          </CardHeader>
          <CardContent className="space-y-3 pb-6">
            <p className="text-4xl font-semibold tracking-tight text-[#0f172a]">{inboundBookingCount}</p>
            <p className="text-sm font-medium text-[#64748b]">
              Inbound requests captured — email everyone from Bookings; phone unlocks tap-to-call & SMS.
            </p>
            <Badge variant="outline" className="rounded-full border-[#ebe7f7] text-[11px] font-semibold uppercase tracking-[0.2em] text-[#64748b]">
              {bookingFlowComplete && bookingFlowShortLabel ? bookingFlowShortLabel : inboundBookingCount > 0 ? "Live intake" : "Publish your link"}
            </Badge>
          </CardContent>
        </Card>

        <Card className="rounded-[22px] border border-[#ebe7f7] bg-white shadow-sm">
          <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
            <div>
              <CardTitle className="text-base font-semibold text-[#0f172a]">Voice coverage</CardTitle>
              <CardDescription className="text-[13px] leading-relaxed text-[#64748b]">
                Calls answered, transcripts archived here.
              </CardDescription>
            </div>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#f5f3ff] text-[#7c3aed] ring-1 ring-[#ebe7f7]">
              <PhoneForwarded className="h-5 w-5" aria-hidden />
            </span>
          </CardHeader>
          <CardContent className="space-y-3 pb-6">
            {voiceComplete ? (
              <>
                <p className="text-lg font-semibold text-emerald-700">Baseline saved</p>
                <p className="text-sm font-medium text-[#64748b]">
                  Reception tone & escalation hints are stored — live transcripts & routing attach once telephony is wired to Solvio&apos;s stack.
                </p>
                <Badge variant="outline" className="rounded-full border-emerald-100 bg-emerald-50 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-800">
                  Profile ready
                </Badge>
              </>
            ) : (
              <>
                <p className="text-4xl font-semibold tracking-tight text-[#64748b]">—</p>
                <p className="text-sm font-medium text-[#64748b]">
                  Wire tone, languages & escalations — prep before you attach telephony.
                </p>
                <Badge variant="outline" className="rounded-full border-[#ebe7f7] text-[11px] font-semibold uppercase tracking-[0.2em] text-[#64748b]">
                  Setup pending
                </Badge>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-[22px] border border-[#ebe7f7] bg-white shadow-sm ring-1 ring-[#ede9fe]/60">
          <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
            <div>
              <CardTitle className="text-base font-semibold text-[#0f172a]">Commerce readiness</CardTitle>
              <CardDescription className="text-[13px] leading-relaxed text-[#64748b]">
                Stripe Connect deposits landing in your account.
              </CardDescription>
            </div>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#f5f3ff] text-[#7c3aed] ring-1 ring-[#ebe7f7]">
              <TrendingUp className="h-5 w-5" aria-hidden />
            </span>
          </CardHeader>
          <CardContent className="space-y-4 pb-6">
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${stripeConnected ? "bg-emerald-500 shadow-[0_0_0_6px_rgba(16,185,129,0.18)]" : "bg-amber-400 shadow-[0_0_0_6px_rgba(251,191,36,0.22)]"}`} />
              <p className="text-lg font-semibold text-[#0f172a]">
                {stripeConnected ? "Stripe linked" : "Finish Stripe onboarding"}
              </p>
            </div>
            <p className="text-sm leading-relaxed text-[#64748b]">
              {stripeConnected
                ? "You’re ready to collect deposits — payouts route straight to your connected account."
                : "Connect Stripe so Solvio can send hosted invoices & deposits without touching your checkout manually."}
            </p>
            <Link
              href="/dashboard/payments"
              className={cn(
                buttonVariants({ variant: "outline" }),
                "inline-flex h-11 w-full items-center justify-center rounded-full border-[#ebe7f7] font-semibold",
              )}
            >
              {stripeConnected ? "View payout settings" : "Open payments workspace"}
            </Link>
          </CardContent>
        </Card>
      </section>

      <section className="rounded-[22px] border border-dashed border-[#ddd6fe] bg-[#fafbff]/80 px-6 py-8 md:px-10">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-[#94a3b8]">Next milestones</p>
            <h3 className="text-lg font-semibold text-[#0f172a]">Automations queued for launch</h3>
            <p className="max-w-xl text-sm leading-relaxed text-[#64748b]">
              Automatic confirmations, bilingual greetings for tourists and cancellation flows stay orchestrated here once voice +
              booking APIs wire through Supabase.
            </p>
          </div>
          <Link
            href="/dashboard/calls"
            className={cn(
              buttonVariants({ variant: "ghost" }),
              "inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-4 font-semibold text-[#7c3aed]",
            )}
          >
            Preview voice workspace
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </section>
    </div>
  );
}
