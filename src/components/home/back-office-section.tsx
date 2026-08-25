import Link from "next/link";
import {
  FileText,
  Link2,
  Mail,
  Receipt,
  Server,
  WalletCards,
} from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { getMarketingCopy } from "@/lib/marketing-copy";
import type { MarketingLocale } from "@/lib/marketing-locale";
import { cn } from "@/lib/utils";

const icons = [FileText, WalletCards, Server, Mail, Link2, Receipt] as const;

export function BackOfficeSection({ locale = "en" }: { locale?: MarketingLocale }) {
  const copy = getMarketingCopy(locale).backOffice;

  return (
    <section id="ops" className="border-b border-[#ebe7f7]/70 bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#94a3b8]">{copy.eyebrow}</p>
          <h2 className="mt-4 text-[clamp(1.95rem,4vw,2.85rem)] font-semibold tracking-tight text-[#0f172a]">
            {copy.title}
          </h2>
          <p className="mt-5 text-[17px] leading-relaxed text-[#64748b]">{copy.subtitle}</p>
        </div>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {copy.pillars.map((pillar, idx) => {
            const Icon = icons[idx] ?? Server;
            return (
              <article
                key={pillar.title}
                className="rounded-[26px] border border-[#ebe7f7] bg-[#f8fafc] p-7 transition-shadow hover:shadow-[0_28px_90px_-58px_rgba(15,23,42,0.35)]"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#0f766e] ring-1 ring-[#ebe7f7]">
                  <Icon className="h-5 w-5" aria-hidden strokeWidth={2} />
                </div>
                <h3 className="mt-5 text-lg font-semibold tracking-tight text-[#0f172a]">{pillar.title}</h3>
                <p className="mt-3 text-[15px] leading-relaxed text-[#64748b]">{pillar.body}</p>
              </article>
            );
          })}
        </div>

        <div className="mt-12 flex justify-center">
          <Link
            href="/signup"
            className={cn(
              buttonVariants({ variant: "default", size: "lg" }),
              "h-12 cursor-pointer rounded-full px-8 text-base font-semibold",
            )}
          >
            {copy.cta}
          </Link>
        </div>
      </div>
    </section>
  );
}
