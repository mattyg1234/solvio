import { SolvioSystemsHome } from "@/components/marketing/solvio-systems-home";
import { getMarketingCopy } from "@/lib/marketing-copy";
import type { MarketingLocale } from "@/lib/marketing-locale";

/** solviosystems.com front page: the company, Solvio Connect, Show Ops and Tipsi. */
export async function MarketingHomePage({ locale }: { locale: MarketingLocale }) {
  return <SolvioSystemsHome locale={locale} />;
}

export function marketingLoadingDemoLabel(locale: MarketingLocale): string {
  return getMarketingCopy(locale).loadingDemo;
}
