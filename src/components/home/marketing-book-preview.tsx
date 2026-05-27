import Link from "next/link";
import { CalendarCheck, CreditCard, Lock } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { getMarketingCopy } from "@/lib/marketing-copy";
import type { MarketingLocale } from "@/lib/marketing-locale";
import { bookingDemoHref } from "@/lib/marketing-links";
import { cn } from "@/lib/utils";

/** Static mockup — shows merchants what guests see on /book (no screenshot asset required). */
export function MarketingBookPreview({ locale = "en" }: { locale?: MarketingLocale }) {
  const copy = getMarketingCopy(locale).bookPreview;

  return (
    <section className="border-b border-[#ebe7f7]/70 bg-white py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div className="space-y-5">
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#94a3b8]">{copy.eyebrow}</p>
            <h2 className="text-[clamp(1.75rem,3.5vw,2.35rem)] font-semibold tracking-tight text-[#0f172a]">
              {copy.title}
            </h2>
            <p className="text-[17px] leading-relaxed text-[#64748b]">{copy.subtitle}</p>
            <Link
              href={bookingDemoHref()}
              className={cn(
                buttonVariants({ variant: "outline" }),
                "inline-flex h-11 rounded-full border-[#c4b5fd] px-6 font-semibold text-[#5b21b6] hover:bg-[#ede9fe]",
              )}
            >
              {copy.cta}
            </Link>
          </div>

          <div className="relative mx-auto w-full max-w-sm">
            <div className="pointer-events-none absolute -inset-4 rounded-[32px] bg-[#ede9fe]/40 blur-2xl" aria-hidden />
            <div className="relative overflow-hidden rounded-[28px] border border-[#ebe7f7] bg-[#fafbff] shadow-[0_32px_90px_-48px_rgba(124,58,237,0.45)]">
              <div className="border-b border-[#ebe7f7] bg-white px-5 py-4 text-center">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#ede9fe] text-lg font-bold text-[#5b21b6]">
                  CA
                </div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#94a3b8]">{copy.mockVenue}</p>
                <p className="mt-1 text-lg font-semibold text-[#0f172a]">{copy.mockHeading}</p>
                <p className="mt-1 text-[12px] text-[#64748b]">{copy.mockAddress}</p>
              </div>
              <div className="space-y-3 p-4">
                {copy.mockSteps.map((row, idx) => (
                  <div key={row.title} className="rounded-xl border border-[#ebe7f7] bg-white px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#ede9fe] text-xs font-bold text-[#5b21b6]">
                        {idx + 1}
                      </span>
                      <div>
                        <p className="text-[13px] font-semibold text-[#0f172a]">{row.title}</p>
                        <p className="text-[12px] text-[#64748b]">{row.body}</p>
                      </div>
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-center gap-2 rounded-full bg-[#7c3aed] px-4 py-3 text-[13px] font-semibold text-white shadow-md shadow-[#7c3aed]/25">
                  <Lock className="h-3.5 w-3.5" aria-hidden />
                  {copy.mockContinue}
                </div>
                <p className="flex items-center justify-center gap-1.5 text-[11px] text-[#94a3b8]">
                  <CreditCard className="h-3 w-3" aria-hidden />
                  {copy.trustLine}
                </p>
              </div>
              <div className="border-t border-[#ebe7f7] bg-white px-4 py-3 text-center text-[10px] text-[#94a3b8]">
                <CalendarCheck className="mx-auto mb-1 h-4 w-4 text-[#7c3aed]" aria-hidden />
                {copy.mockConfirmation}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
