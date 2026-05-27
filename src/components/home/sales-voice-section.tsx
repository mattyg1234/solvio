"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";
import { Mic } from "lucide-react";

import { cn } from "@/lib/utils";
import type { MarketingVapiConfig } from "@/lib/marketing-vapi-config";

const VapiBrandAgentPanel = dynamic(
  () => import("@/components/home/vapi-brand-agent-panel").then((m) => ({ default: m.VapiBrandAgentPanel })),
  { ssr: false },
);

const SAMPLE_LINES: { role: "user" | "assistant"; text: string }[] = [
  {
    role: "assistant",
    text: "Hey — quick question. Roughly how many calls do you think you miss each week, especially after you've closed up?",
  },
  {
    role: "user",
    text: "Honestly? Maybe 10 or 15 on a busy weekend.",
  },
  {
    role: "assistant",
    text: "That's a lot of missed bookings. Solvio's link captures those automatically, even when you're closed — guests book themselves and get confirmed straight away.",
  },
  {
    role: "user",
    text: "How long does it take to set up?",
  },
  {
    role: "assistant",
    text: "About 30 minutes for the booking link. Add the AI receptionist on Pro and it answers your calls too — all in from £50/mo with a 7-day free trial.",
  },
];

function ScriptedFallback() {
  return (
    <div className="rounded-[28px] border border-[#ebe7f7]/90 bg-[#fafbff]/80 p-6 sm:p-8">
      <div className="mb-6 flex flex-col gap-3">
        {SAMPLE_LINES.map((line, i) => (
          <div
            key={i}
            className={cn(
              "max-w-[88%] rounded-3xl px-4 py-3 text-[14px] leading-relaxed shadow-sm",
              line.role === "user"
                ? "ml-auto bg-[#f8fafc] text-[#0f172a] ring-1 ring-[#ebe7f7]"
                : "mr-auto bg-gradient-to-br from-[#7c3aed] via-[#6d28d9] to-[#5b21b6] text-white ring-1 ring-white/25",
            )}
          >
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.26em] opacity-70">
              {line.role === "user" ? "You" : "Solvio"}
            </span>
            {line.text}
          </div>
        ))}
      </div>
      <p className="text-center text-[11px] font-medium text-[#94a3b8]">
        Live voice available once{" "}
        <code className="rounded bg-[#f1f5f9] px-1 py-0.5 font-mono text-[10px]">
          NEXT_PUBLIC_VAPI_SALES_ASSISTANT_ID
        </code>{" "}
        is set.
      </p>
    </div>
  );
}

export function SalesVoiceSection({ vapiConfig }: { vapiConfig?: MarketingVapiConfig }) {
  const hasKeys = Boolean(vapiConfig?.publicKey?.trim() && vapiConfig?.assistantId?.trim());

  return (
    <section className="border-t border-[#ebe7f7]/70 bg-[#fafbff] py-20 sm:py-28">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <div className="mb-10 text-center">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#ebe7f7] bg-white px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.26em] text-[#7c3aed]">
            <Mic className="h-3 w-3" aria-hidden />
            Ask our AI
          </p>
          <h2 className="text-[clamp(1.6rem,3.5vw,2.5rem)] font-semibold tracking-tight text-[#0f172a]">
            Not sure if it&apos;s right for you?
            <br className="hidden sm:block" />
            <span className="text-[#7c3aed]"> Just ask.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-[16px] leading-relaxed text-[#64748b]">
            Tap the microphone and ask about pricing, setup, or how the AI works. Takes 2 minutes — and
            this is the same voice tech your customers would use to book with you.
          </p>
        </div>

        <div className="mx-auto max-w-lg">
          {hasKeys ? (
            <Suspense
              fallback={
                <div className="rounded-[28px] border border-[#ebe7f7] bg-[#fafbff] p-14 text-center text-sm text-[#94a3b8]">
                  Preparing voice…
                </div>
              }
            >
              <VapiBrandAgentPanel
                publicKey={vapiConfig!.publicKey}
                assistantId={vapiConfig!.assistantId}
                firstMessage={vapiConfig?.firstMessage ?? undefined}
                surface="marketing"
                locale="en"
              />
            </Suspense>
          ) : (
            <ScriptedFallback />
          )}
        </div>
      </div>
    </section>
  );
}
