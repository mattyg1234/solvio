"use client";

import Link from "next/link";
import { Moon } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

import { AmbientOrbs } from "@/components/site/ambient-orbs";
import { MarketingSiteVoice, marketingSiteHasLiveVapi } from "@/components/home/marketing-site-voice";
import { MarketingTrustStats } from "@/components/home/marketing-trust-stats";
import { buttonVariants } from "@/components/ui/button";
import type { MarketingVapiConfig } from "@/lib/marketing-vapi-config";
import { bookingDemoHref } from "@/lib/marketing-links";
import { cn } from "@/lib/utils";

export function HeroSection({ vapiConfig }: { vapiConfig?: MarketingVapiConfig }) {
  const reduce = useReducedMotion();
  const liveVoice = marketingSiteHasLiveVapi(vapiConfig);

  return (
    <section className="relative overflow-hidden border-b border-[#ebe7f7]/70 bg-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_12%_-10%,rgba(167,139,250,0.14),transparent_50%),radial-gradient(ellipse_at_96%_30%,rgba(124,58,237,0.06),transparent_48%)]" />
      <AmbientOrbs />

      <div className="relative mx-auto grid max-w-6xl gap-14 px-4 py-16 sm:gap-16 sm:px-6 sm:py-24 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-center">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="space-y-8"
        >
          <p className="inline-flex max-w-xl rounded-full border border-[#ebe7f7]/90 bg-[#f8fafc]/90 px-4 py-2 text-[13px] font-medium leading-snug text-[#475569] backdrop-blur-sm sm:text-sm">
            One booking link — optional card deposits
          </p>

          <div className="space-y-5">
            <h1 className="text-[clamp(2.35rem,5vw,3.65rem)] font-semibold tracking-tight text-[#0f172a] leading-[1.07]">
              Your booking page live in about 30 minutes — enquiries and deposits on one link.
            </h1>
            <p className="max-w-xl text-[17px] leading-relaxed text-[#64748b] sm:text-[18px]">
              Share one link with your customers. They pick a day, choose a stylist or table, and get booked in — with
              email and text confirmation. Turn on optional card deposits when you want to hold a table or ticket.
            </p>
          </div>

          <div
            className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-[#ebe7f7]/80 bg-[#fafbff]/80 px-4 py-3 shadow-[0_1px_0_rgba(255,255,255,0.8)_inset] backdrop-blur-sm sm:inline-flex sm:max-w-xl"
            aria-label="Booking link availability"
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-[#0f172a]">
              <Moon className="h-4 w-4 shrink-0 text-[#7c3aed]" aria-hidden strokeWidth={2} />
              Book online 24/7
            </span>
            <span className="hidden h-4 w-px bg-[#ebe7f7] sm:block" aria-hidden />
            <span className="flex items-center gap-2 text-sm font-medium text-[#64748b]">
              <span className="relative flex h-2 w-2 shrink-0">
                {!reduce ? (
                  <span
                    className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/45 opacity-75"
                    aria-hidden
                  />
                ) : null}
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,0.15)]" />
              </span>
              Even when you&apos;re closed
            </span>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <Link
              href="/signup"
              className={cn(
                buttonVariants({ variant: "default", size: "lg" }),
                "h-12 rounded-full px-8 text-base font-semibold shadow-lg shadow-[#7c3aed]/25",
              )}
            >
              Start free trial
            </Link>
            <Link
              href={bookingDemoHref()}
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "h-12 rounded-full border-[#ebe7f7] px-8 text-base font-semibold text-[#0f172a] hover:bg-[#f8fafc]",
              )}
            >
              See live booking demo
            </Link>
          </div>

          <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm font-medium text-[#64748b]">
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#7c3aed]" aria-hidden />
              Bookings and calls in one place
            </span>
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#a78bfa]" aria-hidden />
              Restaurants, salons, cafés &amp; events
            </span>
          </div>

          <MarketingTrustStats compact className="max-w-xl pt-2" />
        </motion.div>

        <motion.div
          id="live-ai-receptionist"
          tabIndex={-1}
          initial={reduce ? false : { opacity: 0, y: 26 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.58, delay: reduce ? 0 : 0.08, ease: [0.22, 1, 0.36, 1] }}
          className="relative scroll-mt-28 outline-none"
        >
          <p className="mb-4 text-center text-sm font-semibold text-[#475569] lg:text-left">
            {liveVoice
              ? "Click the purple microphone — you'll speak directly to our live AI receptionist demo."
              : "Preview our AI receptionist — scripted demo while live voice is unavailable."}
          </p>
          <MarketingSiteVoice vapiConfig={vapiConfig} />
        </motion.div>
      </div>
    </section>
  );
}
