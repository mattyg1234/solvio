"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

import { SolvioWordmark } from "@/components/brand/solvio-wordmark";
import { buttonVariants } from "@/components/ui/button";
import { bookingDemoHref } from "@/lib/marketing-links";
import { BOOKING_TRIAL_DAYS } from "@/lib/solvio-pricing";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/#growth", label: "Growth" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#commerce", label: "Commerce" },
  { href: "/#faq", label: "FAQ" },
  { href: bookingDemoHref(), label: "Live demo" },
];

export function SiteHeader() {
  const reduce = useReducedMotion();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-[#ebe7f7]/90 bg-white/80 backdrop-blur-xl supports-[backdrop-filter]:bg-white/65">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:h-[4.25rem] sm:px-6">
        <Link
          href="/"
          className="flex min-w-0 items-center gap-2 rounded-xl outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-[#7c3aed]"
          onClick={() => setMobileOpen(false)}
        >
          <motion.span
            aria-hidden
            className="block h-9 w-9 shrink-0 overflow-hidden rounded-xl shadow-sm shadow-[#7c3aed]/25"
            initial={{ opacity: reduce ? 1 : 0, scale: reduce ? 1 : 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              duration: reduce ? 0 : 0.4,
              ease: [0.22, 1, 0.36, 1],
              delay: reduce ? 0 : 0.02,
            }}
          >
            <Image src="/brand/icon-192.png" alt="" width={72} height={72} className="h-full w-full" priority />
          </motion.span>
          <div className="min-w-0">
            <SolvioWordmark className="text-lg font-semibold tracking-tight text-[#0f172a]" delay={reduce ? 0 : 0.12} />
            <p className="hidden text-[10px] font-semibold uppercase tracking-[0.18em] text-[#94a3b8] sm:block">
              {BOOKING_TRIAL_DAYS}-day trial · no card
            </p>
          </div>
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-xl px-3 py-2 text-sm font-medium text-[#64748b] transition-colors hover:bg-[#f8fafc] hover:text-[#0f172a]"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex flex-shrink-0 items-center gap-1 sm:gap-2">
          <Link
            href="/login"
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "hidden rounded-full px-3 font-semibold text-[#64748b] hover:text-[#0f172a] sm:inline-flex",
            )}
          >
            Log in
          </Link>
          <Link
            href={bookingDemoHref()}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "hidden rounded-full border-[#ebe7f7] px-4 font-semibold text-[#0f172a] hover:bg-[#f8fafc] lg:inline-flex",
            )}
          >
            Try booking demo
          </Link>
          <Link
            href="/signup"
            className={cn(
              buttonVariants({ variant: "default", size: "sm" }),
              "rounded-full px-4 font-semibold shadow-md shadow-[#7c3aed]/20 sm:px-5",
            )}
          >
            Start free trial
          </Link>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#ebe7f7] text-[#475569] md:hidden"
            aria-expanded={mobileOpen}
            aria-controls="site-mobile-nav"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            onClick={() => setMobileOpen((o) => !o)}
          >
            {mobileOpen ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
          </button>
        </div>
      </div>

      {mobileOpen ? (
        <div id="site-mobile-nav" className="border-t border-[#ebe7f7]/90 bg-white/95 px-4 py-4 md:hidden">
          <nav className="flex flex-col gap-1" aria-label="Mobile primary">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-xl px-3 py-3 text-[15px] font-semibold text-[#0f172a] hover:bg-[#f8fafc]"
                onClick={() => setMobileOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="mt-4 grid gap-2 border-t border-[#ebe7f7] pt-4">
            <Link
              href="/signup"
              className={cn(buttonVariants({ variant: "default", size: "lg" }), "h-11 rounded-full font-semibold")}
              onClick={() => setMobileOpen(false)}
            >
              Start free trial
            </Link>
            <Link
              href="/login"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 rounded-full font-semibold")}
              onClick={() => setMobileOpen(false)}
            >
              Log in
            </Link>
          </div>
        </div>
      ) : null}
    </header>
  );
}
