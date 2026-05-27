"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";

import type { MarketingVapiConfig } from "@/lib/marketing-vapi-config";
import { getMarketingCopy } from "@/lib/marketing-copy";
import type { MarketingLocale } from "@/lib/marketing-locale";
import { VoiceDemoPanel } from "@/components/home/voice-demo-panel";

const VapiBrandAgentPanel = dynamic(
  () =>
    import("@/components/home/vapi-brand-agent-panel").then((m) => ({
      default: m.VapiBrandAgentPanel,
    })),
  { ssr: false },
);

function trimmedPublicEnv(name: string): string {
  const v = process.env[name];
  return typeof v === "string" ? v.trim() : "";
}

function VoicePreparingFallback({ locale }: { locale: MarketingLocale }) {
  return (
    <div className="relative overflow-hidden rounded-[28px] border border-[#ebe7f7]/90 bg-[#fafbff]/80 p-14 shadow-inner">
      <p className="text-center text-sm font-medium text-[#94a3b8]">{getMarketingCopy(locale).voice.preparing}</p>
    </div>
  );
}

export function MarketingSiteVoice({
  className,
  heroAutoPlay = false,
  surface = "marketing",
  vapiConfig,
  locale = "en",
}: {
  className?: string;
  /** Only used when the scripted preview is showing instead of interactive voice. */
  heroAutoPlay?: boolean;
  surface?: "marketing" | "onboarding";
  /** When provided from SSR, avoids relying on client-only env for assistant id. */
  vapiConfig?: Pick<MarketingVapiConfig, "publicKey" | "assistantId" | "firstMessage" | "live">;
  locale?: MarketingLocale;
}) {
  const publicKey = vapiConfig?.publicKey?.trim() || trimmedPublicEnv("NEXT_PUBLIC_VAPI_PUBLIC_KEY");
  const assistantId = vapiConfig?.assistantId?.trim() || trimmedPublicEnv("NEXT_PUBLIC_VAPI_ASSISTANT_ID");

  if (publicKey && assistantId) {
    return (
      <Suspense fallback={<VoicePreparingFallback locale={locale} />}>
        <VapiBrandAgentPanel
          surface={surface}
          publicKey={publicKey}
          assistantId={assistantId}
          firstMessage={vapiConfig?.firstMessage ?? undefined}
          className={className}
          locale={locale}
        />
      </Suspense>
    );
  }

  return (
    <VoiceDemoPanel scenario="personal_voice" autoPlay={heroAutoPlay} className={className} locale={locale} />
  );
}

export function marketingSiteHasLiveVapi(
  vapiConfig?: Pick<MarketingVapiConfig, "live" | "publicKey" | "assistantId">,
): boolean {
  if (vapiConfig?.live) return true;
  return Boolean(trimmedPublicEnv("NEXT_PUBLIC_VAPI_PUBLIC_KEY") && trimmedPublicEnv("NEXT_PUBLIC_VAPI_ASSISTANT_ID"));
}
