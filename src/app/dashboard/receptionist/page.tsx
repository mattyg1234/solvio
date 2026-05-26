import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck2,
  CheckCircle2,
  CircleAlert,
  Mic2,
  PhoneCall,
  PhoneForwarded,
  PhoneIncoming,
  PhoneOutgoing,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BOOKING_DEMO_AI_MINUTES, PRO_AI_MINUTES, PRO_MONTHLY_GBP } from "@/lib/solvio-pricing";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Receptionist · Dashboard · Solvio",
};

type VoiceCallLog = {
  id: string;
  caller_phone: string | null;
  caller_name: string | null;
  started_at: string;
  duration_seconds: number;
  outcome: string | null;
  transcript_summary: string | null;
};

function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  if (m === 0) return `${r}s`;
  return `${m}m ${String(r).padStart(2, "0")}s`;
}

function extractAssistantId(details: unknown): string | null {
  if (!details || typeof details !== "object") return null;
  const id = (details as Record<string, unknown>).vapi_assistant_id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

export default async function DashboardReceptionistPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  /** Graceful fallback: phone-number columns may not be migrated yet on older Supabase projects. */
  let business: {
    id: string;
    name: string;
    voiceComplete: boolean;
    bookingComplete: boolean;
    assistantId: string | null;
    phoneE164: string | null;
    phoneCountry: string | null;
    subscriptionTier: string;
    monthlyAiMinutesIncluded: number;
  } | null = null;
  let migrationPending = false;

  const full = await supabase
    .from("businesses")
    .select(
      "id,name,voice_receptionist_completed_at,booking_flow_completed_at,voice_receptionist_details,phone_number_e164,phone_number_country,subscription_tier,monthly_ai_minutes_included",
    )
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (full.error && /phone_number_e164|phone_number_country|does not exist|undefined column/i.test(full.error.message)) {
    migrationPending = true;
    const basic = await supabase
      .from("businesses")
      .select(
        "id,name,voice_receptionist_completed_at,booking_flow_completed_at,voice_receptionist_details",
      )
      .eq("owner_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (basic.data) {
      business = {
        id: basic.data.id as string,
        name: (basic.data.name as string) ?? "",
        voiceComplete: Boolean(basic.data.voice_receptionist_completed_at),
        bookingComplete: Boolean(basic.data.booking_flow_completed_at),
        assistantId: extractAssistantId(basic.data.voice_receptionist_details),
        phoneE164: null,
        phoneCountry: null,
        subscriptionTier: "trial",
        monthlyAiMinutesIncluded: 50,
      };
    }
  } else if (full.data) {
    business = {
      id: full.data.id as string,
      name: (full.data.name as string) ?? "",
      voiceComplete: Boolean(full.data.voice_receptionist_completed_at),
      bookingComplete: Boolean(full.data.booking_flow_completed_at),
      assistantId: extractAssistantId(full.data.voice_receptionist_details),
      phoneE164: (full.data.phone_number_e164 as string | null) ?? null,
      phoneCountry: (full.data.phone_number_country as string | null) ?? null,
      subscriptionTier: (full.data.subscription_tier as string | null) ?? "trial",
      monthlyAiMinutesIncluded: (full.data.monthly_ai_minutes_included as number | null) ?? 50,
    };
  }

  if (!business) {
    return (
      <div className="space-y-6">
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Add a business in Settings before opening Receptionist.
        </p>
      </div>
    );
  }

  let recentCalls: VoiceCallLog[] = [];
  const { data: callRows } = await supabase
    .from("voice_call_logs")
    .select("id,caller_phone,caller_name,started_at,duration_seconds,outcome,transcript_summary")
    .eq("business_id", business.id)
    .order("started_at", { ascending: false })
    .limit(5);
  recentCalls = (callRows ?? []) as VoiceCallLog[];

  const voiceReady = business.voiceComplete && Boolean(business.assistantId);
  const numberReady = Boolean(business.phoneE164);
  const bookingsReady = business.bookingComplete;
  const isBookingTier = business.subscriptionTier === "booking";

  // Current month AI minutes used
  let minutesUsedThisMonth = 0;
  if (isBookingTier) {
    const startOfMonth = new Date();
    startOfMonth.setUTCDate(1);
    startOfMonth.setUTCHours(0, 0, 0, 0);
    const { data: usageRows } = await supabase
      .from("voice_call_logs")
      .select("duration_minutes_billable")
      .eq("business_id", business.id)
      .gte("started_at", startOfMonth.toISOString());
    minutesUsedThisMonth = (usageRows ?? []).reduce(
      (sum, r) => sum + (Number(r.duration_minutes_billable) || 0),
      0,
    );
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

      {/* Demo minutes banner — Booking tier only */}
      {isBookingTier && (
        <div className="flex flex-col gap-3 rounded-[20px] border border-amber-200 bg-amber-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-amber-900">
              Demo AI minutes — {Math.round(minutesUsedThisMonth * 10) / 10} of {business.monthlyAiMinutesIncluded} used this month
            </p>
            <p className="text-xs text-amber-700">
              You&apos;re on the Booking plan — {BOOKING_DEMO_AI_MINUTES} demo minutes to test calls, not for live receptionist volume.
              Want to really maximise your sales with your AI receptionist? Upgrade to Pro for {PRO_AI_MINUTES.toLocaleString("en-GB")} minutes/month.
            </p>
          </div>
          <Link
            href="/dashboard/pricing"
            className={cn(
              buttonVariants({ variant: "default" }),
              "h-9 shrink-0 rounded-full px-5 text-sm font-semibold shadow-md shadow-[#7c3aed]/20",
            )}
          >
            Upgrade to Pro · £{PRO_MONTHLY_GBP}/mo →
          </Link>
        </div>
      )}

      <section className="relative overflow-hidden rounded-[28px] border border-[#ebe7f7]/90 bg-gradient-to-br from-white via-[#fafbff] to-[#f8fafc] p-8 shadow-[0_28px_90px_-58px_rgba(124,58,237,0.28)] md:p-10">
        <div className="pointer-events-none absolute right-8 top-10 h-32 w-32 rounded-full bg-[#c4b5fd]/25 blur-3xl" aria-hidden />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-3">
            <Badge className="rounded-full bg-[#ede9fe] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#5b21b6] hover:bg-[#ede9fe]">
              AI receptionist
            </Badge>
            <h1 className="text-[clamp(1.45rem,3vw,2rem)] font-semibold tracking-tight text-[#0f172a]">
              Your AI receptionist for {business.name || "your venue"}
            </h1>
            <p className="max-w-2xl text-[15px] leading-relaxed text-[#64748b]">
              Configure the voice, claim a number, and watch every call land here with a transcript and outcome.
              Already wired into your booking diary — the receptionist can quote availability and confirm a booking on the call.
            </p>
          </div>
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#f5f3ff] text-[#7c3aed] ring-1 ring-[#ebe7f7]">
            <Mic2 className="h-7 w-7" aria-hidden />
          </span>
        </div>
      </section>

      {migrationPending ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold">Phone-number columns aren&apos;t in your database yet.</p>
          <p className="mt-1">
            Open <Link href="/dashboard/phone" className="font-semibold underline">Phone numbers</Link> for the SQL to run in Supabase, then come back.
          </p>
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-3">
        <StatusCard
          ready={voiceReady}
          icon={Mic2}
          title="Voice configured"
          readyLabel="Greeting, voice, and prompt are live."
          notReadyLabel="Pick a voice and write your opening line."
          ctaHref="/dashboard/setup/voice"
          ctaLabel={voiceReady ? "Tune voice" : "Set up voice"}
        />
        <StatusCard
          ready={numberReady}
          icon={PhoneCall}
          title="Inbound number"
          readyLabel={business.phoneE164 ? `Live on ${business.phoneE164}.` : "Your own number is live."}
          notReadyLabel="Claim a number so customers can call you."
          ctaHref="/dashboard/phone"
          ctaLabel={numberReady ? "Manage number" : "Claim a number"}
        />
        <StatusCard
          ready={bookingsReady}
          icon={CalendarCheck2}
          title="Connected to bookings"
          readyLabel="Receptionist can quote slots and book on the call."
          notReadyLabel="Finish booking setup so the AI can book guests."
          ctaHref="/dashboard/setup/bookings"
          ctaLabel={bookingsReady ? "Edit booking flow" : "Set up bookings"}
        />
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Card className="rounded-[22px] border border-[#ebe7f7] bg-white shadow-sm">
          <CardHeader className="space-y-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#ede9fe] text-[#5b21b6]">
              <PhoneOutgoing className="h-4 w-4" aria-hidden />
            </span>
            <CardTitle className="text-lg text-[#0f172a]">Outbound calls — already working</CardTitle>
            <CardDescription className="text-[14px] leading-relaxed text-[#64748b]">
              You can already make outbound calls with the shared Solvio Twilio US number — campaigns, callbacks,
              and reminders dial from it out of the box. If you really want that personal feel (local caller ID,
              recognised area code), <Link href="/dashboard/phone" className="font-semibold text-[#5b21b6] underline">claim your own number here</Link>.
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-6">
            <Link
              href="/dashboard/campaigns"
              className={cn(buttonVariants({ variant: "outline" }), "rounded-full text-sm font-semibold")}
            >
              Open campaigns
              <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
            </Link>
          </CardContent>
        </Card>

        <Card
          className={cn(
            "rounded-[22px] shadow-sm",
            numberReady
              ? "border border-[#ebe7f7] bg-white"
              : "border border-amber-200 bg-gradient-to-br from-amber-50/80 to-white",
          )}
        >
          <CardHeader className="space-y-2">
            <span
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-xl",
                numberReady ? "bg-[#ede9fe] text-[#5b21b6]" : "bg-amber-100 text-amber-900",
              )}
            >
              <PhoneIncoming className="h-4 w-4" aria-hidden />
            </span>
            <CardTitle className="text-lg text-[#0f172a]">
              {numberReady ? "Inbound calls — live" : "Inbound calls — need a number first"}
            </CardTitle>
            <CardDescription className="text-[14px] leading-relaxed text-[#64748b]">
              {numberReady ? (
                <>
                  Customers calling{" "}
                  <span className="font-semibold text-[#0f172a]">{business.phoneE164}</span> reach your AI receptionist.
                  Transcripts and outcomes land below.
                </>
              ) : (
                <>
                  Incoming calls <span className="font-semibold text-[#0f172a]">won&apos;t work</span> until you claim a
                  number of your own — Twilio needs an inbound route, and the shared outbound number can&apos;t receive
                  calls.
                </>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-6">
            <Link
              href="/dashboard/phone"
              className={cn(
                buttonVariants({ variant: numberReady ? "outline" : "default" }),
                "rounded-full text-sm font-semibold",
                !numberReady && "shadow-md shadow-[#7c3aed]/20",
              )}
            >
              {numberReady ? "Manage number" : "Claim a number"}
              <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
            </Link>
          </CardContent>
        </Card>
      </section>

      <Card className="rounded-[22px] border border-[#ebe7f7] bg-white shadow-sm">
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="text-lg text-[#0f172a]">Recent calls</CardTitle>
            <CardDescription className="text-[14px] text-[#64748b]">
              Latest 5 calls handled by your receptionist.
            </CardDescription>
          </div>
          <Link
            href="/dashboard/calls"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "rounded-full text-xs font-semibold")}
          >
            See all calls
          </Link>
        </CardHeader>
        <CardContent className="pb-6">
          {recentCalls.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#ebe7f7] bg-[#fafbff] px-6 py-10 text-center">
              <PhoneForwarded className="mx-auto h-8 w-8 text-[#c4b5fd]" aria-hidden />
              <p className="mt-3 text-sm font-semibold text-[#0f172a]">No calls yet</p>
              <p className="mt-1 text-sm text-[#64748b]">
                {numberReady
                  ? "When your AI receptionist takes its first call, the transcript and outcome will appear here."
                  : "Claim a number above so customers can call your receptionist."}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-[#f1eefc]">
              {recentCalls.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[#0f172a]">
                      {c.caller_name?.trim() || c.caller_phone?.trim() || "Unknown caller"}
                    </p>
                    <p className="text-xs text-[#64748b]">
                      {new Date(c.started_at).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}{" "}
                      · {formatDuration(c.duration_seconds)}
                      {c.outcome ? <> · {c.outcome}</> : null}
                    </p>
                    {c.transcript_summary ? (
                      <p className="mt-1 line-clamp-2 text-xs text-[#94a3b8]">{c.transcript_summary}</p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="flex items-center gap-2 text-xs text-[#94a3b8]">
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
        Calls run on Vapi + ElevenLabs · transcripts stored encrypted in your Supabase project.
      </p>
    </div>
  );
}

function StatusCard(props: {
  ready: boolean;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: string;
  readyLabel: string;
  notReadyLabel: string;
  ctaHref: string;
  ctaLabel: string;
}) {
  const { ready, icon: Icon, title, readyLabel, notReadyLabel, ctaHref, ctaLabel } = props;
  return (
    <div
      className={cn(
        "flex flex-col rounded-2xl border p-5 shadow-sm",
        ready ? "border-[#ebe7f7] bg-white" : "border-amber-200 bg-amber-50/40",
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-xl",
            ready ? "bg-emerald-50 text-emerald-700" : "bg-amber-100 text-amber-900",
          )}
        >
          {ready ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : <CircleAlert className="h-4 w-4" aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[#94a3b8]">
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {title}
          </p>
          <p className="mt-0.5 text-sm font-semibold text-[#0f172a]">{ready ? readyLabel : notReadyLabel}</p>
        </div>
      </div>
      <Link
        href={ctaHref}
        className={cn(
          buttonVariants({ variant: ready ? "outline" : "default", size: "sm" }),
          "mt-4 rounded-full text-xs font-semibold",
          !ready && "shadow-md shadow-[#7c3aed]/15",
        )}
      >
        {ready ? <Sparkles className="mr-1 inline h-3.5 w-3.5" aria-hidden /> : null}
        {ctaLabel}
      </Link>
    </div>
  );
}
