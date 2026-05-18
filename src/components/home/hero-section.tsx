"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";

import { VoiceDemoPanel } from "@/components/home/voice-demo-panel";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function HeroSection() {
  const reduce = useReducedMotion();

  return (
    <section className="relative overflow-hidden border-b border-[#ebe7f7]/70 bg-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_12%_-10%,rgba(167,139,250,0.22),transparent_48%),radial-gradient(ellipse_at_96%_30%,rgba(124,58,237,0.08),transparent_46%)]" />

      <div className="relative mx-auto grid max-w-6xl gap-14 px-4 py-16 sm:gap-16 sm:px-6 sm:py-24 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-center">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="space-y-8"
        >
          <p className="inline-flex items-center rounded-full border border-[#ebe7f7] bg-[#f8fafc] px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.28em] text-[#64748b]">
            AI-first · Spain-ready · Human tone
          </p>

          <div className="space-y-5">
            <h1 className="text-[clamp(2.35rem,5vw,3.65rem)] font-semibold tracking-tight text-[#0f172a] leading-[1.07]">
              Never miss another customer.
            </h1>
            <p className="max-w-xl text-[17px] leading-relaxed text-[#64748b] sm:text-[18px]">
              Solvio&apos;s AI voice agents answer calls, book customers, manage appointments and help your business grow automatically —{" "}
              <span className="font-medium text-[#0f172a]">24/7</span>.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="#demo"
              className={cn(
                buttonVariants({ variant: "default", size: "lg" }),
                "h-12 rounded-full px-8 text-base font-semibold shadow-lg shadow-[#7c3aed]/25",
              )}
            >
              Talk to our AI
            </Link>
            <Link
              href="#contact"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "h-12 rounded-full border-[#ebe7f7] px-8 text-base font-semibold text-[#0f172a] hover:bg-[#f8fafc]",
              )}
            >
              Book demo
            </Link>
          </div>

          <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm font-medium text-[#64748b]">
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#7c3aed]" aria-hidden />
              More bookings while you serve guests
            </span>
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#a78bfa]" aria-hidden />
              Built for cafés, salons & tourist strips
            </span>
          </div>
        </motion.div>

        <motion.div
          initial={reduce ? false : { opacity: 0, y: 26 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.58, delay: reduce ? 0 : 0.08, ease: [0.22, 1, 0.36, 1] }}
          className="relative"
        >
          <VoiceDemoPanel autoPlay />
          <motion.div
            aria-hidden
            className="pointer-events-none absolute -bottom-12 -left-10 hidden h-48 w-48 rounded-full bg-[#a78bfa]/25 blur-3xl lg:block"
            animate={
              reduce
                ? undefined
                : {
                    opacity: [0.35, 0.65, 0.35],
                    scale: [0.92, 1.05, 0.92],
                  }
            }
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          />
        </motion.div>
      </div>
    </section>
  );
}
