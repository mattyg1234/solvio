import Link from "next/link";
import { ArrowRight, CalendarRange, CreditCard, Link2 } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { getMarketingCopy } from "@/lib/marketing-copy";
import type { MarketingLocale } from "@/lib/marketing-locale";
import { bookingDemoHref } from "@/lib/marketing-links";
import { cn } from "@/lib/utils";

const stepIcons = [CalendarRange, CreditCard, Link2] as const;

export function HeroGoLiveStrip({ locale = "en" }: { locale?: MarketingLocale }) {
  const copy = getMarketingCopy(locale).goLive;

  return (
    <section className="border-b border-[#ebe7f7]/70 bg-[#fafbff] py-12 sm:py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-xl space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#94a3b8]">{copy.eyebrow}</p>
            <h2 className="text-[clamp(1.5rem,3vw,2rem)] font-semibold tracking-tight text-[#0f172a]">{copy.title}</h2>
            <p className="text-[15px] leading-relaxed text-[#64748b]">{copy.subtitle}</p>
          </div>
          <Link
            href={bookingDemoHref()}
            className={cn(
              buttonVariants({ variant: "outline" }),
              "inline-flex h-11 shrink-0 items-center gap-2 rounded-full border-[#c4b5fd] px-5 text-sm font-semibold text-[#5b21b6] hover:bg-[#ede9fe]",
            )}
          >
            {copy.cta}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>

        <ol className="mt-10 grid gap-4 sm:grid-cols-3">
          {copy.steps.map((step, idx) => {
            const Icon = stepIcons[idx] ?? CalendarRange;
            return (
              <li key={step.title} className="rounded-[22px] border border-[#ebe7f7] bg-white p-6 shadow-sm">
                <div className="flex items-start gap-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f5f3ff] text-[#7c3aed] ring-1 ring-[#ebe7f7]">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">
                      {copy.stepLabel(idx + 1)}
                    </p>
                    <p className="mt-1 text-[15px] font-semibold text-[#0f172a]">{step.title}</p>
                    <p className="mt-2 text-[14px] leading-relaxed text-[#64748b]">{step.body}</p>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
