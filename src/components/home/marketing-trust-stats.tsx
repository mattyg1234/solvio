import { CalendarCheck, Clock3, PoundSterling, TrendingUp } from "lucide-react";

import { getMarketingCopy } from "@/lib/marketing-copy";
import type { MarketingLocale } from "@/lib/marketing-locale";
import { cn } from "@/lib/utils";

const statIcons = [TrendingUp, PoundSterling, Clock3, CalendarCheck] as const;

type MarketingTrustStatsProps = {
  compact?: boolean;
  className?: string;
  locale?: MarketingLocale;
};

/** Illustrative outcome stats — not verified customer data. */
export function MarketingTrustStats({ compact = false, className, locale = "en" }: MarketingTrustStatsProps) {
  const copy = getMarketingCopy(locale).trustStats;

  return (
    <div className={cn("space-y-3", className)}>
      <div
        className={cn(
          "grid gap-3",
          compact ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 lg:grid-cols-4",
        )}
      >
        {copy.stats.map((stat, idx) => {
          const Icon = statIcons[idx] ?? TrendingUp;
          return (
            <div
              key={stat.label}
              className={cn(
                "rounded-2xl border border-[#ebe7f7] bg-white/90 px-4 py-4 shadow-sm ring-1 ring-[#f5f3ff]",
                compact && "px-3 py-3",
              )}
            >
              <div className="flex items-center gap-2 text-[#7c3aed]">
                <Icon className={cn("shrink-0", compact ? "h-4 w-4" : "h-5 w-5")} aria-hidden />
                <p className={cn("font-semibold tracking-tight text-[#0f172a]", compact ? "text-xl" : "text-2xl")}>
                  {stat.value}
                </p>
              </div>
              <p className={cn("mt-1 font-semibold text-[#475569]", compact ? "text-xs" : "text-sm")}>{stat.label}</p>
              {!compact ? (
                <p className="mt-1 text-[12px] leading-snug text-[#94a3b8]">{stat.detail}</p>
              ) : null}
            </div>
          );
        })}
      </div>
      <p className={cn("text-[#94a3b8]", compact ? "text-[11px]" : "text-xs")}>{copy.disclaimer}</p>
    </div>
  );
}
