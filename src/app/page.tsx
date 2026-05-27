import dynamic from "next/dynamic";

import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { CommerceSection } from "@/components/home/commerce-section";
import { GrowthSection } from "@/components/home/growth-section";
import { HeroGoLiveStrip } from "@/components/home/hero-go-live-strip";
import { HeroSection } from "@/components/home/hero-section";
import { MarketingBookPreview } from "@/components/home/marketing-book-preview";
import { MarketingFaqSection } from "@/components/home/marketing-faq-section";
import { PricingSection } from "@/components/home/pricing-section";
import { SocialProofSection } from "@/components/home/social-proof-section";
import { loadMarketingVapiConfig } from "@/lib/marketing-vapi-server";

const LiveDemoSection = dynamic(
  () => import("@/components/home/live-demo-section").then((m) => ({ default: m.LiveDemoSection })),
  {
    loading: () => (
      <section className="border-b border-[#ebe7f7]/70 bg-[#f8fafc] py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-4 text-center text-sm text-[#94a3b8] sm:px-6">Loading demo…</div>
      </section>
    ),
  },
);

function marketingVoiceLive(config: Awaited<ReturnType<typeof loadMarketingVapiConfig>>): boolean {
  return Boolean(config.live || (config.publicKey?.trim() && config.assistantId?.trim()));
}

export default async function Home() {
  const vapiConfig = await loadMarketingVapiConfig();
  const liveVoice = marketingVoiceLive(vapiConfig);

  return (
    <>
      <SiteHeader />
      <main className="bg-white">
        <HeroSection vapiConfig={vapiConfig} />
        <HeroGoLiveStrip />
        <GrowthSection />
        <CommerceSection />
        <MarketingBookPreview />
        <PricingSection />
        <MarketingFaqSection />
        <SocialProofSection />
        <LiveDemoSection liveVoice={liveVoice} />
      </main>
      <SiteFooter />
    </>
  );
}
