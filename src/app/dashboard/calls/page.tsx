import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, PhoneForwarded, Phone, PhoneOff, Voicemail, MessageSquare } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Calls · Dashboard · Solvio",
};

type VoiceCallLog = {
  id: string;
  business_id: string;
  vapi_call_id: string | null;
  caller_phone: string | null;
  caller_name: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  duration_minutes_billable: string | number;
  outcome: string | null;
  transcript_summary: string | null;
  cost_cents: number;
};

type UsageRow = {
  business_id: string;
  business_name: string;
  subscription_tier: string;
  monthly_ai_minutes_included: number;
  minutes_used: number | string;
  minutes_over: number | string;
  call_count: number;
};

function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  if (m === 0) return `${r}s`;
  return `${m}m ${String(r).padStart(2, "0")}s`;
}

function outcomeBadge(outcome: string | null) {
  if (!outcome) return null;
  const map: Record<string, { label: string; cls: string; Icon: typeof Phone }> = {
    answered: { label: "Answered", cls: "bg-emerald-50 text-emerald-800 ring-emerald-100", Icon: Phone },
    booked: { label: "Booked", cls: "bg-[#ede9fe] text-[#5b21b6] ring-[#ddd6fe]", Icon: MessageSquare },
    voicemail: { label: "Voicemail", cls: "bg-amber-50 text-amber-900 ring-amber-100", Icon: Voicemail },
    transferred: { label: "Transferred", cls: "bg-sky-50 text-sky-900 ring-sky-100", Icon: PhoneForwarded },
    dropped: { label: "Dropped", cls: "bg-rose-50 text-rose-800 ring-rose-100", Icon: PhoneOff },
    spam: { label: "Spam", cls: "bg-zinc-100 text-zinc-700 ring-zinc-200", Icon: PhoneOff },
  };
  const entry = map[outcome] ?? { label: outcome, cls: "bg-zinc-100 text-zinc-700 ring-zinc-200", Icon: Phone };
  const { Icon } = entry;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1", entry.cls)}>
      <Icon className="h-3 w-3" aria-hidden />
      {entry.label}
    </span>
  );
}

export default async function DashboardCallsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: businesses } = await supabase
    .from("businesses")
    .select("id,name")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true });

  const bizIds = (businesses ?? []).map((b) => b.id);
  let logs: VoiceCallLog[] = [];
  let usage: UsageRow[] = [];
  if (bizIds.length > 0) {
    const { data: logsData } = await supabase
      .from("voice_call_logs")
      .select("*")
      .in("business_id", bizIds)
      .order("started_at", { ascending: false })
      .limit(80);
    logs = (logsData ?? []) as VoiceCallLog[];

    const { data: usageData } = await supabase
      .from("voice_call_usage_current_month")
      .select("*")
      .in("business_id", bizIds);
    usage = (usageData ?? []) as UsageRow[];
  }

  const bizNameById = new Map((businesses ?? []).map((b) => [b.id, b.name]));

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
              Voice reception
            </Badge>
            <h1 className="text-[clamp(1.45rem,3vw,2rem)] font-semibold tracking-tight text-[#0f172a]">
              Calls answered by your AI receptionist
            </h1>
            <p className="max-w-2xl text-[15px] leading-relaxed text-[#64748b]">
              Every call your Vapi agent handles lands here — caller, duration, outcome, and transcript summary. Use this to coach the AI&apos;s prompts and watch your AI-minute usage vs your plan cap.
            </p>
          </div>
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#f5f3ff] text-[#7c3aed] ring-1 ring-[#ebe7f7]">
            <PhoneForwarded className="h-7 w-7" aria-hidden />
          </span>
        </div>
      </section>

      {/* AI minutes usage cards */}
      {usage.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {usage.map((u) => {
            const used = Number(u.minutes_used ?? 0);
            const cap = u.monthly_ai_minutes_included || 0;
            const pct = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0;
            const over = Number(u.minutes_over ?? 0);
            const tone = over > 0 ? "rose" : pct >= 80 ? "amber" : "emerald";
            return (
              <div key={u.business_id} className="rounded-2xl border border-[#f1eefc] bg-white px-5 py-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">{u.business_name}</p>
                <p className="mt-1 text-[11px] font-medium uppercase text-[#64748b]">{u.subscription_tier} plan</p>
                <p className="mt-3 text-2xl font-semibold text-[#0f172a]">
                  {used.toFixed(0)}<span className="text-sm font-medium text-[#64748b]"> / {cap || "∞"} min</span>
                </p>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#f1eefc]">
                  <div
                    className={cn(
                      "h-full transition-all",
                      tone === "rose" ? "bg-rose-500" : tone === "amber" ? "bg-amber-500" : "bg-emerald-500",
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-[#64748b]">
                  {over > 0
                    ? `${over.toFixed(0)} min over cap · overage billed at €0.40/min`
                    : `${u.call_count} call${u.call_count === 1 ? "" : "s"} this month`}
                </p>
              </div>
            );
          })}
        </div>
      ) : null}

      <Card className="rounded-[22px] border border-[#ebe7f7] bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-[#0f172a]">Recent calls</CardTitle>
          <CardDescription className="text-[14px] leading-relaxed text-[#64748b]">
            Last 80 calls across your venues. New entries appear as soon as the Vapi webhook reports the call ended.
          </CardDescription>
        </CardHeader>
        <CardContent className="pb-6">
          {logs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#ebe7f7] bg-[#fafbff] px-6 py-10 text-center">
              <PhoneForwarded className="mx-auto h-8 w-8 text-[#c4b5fd]" aria-hidden />
              <p className="mt-3 text-sm font-semibold text-[#0f172a]">No calls yet</p>
              <p className="mt-1 text-sm text-[#64748b]">
                When your AI receptionist takes its first call, the caller, transcript, and outcome will appear here.
              </p>
              <Link
                href="/dashboard/setup/voice"
                className={cn(buttonVariants({ variant: "outline" }), "mt-4 rounded-full")}
              >
                Tune your AI receptionist
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-[#f1eefc]">
              <table className="w-full min-w-[800px] text-left text-sm">
                <thead className="border-b border-[#ebe7f7] bg-[#fafbff] text-[11px] font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">
                  <tr>
                    <th className="px-4 py-3">When</th>
                    <th className="px-4 py-3">Caller</th>
                    <th className="px-4 py-3">Duration</th>
                    <th className="px-4 py-3">Outcome</th>
                    <th className="px-4 py-3">Summary</th>
                    <th className="px-4 py-3">Venue</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((c) => (
                    <tr key={c.id} className="border-b border-[#f8fafc]">
                      <td className="px-4 py-3 align-top text-[#475569]">
                        <p className="font-medium text-[#0f172a]">
                          {new Date(c.started_at).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </p>
                      </td>
                      <td className="px-4 py-3 align-top">
                        {c.caller_name?.trim() ? (
                          <p className="font-medium text-[#0f172a]">{c.caller_name}</p>
                        ) : null}
                        {c.caller_phone?.trim() ? (
                          <p className="font-mono text-[12px] text-[#64748b]">{c.caller_phone}</p>
                        ) : (
                          <p className="text-[11px] text-[#94a3b8]">Unknown caller</p>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top font-mono text-[12px] text-[#475569]">
                        {formatDuration(c.duration_seconds)}
                      </td>
                      <td className="px-4 py-3 align-top">{outcomeBadge(c.outcome)}</td>
                      <td className="max-w-[320px] px-4 py-3 align-top text-[#475569]">
                        <p className="line-clamp-2 text-[13px]">{c.transcript_summary || "—"}</p>
                      </td>
                      <td className="px-4 py-3 align-top text-xs text-[#64748b]">
                        {bizNameById.get(c.business_id) ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
