import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { getMarketingCopy } from "@/lib/marketing-copy";
import type { MarketingLocale } from "@/lib/marketing-locale";
import { bookingDemoHref } from "@/lib/marketing-links";
import { cn } from "@/lib/utils";

const tierHrefs = ["/signup", "/signup?intent=pro", "/signup?intent=enterprise"] as const;

export function PricingSection({ locale = "en" }: { locale?: MarketingLocale }) {
  const copy = getMarketingCopy(locale).pricing;

  return (
    <section id="pricing" className="border-b border-[#ebe7f7]/70 bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#94a3b8]">{copy.eyebrow}</p>
          <h2 className="mt-4 text-[clamp(1.95rem,4vw,2.75rem)] font-semibold tracking-tight text-[#0f172a]">
            {copy.title}
          </h2>
          <p className="mt-5 text-[17px] leading-relaxed text-[#64748b]">{copy.subtitle}</p>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {copy.tiers.map((tier, idx) => {
            const href = tierHrefs[idx] ?? "/signup";
            const highlight = idx === 0;
            return (
              <div
                key={tier.name}
                className={cn(
                  "flex flex-col rounded-[28px] border p-8 shadow-sm",
                  highlight
                    ? "border-[#c4b5fd] bg-gradient-to-b from-[#faf7ff] to-white shadow-[0_28px_90px_-58px_rgba(124,58,237,0.35)]"
                    : "border-[#ebe7f7] bg-[#fafbff]/50",
                )}
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#7c3aed]">{tier.badge}</p>
                <h3 className="mt-3 text-2xl font-semibold text-[#0f172a]">{tier.name}</h3>
                <ul className="mt-6 flex-1 space-y-2 text-[15px] text-[#475569]">
                  {tier.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <span className="text-[#7c3aed]" aria-hidden>
                        ✓
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href={href}
                  className={cn(
                    buttonVariants({ variant: highlight ? "default" : "outline", size: "lg" }),
                    "mt-8 inline-flex h-12 w-full justify-center rounded-full font-semibold",
                  )}
                >
                  {tier.cta}
                </Link>
              </div>
            );
          })}
        </div>

        <p className="mx-auto mt-10 max-w-xl text-center text-sm text-[#94a3b8]">
          {copy.footnote}{" "}
          <Link href={bookingDemoHref()} className="font-semibold text-[#7c3aed] hover:underline">
            {copy.footnoteLink}
          </Link>
        </p>
      </div>
    </section>
  );
}
