import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

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

/** Spanish front page; on the Show Ops address the front door is its sign in (see ../page.tsx). */
export default async function SpanishHomePage() {
  const host = (await headers()).get("host") ?? "";
  if (host.startsWith("mht.")) redirect("/login");
  return <MarketingHomePage locale="es" />;
}

export { marketingLoadingDemoLabel };
