import Image from "next/image";
import Link from "next/link";

import { SolvioWordmark } from "@/components/brand/solvio-wordmark";
import { getMarketingCopy } from "@/lib/marketing-copy";
import type { MarketingLocale } from "@/lib/marketing-locale";
import { marketingHashHref } from "@/lib/marketing-locale";
import { bookingDemoHref } from "@/lib/marketing-links";
import { SUPPORT_EMAIL, supportMailtoHref } from "@/lib/site-contact";

export function SiteFooter({ locale = "en" }: { locale?: MarketingLocale }) {
  const copy = getMarketingCopy(locale).footer;
  const links = copy.links;

  return (
    <footer id="contact" className="border-t border-[#ebe7f7] bg-[#f8fafc] py-14">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div className="max-w-md space-y-4">
          <div className="flex items-center gap-2">
            <span className="block h-9 w-9 overflow-hidden rounded-xl">
              <Image src="/brand/icon-192.png" alt="" width={72} height={72} className="h-full w-full" />
            </span>
            <SolvioWordmark className="text-lg font-semibold tracking-tight text-[#0f172a]" delay={0.42} />
          </div>
          <p className="text-[15px] leading-relaxed text-[#64748b]">{copy.blurb}</p>
          <p className="text-sm font-medium text-[#7c3aed]">
            <a href={supportMailtoHref()} className="underline-offset-4 hover:underline">
              {SUPPORT_EMAIL}
            </a>
          </p>
        </div>

        <div className="flex flex-wrap gap-10 text-sm">
          <div className="space-y-3">
            <p className="font-semibold text-[#0f172a]">{copy.product}</p>
            <ul className="space-y-2 text-[#64748b]">
              <li>
                <Link href={marketingHashHref(locale, "growth")} className="hover:text-[#7c3aed]">
                  {links.whatYouGet}
                </Link>
              </li>
              <li>
                <Link href={marketingHashHref(locale, "commerce")} className="hover:text-[#7c3aed]">
                  {links.bookingsPayments}
                </Link>
              </li>
              <li>
                <Link href={marketingHashHref(locale, "live-ai-receptionist")} className="hover:text-[#7c3aed]">
                  {links.tryAiDemo}
                </Link>
              </li>
              <li>
                <Link href={marketingHashHref(locale, "pricing")} className="hover:text-[#7c3aed]">
                  {links.pricing}
                </Link>
              </li>
              <li>
                <Link href={marketingHashHref(locale, "faq")} className="hover:text-[#7c3aed]">
                  {links.faq}
                </Link>
              </li>
              <li>
                <Link href={marketingHashHref(locale, "proof")} className="hover:text-[#7c3aed]">
                  {links.results}
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="hover:text-[#7c3aed]">
                  {links.privacy}
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-[#7c3aed]">
                  {links.terms}
                </Link>
              </li>
              <li>
                <Link href={bookingDemoHref()} className="hover:text-[#7c3aed]">
                  {links.liveBookingDemo}
                </Link>
              </li>
              <li>
                <Link href="/login" className="hover:text-[#7c3aed]">
                  {links.login}
                </Link>
              </li>
              <li>
                <Link href="/signup" className="hover:text-[#7c3aed]">
                  {links.signup}
                </Link>
              </li>
            </ul>
          </div>
          <div className="space-y-3">
            <p className="font-semibold text-[#0f172a]">{copy.company}</p>
            <ul className="space-y-2 text-[#64748b]">
              <li>
                <Link href="/privacy#subprocessors" className="hover:text-[#7c3aed]">
                  {links.dataHosting}
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="hover:text-[#7c3aed]">
                  {links.privacySub}
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="mx-auto mt-12 max-w-6xl border-t border-[#ebe7f7] px-4 pt-8 text-center text-xs text-[#94a3b8] sm:px-6 sm:text-left">
        © {new Date().getFullYear()} Solvio. {copy.copyright}
      </div>
    </footer>
  );
}
