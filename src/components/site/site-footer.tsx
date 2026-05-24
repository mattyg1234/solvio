import Image from "next/image";
import Link from "next/link";

import { SolvioWordmark } from "@/components/brand/solvio-wordmark";

export function SiteFooter() {
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
          <p className="text-[15px] leading-relaxed text-[#64748b]">
            Booking infrastructure for restaurants, salons and cafés — voice reception, Stripe-ready deposits and confirmations without enterprise baggage.
          </p>
          <p className="text-sm font-medium text-[#7c3aed]">
            <a href="mailto:hello@solvio.es" className="underline-offset-4 hover:underline">
              hello@solvio.es
            </a>
          </p>
        </div>

        <div className="flex flex-wrap gap-10 text-sm">
          <div className="space-y-3">
            <p className="font-semibold text-[#0f172a]">Product</p>
            <ul className="space-y-2 text-[#64748b]">
              <li>
                <Link href="/#growth" className="hover:text-[#7c3aed]">
                  What you get
                </Link>
              </li>
              <li>
                <Link href="/#commerce" className="hover:text-[#7c3aed]">
                  Bookings & Stripe
                </Link>
              </li>
              <li>
                <Link href="/#live-ai-receptionist" className="hover:text-[#7c3aed]">
                  Talk to us
                </Link>
              </li>
              <li>
                <Link href="/#proof" className="hover:text-[#7c3aed]">
                  Results
                </Link>
              </li>
              <li>
                <Link href="/login" className="hover:text-[#7c3aed]">
                  Log in
                </Link>
              </li>
              <li>
                <Link href="/signup" className="hover:text-[#7c3aed]">
                  Sign up
                </Link>
              </li>
            </ul>
          </div>
          <div className="space-y-3">
            <p className="font-semibold text-[#0f172a]">Company</p>
            <ul className="space-y-2 text-[#64748b]">
              <li>
                <span className="cursor-default">EU hosting-ready</span>
              </li>
              <li>
                <span className="cursor-default">Spanish & English</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="mx-auto mt-12 max-w-6xl border-t border-[#ebe7f7] px-4 pt-8 text-center text-xs text-[#94a3b8] sm:px-6 sm:text-left">
        © {new Date().getFullYear()} Solvio. Built for busy shop floors — not dashboards.
      </div>
    </footer>
  );
}
