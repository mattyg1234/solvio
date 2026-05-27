export type MarketingLocale = "en" | "es";

export const DEFAULT_MARKETING_LOCALE: MarketingLocale = "en";

export function isMarketingLocale(value: string | null | undefined): value is MarketingLocale {
  return value === "en" || value === "es";
}

/** Marketing site base path — `/` for English, `/es` for Spanish. */
export function marketingBasePath(locale: MarketingLocale = DEFAULT_MARKETING_LOCALE): string {
  return locale === "es" ? "/es" : "/";
}

export function marketingHashHref(locale: MarketingLocale, hash: string): string {
  const id = hash.replace(/^#/, "");
  return `${marketingBasePath(locale)}#${id}`;
}

export function alternateMarketingLocale(locale: MarketingLocale): MarketingLocale {
  return locale === "es" ? "en" : "es";
}

export function alternateMarketingPath(locale: MarketingLocale): string {
  return marketingBasePath(alternateMarketingLocale(locale));
}
