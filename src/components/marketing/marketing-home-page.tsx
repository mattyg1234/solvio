import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { CommerceSection } from "@/components/home/commerce-section";
import { GrowthSection } from "@/components/home/growth-section";
import { HeroGoLiveStrip } from "@/components/home/hero-go-live-strip";
import { HeroSection } from "@/components/home/hero-section";
import { MarketingBookPreview } from "@/components/home/marketing-book-preview";
import { MarketingFaqSection } from "@/components/home/marketing-faq-section";
import { PricingSection } from "@/components/home/pricing-section";
import { SalesVoiceSection } from "@/components/home/sales-voice-section";
import { SocialProofSection } from "@/components/home/social-proof-section";
import { LiveDemoSectionLazy } from "@/components/marketing/live-demo-section-lazy";
import { getMarketingCopy } from "@/lib/marketing-copy";
import type { MarketingLocale } from "@/lib/marketing-locale";
import { loadMarketingVapiConfig, loadSalesVapiConfig } from "@/lib/marketing-vapi-server";

function marketingVoiceLive(config: Awaited<ReturnType<typeof loadMarketingVapiConfig>>): boolean {
  return Boolean(config.live || (config.publicKey?.trim() && config.assistantId?.trim()));
}

export async function MarketingHomePage({ locale }: { locale: MarketingLocale }) {
  const [vapiConfig, salesVapiConfig] = await Promise.all([
    loadMarketingVapiConfig(locale),
    loadSalesVapiConfig(),
  ]);
  const liveVoice = marketingVoiceLive(vapiConfig);

  return (
    <div lang={locale}>
      <SiteHeader locale={locale} />
      <main className="bg-white">
        <HeroSection vapiConfig={vapiConfig} locale={locale} />
        <HeroGoLiveStrip locale={locale} />
        <GrowthSection locale={locale} />
        <CommerceSection locale={locale} />
        <MarketingBookPreview locale={locale} />
        <PricingSection locale={locale} />
        <SalesVoiceSection vapiConfig={salesVapiConfig} />
        <MarketingFaqSection locale={locale} />
        <SocialProofSection locale={locale} />
        <LiveDemoSectionLazy liveVoice={liveVoice} locale={locale} />
      </main>
      <SiteFooter locale={locale} />
    </div>
  );
}

export function marketingLoadingDemoLabel(locale: MarketingLocale): string {
  return getMarketingCopy(locale).loadingDemo;
}
