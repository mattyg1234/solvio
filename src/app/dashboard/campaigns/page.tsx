import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Megaphone, Phone, Sparkles, Target } from "lucide-react";

import { CampaignsEnableButton } from "@/components/dashboard/campaigns-enable-button";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Campaigns · Dashboard · Solvio",
};

type CampaignRow = {
  id: string;
  name: string;
  status: string;
  total_calls_attempted: number;
  total_calls_answered: number;
  total_calls_succeeded: number;
  total_cost_cents: number;
  updated_at: string;
};

type CreditsRow = {
  business_id: string;
  bundle_calls_remaining: number;
  trial_calls_remaining: number;
};

export default async function DashboardCampaignsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: business } = await supabase
    .from("businesses")
    .select("id,name,campaigns_enabled")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!business) {
    return (
      <div className="space-y-6">
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Add a business in Settings before opening Campaigns.
        </p>
      </div>
    );
  }

  const enabled = Boolean((business as { campaigns_enabled?: boolean }).campaigns_enabled);

  let campaigns: CampaignRow[] = [];
  let credits: CreditsRow | null = null;
  if (enabled) {
    const { data: cData } = await supabase
      .from("voice_campaigns")
      .select("id,name,status,total_calls_attempted,total_calls_answered,total_calls_succeeded,total_cost_cents,updated_at")
      .eq("business_id", business.id)
      .order("updated_at", { ascending: false });
    campaigns = (cData ?? []) as CampaignRow[];

    const { data: credRow } = await supabase
      .from("voice_outbound_credits")
      .select("business_id,bundle_calls_remaining,trial_calls_remaining")
      .eq("business_id", business.id)
      .maybeSingle();
    credits = (credRow as CreditsRow | null) ?? null;
  }

  return (
    <div className="space-y-8">
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

      <section className="relative overflow-hidden rounded-[28px] border border-[#ebe7f7]/90 bg-gradient-to-br from-white via-[#fafbff] to-[#f8fafc] p-8 shadow-[0_28px_90px_-58px_rgba(124,58,237,0.28)] md:p-10">
        <div className="pointer-events-none absolute right-8 top-10 h-32 w-32 rounded-full bg-[#c4b5fd]/25 blur-3xl" aria-hidden />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-3">
            <Badge className="rounded-full bg-[#ede9fe] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#5b21b6] hover:bg-[#ede9fe]">
              AI voice marketing · Beta
            </Badge>
            <h1 className="text-[clamp(1.45rem,3vw,2rem)] font-semibold tracking-tight text-[#0f172a]">
              Outbound calls that bring you bookings
            </h1>
            <p className="max-w-2xl text-[15px] leading-relaxed text-[#64748b]">
              Build an AI agent, give it a goal, point it at a list, then watch it dial. Gamified by conversion rate.
              Pay per call — no monthly commitment, sits alongside your booking subscription.
            </p>
          </div>
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#f5f3ff] text-[#7c3aed] ring-1 ring-[#ebe7f7]">
            <Megaphone className="h-7 w-7" aria-hidden />
          </span>
        </div>
      </section>

      {!enabled ? (
        <div className="grid gap-6 md:grid-cols-3">
          <Card className="rounded-[22px] border border-[#ebe7f7] bg-white shadow-sm md:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg text-[#0f172a]">How it works</CardTitle>
              <CardDescription className="text-[14px] leading-relaxed text-[#64748b]">
                Three steps. Built directly on the same Vapi + ElevenLabs stack as your inbound receptionist —
                no extra infra, no separate logins.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 pb-6 md:grid-cols-3">
              {[
                {
                  icon: Sparkles,
                  title: "1. Build your agent",
                  body: "Name, voice, tone, system prompt, opening line, success criteria. ChatGPT helps you refine the prompt.",
                },
                {
                  icon: Phone,
                  title: "2. Test it yourself",
                  body: "Punch in your own number, watch speech bubbles fly back and forth. Iterate before it hits real people.",
                },
                {
                  icon: Target,
                  title: "3. Add leads + dial",
                  body: "Upload a list or pull from your booking-history. The judge LLM scores each call success/fail/ambiguous.",
                },
              ].map((step) => (
                <div key={step.title} className="rounded-2xl border border-[#f1eefc] bg-[#fafbff] px-4 py-4">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#ede9fe] text-[#5b21b6]">
                    <step.icon className="h-4 w-4" aria-hidden />
                  </span>
                  <p className="mt-3 text-sm font-semibold text-[#0f172a]">{step.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-[#64748b]">{step.body}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-[22px] border border-[#c4b5fd] bg-gradient-to-br from-white to-[#faf7ff] shadow-[0_24px_60px_-30px_rgba(124,58,237,0.35)]">
            <CardHeader>
              <CardTitle className="text-lg text-[#0f172a]">Enable campaigns</CardTitle>
              <CardDescription className="text-[14px] leading-relaxed text-[#64748b]">
                Toggle this on to unlock the agent builder + outbound dialer. Includes <span className="font-semibold text-[#0f172a]">5 free demo calls</span> so you can try it without buying credits first.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pb-6">
              <CampaignsEnableButton businessId={business.id} />
              <p className="text-[12px] leading-relaxed text-[#64748b]">
                You can turn this off anytime in Settings — it just hides the tab.
              </p>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Credits + actions row */}
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-[#ebe7f7] bg-white p-5 shadow-sm md:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">Call credits</p>
              <p className="mt-1 text-3xl font-semibold text-[#0f172a]">
                {(credits?.bundle_calls_remaining ?? 0) + (credits?.trial_calls_remaining ?? 0)}
              </p>
              <p className="mt-1 text-sm text-[#64748b]">
                {(credits?.trial_calls_remaining ?? 0) > 0 ? (
                  <>{credits!.trial_calls_remaining} free trial · </>
                ) : null}
                {credits?.bundle_calls_remaining ?? 0} from bundles
              </p>
              <Link
                href="/dashboard/campaigns/buy"
                className={cn(buttonVariants({ variant: "outline" }), "mt-4 rounded-full text-sm font-semibold")}
              >
                Buy more credits
              </Link>
            </div>
            <div className="rounded-2xl border border-[#c4b5fd] bg-gradient-to-br from-white to-[#faf7ff] p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#5b21b6]">Quick start</p>
              <p className="mt-1 text-base font-semibold text-[#0f172a]">Build your first agent</p>
              <p className="mt-1 text-sm text-[#64748b]">A few questions and you&apos;ll be testing a live call in minutes.</p>
              <Link
                href="/dashboard/campaigns/new"
                className={cn(buttonVariants({ variant: "default" }), "mt-4 rounded-full text-sm font-semibold shadow-md shadow-[#7c3aed]/15")}
              >
                <Sparkles className="mr-1.5 inline h-4 w-4" aria-hidden />
                New agent
              </Link>
            </div>
          </div>

          {/* Campaigns list */}
          <Card className="rounded-[22px] border border-[#ebe7f7] bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg text-[#0f172a]">Your campaigns</CardTitle>
              <CardDescription className="text-[14px] text-[#64748b]">
                Each campaign is an AI agent + a goal. Pause anytime to refine the prompt or swap voices.
              </CardDescription>
            </CardHeader>
            <CardContent className="pb-6">
              {campaigns.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#ebe7f7] bg-[#fafbff] px-6 py-10 text-center">
                  <Sparkles className="mx-auto h-8 w-8 text-[#c4b5fd]" aria-hidden />
                  <p className="mt-3 text-sm font-semibold text-[#0f172a]">No campaigns yet</p>
                  <p className="mt-1 text-sm text-[#64748b]">
                    Build your first agent above — takes about 5 minutes including a test call.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-[#f1eefc]">
                  {campaigns.map((c) => {
                    const conversionPct =
                      c.total_calls_answered > 0
                        ? Math.round((c.total_calls_succeeded / c.total_calls_answered) * 100)
                        : 0;
                    return (
                      <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-[#0f172a]">{c.name}</p>
                          <p className="text-xs text-[#64748b]">
                            {c.total_calls_attempted} attempted · {c.total_calls_answered} answered ·{" "}
                            <span className="font-semibold text-[#5b21b6]">{conversionPct}%</span> conversion · £
                            {(c.total_cost_cents / 100).toFixed(2)} spent
                          </p>
                        </div>
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1",
                            c.status === "running"
                              ? "bg-emerald-50 text-emerald-800 ring-emerald-100"
                              : c.status === "paused"
                                ? "bg-amber-50 text-amber-900 ring-amber-100"
                                : c.status === "completed"
                                  ? "bg-sky-50 text-sky-900 ring-sky-100"
                                  : "bg-zinc-50 text-zinc-700 ring-zinc-200",
                          )}
                        >
                          {c.status}
                        </span>
                        <Link
                          href={`/dashboard/campaigns/${c.id}`}
                          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "rounded-full text-xs")}
                        >
                          Open
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
