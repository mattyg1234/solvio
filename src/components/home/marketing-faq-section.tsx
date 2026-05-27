import Link from "next/link";

import { getMarketingCopy } from "@/lib/marketing-copy";
import type { MarketingLocale } from "@/lib/marketing-locale";

export function MarketingFaqSection({ locale = "en" }: { locale?: MarketingLocale }) {
  const copy = getMarketingCopy(locale).faq;

  return (
    <section id="faq" className="border-b border-[#ebe7f7]/70 bg-[#f8fafc] py-20 sm:py-28">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#94a3b8]">{copy.eyebrow}</p>
          <h2 className="mt-4 text-[clamp(1.75rem,3.5vw,2.35rem)] font-semibold tracking-tight text-[#0f172a]">
            {copy.title}
          </h2>
        </div>

        <dl className="mt-12 space-y-4">
          {copy.items.map((item) => (
            <div key={item.q} className="rounded-[20px] border border-[#ebe7f7] bg-white px-5 py-5 shadow-sm">
              <dt className="text-[15px] font-semibold text-[#0f172a]">{item.q}</dt>
              <dd className="mt-2 text-[15px] leading-relaxed text-[#64748b]">{item.a}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-10 text-center text-sm text-[#64748b]">
          {copy.legalPrefix}{" "}
          <Link href="/privacy" className="font-semibold text-[#7c3aed] hover:underline">
            {copy.privacy}
          </Link>{" "}
          and{" "}
          <Link href="/terms" className="font-semibold text-[#7c3aed] hover:underline">
            {copy.terms}
          </Link>
          .
        </p>
      </div>
    </section>
  );
}
