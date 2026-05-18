import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, PhoneForwarded } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Calls · Dashboard · Solvio",
};

export default function DashboardCallsPage() {
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
              Calls answered like your best maître d&apos;
            </h1>
            <p className="max-w-2xl text-[15px] leading-relaxed text-[#64748b]">
              Plug Vapi or ElevenLabs and Solvio archives transcripts, routes bilingual intents and hands warm transfers when humans need to jump in.
            </p>
          </div>
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#f5f3ff] text-[#7c3aed] ring-1 ring-[#ebe7f7]">
            <PhoneForwarded className="h-7 w-7" aria-hidden />
          </span>
        </div>
      </section>

      <Card className="rounded-[22px] border border-[#ebe7f7] bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-[#0f172a]">Call intelligence queue</CardTitle>
          <CardDescription className="text-[15px] leading-relaxed text-[#64748b]">
            Summaries, sentiment tags and booking intents populate automatically once telephony pipes connect — until then treat this page as your rollout checklist.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 pb-8 md:grid-cols-3">
          {[
            { title: "Latency guardrails", body: "Failover prompts keep callers informed when APIs stall." },
            { title: "Brand tone packs", body: "Swap playful vs formal scripts without redeploying infra." },
            { title: "Human takeover", body: "Escalations ping Slack or SMS with transcript context." },
          ].map((item) => (
            <div key={item.title} className="rounded-2xl border border-[#f1eefc] bg-[#fafbff] px-4 py-4">
              <p className="text-sm font-semibold text-[#0f172a]">{item.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-[#64748b]">{item.body}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
