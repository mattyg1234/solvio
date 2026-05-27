"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";

import { marketingLoadingDemoLabel } from "@/components/marketing/marketing-home-page";
import type { MarketingLocale } from "@/lib/marketing-locale";

const LiveDemoSection = dynamic(
  () => import("@/components/home/live-demo-section").then((m) => ({ default: m.LiveDemoSection })),
  { ssr: true },
);

function LiveDemoLoading({ locale }: { locale: MarketingLocale }) {
  return (
    <section className="border-b border-[#ebe7f7]/70 bg-[#f8fafc] py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 text-center text-sm text-[#94a3b8] sm:px-6">
        {marketingLoadingDemoLabel(locale)}
      </div>
    </section>
  );
}

export function LiveDemoSectionLazy({
  locale,
  liveVoice,
}: {
  locale: MarketingLocale;
  liveVoice: boolean;
}) {
  return (
    <Suspense fallback={<LiveDemoLoading locale={locale} />}>
      <LiveDemoSection liveVoice={liveVoice} locale={locale} />
    </Suspense>
  );
}
