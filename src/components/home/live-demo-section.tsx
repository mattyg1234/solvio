import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { getMarketingCopy } from "@/lib/marketing-copy";
import type { MarketingLocale } from "@/lib/marketing-locale";
import { marketingHashHref } from "@/lib/marketing-locale";
import { bookingDemoHref } from "@/lib/marketing-links";
import { cn } from "@/lib/utils";

export function LiveDemoSection({
  liveVoice = false,
  locale = "en",
}: {
  liveVoice?: boolean;
  locale?: MarketingLocale;
}) {
  const copy = getMarketingCopy(locale).liveDemo;

  return (
    <section
      id="demo"
      className="relative overflow-hidden border-b border-[#ebe7f7]/70 bg-gradient-to-b from-[#faf7ff] via-white to-[#f8fafc] py-20 sm:py-28"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_25%,rgba(167,139,250,0.18),transparent_56%),radial-gradient(circle_at_82%_70%,rgba(124,58,237,0.09),transparent_46%)]" />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#94a3b8]">{copy.eyebrow}</p>
          <h2 className="mt-4 text-[clamp(1.95rem,4vw,2.85rem)] font-semibold tracking-tight text-[#0f172a]">
            {liveVoice ? copy.titleLive : copy.titlePreview}
          </h2>
          <p className="mt-5 text-[17px] leading-relaxed text-[#64748b]">
            {liveVoice ? copy.subtitleLive : copy.subtitlePreview}
          </p>
        </div>

        <ul className="mx-auto mt-12 grid max-w-2xl gap-3 sm:grid-cols-2">
          {copy.topics.map((topic) => (
            <li
              key={topic}
              className="rounded-2xl border border-[#ebe7f7]/90 bg-white/80 px-5 py-4 text-left text-sm font-medium leading-relaxed text-[#475569] shadow-sm"
            >
              {topic}
            </li>
          ))}
        </ul>

        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href={bookingDemoHref()}
            className={cn(
              buttonVariants({ variant: "default", size: "lg" }),
              "h-12 rounded-full px-9 text-base font-semibold shadow-lg shadow-[#7c3aed]/25",
            )}
          >
            {copy.ctaBooking}
          </Link>
          <Link
            href={marketingHashHref(locale, "live-ai-receptionist")}
            className={cn(
              buttonVariants({ variant: "outline", size: "lg" }),
              "h-12 rounded-full px-6 text-base font-semibold text-[#64748b] hover:bg-white/70",
            )}
          >
            {liveVoice ? copy.ctaVoiceLive : copy.ctaVoicePreview}
          </Link>
        </div>
      </div>
    </section>
  );
}
