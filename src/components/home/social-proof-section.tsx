import { Card } from "@/components/ui/card";
import { MarketingTrustStats } from "@/components/home/marketing-trust-stats";
import { getMarketingCopy } from "@/lib/marketing-copy";
import type { MarketingLocale } from "@/lib/marketing-locale";

export function SocialProofSection({ locale = "en" }: { locale?: MarketingLocale }) {
  const copy = getMarketingCopy(locale).social;

  return (
    <section id="proof" className="border-b border-[#ebe7f7]/70 bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-xl space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#94a3b8]">{copy.eyebrow}</p>
            <h2 className="text-[clamp(1.95rem,4vw,2.75rem)] font-semibold tracking-tight text-[#0f172a]">
              {copy.title}
            </h2>
            <p className="text-[17px] leading-relaxed text-[#64748b]">{copy.disclaimer}</p>
          </div>
        </div>

        <div className="mt-12">
          <MarketingTrustStats locale={locale} />
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {copy.stories.map((story) => (
            <Card
              key={story.biz}
              className="relative flex h-full flex-col rounded-[26px] border border-[#ebe7f7] bg-[#fafbff] p-8 shadow-none ring-1 ring-[#f5f3ff]"
            >
              <span className="absolute right-4 top-4 rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#94a3b8] ring-1 ring-[#ebe7f7]">
                Illustrative
              </span>
              <p className="mt-6 text-[15px] leading-relaxed text-[#0f172a]">&ldquo;{story.quote}&rdquo;</p>
              <div className="mt-auto pt-8">
                <p className="text-sm font-semibold text-[#0f172a]">{story.biz}</p>
                <p className="text-xs text-[#64748b]">{story.owner}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="inline-flex rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#7c3aed] ring-1 ring-[#ebe7f7]">
                    {story.metric}
                  </span>
                  <span className="inline-flex rounded-full bg-[#f5f3ff] px-3 py-1.5 text-[11px] font-semibold text-[#5b21b6] ring-1 ring-[#ede9fe]">
                    {story.money}
                  </span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
