import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { BackOfficeSection } from "@/components/home/back-office-section";
import { CommerceSection } from "@/components/home/commerce-section";
import { GrowthSection } from "@/components/home/growth-section";
import { HeroGoLiveStrip } from "@/components/home/hero-go-live-strip";
import { HeroSection } from "@/components/home/hero-section";
import { MarketingBookPreview } from "@/components/home/marketing-book-preview";
import { MarketingFaqSection } from "@/components/home/marketing-faq-section";
import { SocialProofSection } from "@/components/home/social-proof-section";
import { LiveDemoSectionLazy } from "@/components/marketing/live-demo-section-lazy";
import { getMarketingCopy } from "@/lib/marketing-copy";
import type { MarketingLocale } from "@/lib/marketing-locale";
import { loadMarketingVapiConfig } from "@/lib/marketing-vapi-server";

function marketingVoiceLive(config: Awaited<ReturnType<typeof loadMarketingVapiConfig>>): boolean {
  return Boolean(config.live || (config.publicKey?.trim() && config.assistantId?.trim()));
}

export async function MarketingHomePage({ locale }: { locale: MarketingLocale }) {
  const vapiConfig = await loadMarketingVapiConfig(locale);
  const liveVoice = marketingVoiceLive(vapiConfig);

  return (
    <div lang={locale}>
      <SiteHeader locale={locale} />
      <main className="bg-white">
        <HeroSection vapiConfig={vapiConfig} locale={locale} />
        <HeroGoLiveStrip locale={locale} />
        <BackOfficeSection locale={locale} />
        <GrowthSection locale={locale} />
        <CommerceSection locale={locale} />
        <MarketingBookPreview locale={locale} />
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
