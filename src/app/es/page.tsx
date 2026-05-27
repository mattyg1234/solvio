import type { Metadata } from "next";

import { MarketingHomePage, marketingLoadingDemoLabel } from "@/components/marketing/marketing-home-page";
import { getMarketingCopy } from "@/lib/marketing-copy";

const copy = getMarketingCopy("es");

export const metadata: Metadata = {
  title: copy.meta.title,
  description: copy.meta.description,
  openGraph: {
    title: copy.meta.title,
    description: copy.meta.ogDescription,
    url: "https://www.solviosystems.com/es",
    locale: "es_ES",
  },
  twitter: {
    title: copy.meta.title,
    description: copy.meta.ogDescription,
  },
  alternates: {
    canonical: "https://www.solviosystems.com/es",
    languages: {
      en: "https://www.solviosystems.com",
      es: "https://www.solviosystems.com/es",
    },
  },
};

export default function SpanishHomePage() {
  return <MarketingHomePage locale="es" />;
}

export { marketingLoadingDemoLabel };
