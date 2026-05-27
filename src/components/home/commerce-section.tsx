import {
  CalendarX,
  CreditCard,
  Mail,
  Phone,
  Scissors,
  Sparkles,
  UtensilsCrossed,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getMarketingCopy } from "@/lib/marketing-copy";
import type { MarketingLocale } from "@/lib/marketing-locale";

export function CommerceSection({ locale = "en" }: { locale?: MarketingLocale }) {
  const copy = getMarketingCopy(locale).commerce;

  return (
    <section
      id="commerce"
      className="relative overflow-hidden border-b border-[#ebe7f7]/70 bg-gradient-to-b from-white via-[#fafbff] to-[#f8fafc] py-20 sm:py-28"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_70%_-20%,rgba(167,139,250,0.12),transparent_50%),radial-gradient(ellipse_at_10%_80%,rgba(124,58,237,0.06),transparent_45%)]" />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#94a3b8]">{copy.eyebrow}</p>
          <h2 className="mt-4 text-[clamp(1.95rem,4vw,2.85rem)] font-semibold tracking-tight text-[#0f172a]">
            {copy.title}
          </h2>
          <p className="mt-5 text-[17px] leading-relaxed text-[#64748b]">{copy.subtitle}</p>
        </div>

        <div className="mx-auto mt-10 flex justify-center">
          <Badge className="rounded-full bg-[#ede9fe] px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#5b21b6] hover:bg-[#ede9fe]">
            {copy.badge}
          </Badge>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          <Card className="h-full rounded-[26px] border border-[#ebe7f7] bg-white/95 p-8 shadow-[0_28px_90px_-58px_rgba(124,58,237,0.45)] backdrop-blur-sm">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f5f3ff] text-[#7c3aed] ring-1 ring-[#ebe7f7]">
              <CreditCard className="h-6 w-6" aria-hidden />
            </div>
            <h3 className="mt-6 text-xl font-semibold tracking-tight text-[#0f172a]">{copy.card1Title}</h3>
            <p className="mt-4 text-[15px] leading-relaxed text-[#64748b]">{copy.card1Body}</p>
            <ul className="mt-6 space-y-3 text-[15px] leading-relaxed text-[#64748b]">
              {copy.card1Bullets.map((bullet) => (
                <li key={bullet} className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#7c3aed]" aria-hidden />
                  {bullet}
                </li>
              ))}
            </ul>
          </Card>

          <Card className="h-full rounded-[26px] border border-[#ebe7f7] bg-white/95 p-8 shadow-[0_28px_90px_-58px_rgba(124,58,237,0.45)] backdrop-blur-sm">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f5f3ff] text-[#7c3aed] ring-1 ring-[#ebe7f7]">
              <Sparkles className="h-6 w-6" aria-hidden />
            </div>
            <h3 className="mt-6 text-xl font-semibold tracking-tight text-[#0f172a]">{copy.card2Title}</h3>
            <p className="mt-4 text-[15px] leading-relaxed text-[#64748b]">{copy.card2Body}</p>
          </Card>
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {copy.capabilities.map((item) => (
            <Card
              key={item.title}
              className="h-full rounded-[22px] border border-[#ebe7f7]/90 bg-white/90 p-6 shadow-none ring-1 ring-[#f5f3ff]"
            >
              <p className="text-[15px] font-semibold text-[#0f172a]">{item.title}</p>
              <p className="mt-2 text-[14px] leading-relaxed text-[#64748b]">{item.body}</p>
            </Card>
          ))}
        </div>

        <div className="mt-16 grid gap-6 lg:grid-cols-2">
          <Card className="h-full rounded-[26px] border border-[#ebe7f7] bg-[#fafbff] p-8 ring-1 ring-[#ede9fe]/80">
            <div className="flex items-center gap-3 text-[#7c3aed]">
              <UtensilsCrossed className="h-6 w-6 shrink-0" aria-hidden />
              <span className="text-xs font-semibold uppercase tracking-[0.26em] text-[#64748b]">
                {copy.restaurantFlow.label}
              </span>
            </div>
            <div className="mt-6 space-y-5 text-[15px] leading-relaxed text-[#475569]">
              <p>
                <span className="font-semibold text-[#0f172a]">{copy.restaurantFlow.callerLabel}</span>{" "}
                {copy.restaurantFlow.callerQuote}
              </p>
              <p>
                <span className="font-semibold text-[#0f172a]">{copy.restaurantFlow.solvioLabel}</span>{" "}
                {copy.restaurantFlow.solvioBody}
              </p>
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-[#64748b]">
                <Phone className="h-4 w-4 text-[#7c3aed]" aria-hidden />
                {copy.restaurantFlow.tags[0]}
                <span aria-hidden className="text-[#cbd5e1]">
                  ·
                </span>
                <CreditCard className="h-4 w-4 text-[#7c3aed]" aria-hidden />
                {copy.restaurantFlow.tags[1]}
                <span aria-hidden className="text-[#cbd5e1]">
                  ·
                </span>
                <Mail className="h-4 w-4 text-[#7c3aed]" aria-hidden />
                {copy.restaurantFlow.tags[2]}
              </p>
            </div>
          </Card>

          <Card className="h-full rounded-[26px] border border-[#ebe7f7] bg-[#fafbff] p-8 ring-1 ring-[#ede9fe]/80">
            <div className="flex items-center gap-3 text-[#7c3aed]">
              <Scissors className="h-6 w-6 shrink-0" aria-hidden />
              <span className="text-xs font-semibold uppercase tracking-[0.26em] text-[#64748b]">
                {copy.salonFlow.label}
              </span>
            </div>
            <div className="mt-6 space-y-5 text-[15px] leading-relaxed text-[#475569]">
              <p>
                <span className="font-semibold text-[#0f172a]">{copy.salonFlow.callerLabel}</span>{" "}
                {copy.salonFlow.callerQuote}
              </p>
              <p>
                <span className="font-semibold text-[#0f172a]">{copy.salonFlow.solvioLabel}</span>{" "}
                {copy.salonFlow.solvioBody}
              </p>
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-[#64748b]">
                <CreditCard className="h-4 w-4 text-[#7c3aed]" aria-hidden />
                {copy.salonFlow.tags[0]}
                <span aria-hidden className="text-[#cbd5e1]">
                  ·
                </span>
                <Mail className="h-4 w-4 text-[#7c3aed]" aria-hidden />
                {copy.salonFlow.tags[1]}
                <span aria-hidden className="text-[#cbd5e1]">
                  ·
                </span>
                <CalendarX className="h-4 w-4 text-[#7c3aed]" aria-hidden />
                {copy.salonFlow.tags[2]}
              </p>
            </div>
          </Card>
        </div>

        <div className="mx-auto mt-14 max-w-2xl rounded-[22px] border border-[#ebe7f7] bg-white px-6 py-8 text-center shadow-[0_18px_60px_-44px_rgba(124,58,237,0.35)] sm:px-10">
          <p className="text-[15px] font-semibold uppercase tracking-[0.22em] text-[#94a3b8]">
            {copy.dashboardLayer.eyebrow}
          </p>
          <p className="mt-4 text-[17px] leading-relaxed text-[#475569]">{copy.dashboardLayer.body}</p>
        </div>
      </div>
    </section>
  );
}
