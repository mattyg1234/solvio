"use client";

import Link from "next/link";
import { Moon } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

import { AmbientOrbs } from "@/components/site/ambient-orbs";
import { MarketingSiteVoice } from "@/components/home/marketing-site-voice";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function HeroSection() {
  const reduce = useReducedMotion();

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
            AI receptionists & booking systems for hospitality and services
          </p>

          <div className="space-y-5">
            <h1 className="text-[clamp(2.35rem,5vw,3.65rem)] font-semibold tracking-tight text-[#0f172a] leading-[1.07]">
              Never miss another booking, customer, or phone call.
            </h1>
            <p className="max-w-xl text-[17px] leading-relaxed text-[#64748b] sm:text-[18px]">
              AI receptionists, bookings, events, tables and payments — one calm dashboard. Complexity only appears for the
              modules you turn on.
            </p>
          </div>

          <div
            className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-[#ebe7f7]/80 bg-[#fafbff]/80 px-4 py-3 shadow-[0_1px_0_rgba(255,255,255,0.8)_inset] backdrop-blur-sm sm:inline-flex sm:max-w-xl"
            aria-label="Solvio works twenty-four seven"
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-[#0f172a]">
              <Moon className="h-4 w-4 shrink-0 text-[#7c3aed]" aria-hidden strokeWidth={2} />
              Works 24/7
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
              Answers after hours
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
              href="/#demo"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "h-12 rounded-full border-[#ebe7f7] px-8 text-base font-semibold text-[#0f172a] hover:bg-[#f8fafc]",
              )}
            >
              Watch demo
            </Link>
            <Link
              href="#live-ai-receptionist"
              className={cn(
                buttonVariants({ variant: "ghost", size: "lg" }),
                "h-12 rounded-full px-6 text-base font-semibold text-[#475569] hover:bg-[#f8fafc] hover:text-[#0f172a]",
              )}
            >
              Test AI receptionist
            </Link>
          </div>

          <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm font-medium text-[#64748b]">
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#7c3aed]" aria-hidden />
              One inbox for AI calls, bookings and leads
            </span>
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#a78bfa]" aria-hidden />
              Restaurants, salons, tours & lounges
            </span>
          </div>
        </motion.div>

        <motion.div
          id="live-ai-receptionist"
          tabIndex={-1}
          initial={reduce ? false : { opacity: 0, y: 26 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.58, delay: reduce ? 0 : 0.08, ease: [0.22, 1, 0.36, 1] }}
          className="relative scroll-mt-28 outline-none"
        >
          <MarketingSiteVoice />
        </motion.div>
      </div>
    </section>
  );
}
