import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { MarketingHomePage } from "@/components/marketing/marketing-home-page";
import { getMarketingCopy } from "@/lib/marketing-copy";

const copy = getMarketingCopy("en");

export const metadata: Metadata = {
  title: copy.meta.title,
  description: copy.meta.description,
  openGraph: {
    title: copy.meta.title,
    description: copy.meta.ogDescription,
    url: "https://www.solviosystems.com",
    locale: "en_GB",
  },
  twitter: {
    title: copy.meta.title,
    description: copy.meta.ogDescription,
  },
  alternates: {
    canonical: "https://www.solviosystems.com",
    languages: {
      en: "https://www.solviosystems.com",
      es: "https://www.solviosystems.com/es",
    },
  },
};

/**
 * solviosystems.com: the Solvio Systems front page. The Show Ops hub signs in here at /login;
 * on its old address (mht.solviosystems.com) the front door goes straight to that sign in.
 */
export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  // A sign-in link that lands on the homepage still finishes signing in here.
  if (typeof params.code === "string") {
    redirect(`/auth/callback?${new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => typeof e[1] === "string"))}`);
  }
  const host = (await headers()).get("host") ?? "";
  if (host.startsWith("mht.")) redirect("/login");
  return <MarketingHomePage locale="en" />;
}
