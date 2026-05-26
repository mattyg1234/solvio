import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { CommerceSection } from "@/components/home/commerce-section";
import { GrowthSection } from "@/components/home/growth-section";
import { HeroSection } from "@/components/home/hero-section";
import { LiveDemoSection } from "@/components/home/live-demo-section";
import { PricingSection } from "@/components/home/pricing-section";
import { SocialProofSection } from "@/components/home/social-proof-section";
import { loadMarketingVapiConfig } from "@/lib/marketing-vapi-server";

export default async function Home() {
  const vapiConfig = await loadMarketingVapiConfig();

  return (
    <>
      <SiteHeader />
      <main className="bg-white">
        <HeroSection vapiConfig={vapiConfig} />
        <GrowthSection />
        <CommerceSection />
        <PricingSection />
        <SocialProofSection />
        <LiveDemoSection />
      </main>
      <SiteFooter />
    </>
  );
}
