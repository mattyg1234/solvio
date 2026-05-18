import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { GrowthSection } from "@/components/home/growth-section";
import { HeroSection } from "@/components/home/hero-section";
import { LiveDemoSection } from "@/components/home/live-demo-section";
import { SocialProofSection } from "@/components/home/social-proof-section";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="bg-white">
        <HeroSection />
        <GrowthSection />
        <SocialProofSection />
        <LiveDemoSection />
      </main>
      <SiteFooter />
    </>
  );
}
