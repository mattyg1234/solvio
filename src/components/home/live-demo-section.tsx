"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";

import { AmbientOrbs } from "@/components/site/ambient-orbs";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const topics = [
  "How AI receptionists handle calls after hours",
  "Bookings, tables, and event nights on one page",
  "Stripe deposits and Connect for your venue",
  "What setup looks like for restaurants, salons, and tours",
];

export function LiveDemoSection() {
  const reduce = useReducedMotion();

  return (
    <section
      id="demo"
      className="relative overflow-hidden border-b border-[#ebe7f7]/70 bg-gradient-to-b from-[#faf7ff] via-white to-[#f8fafc] py-20 sm:py-28"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_25%,rgba(167,139,250,0.18),transparent_56%),radial-gradient(circle_at_82%_70%,rgba(124,58,237,0.09),transparent_46%)]" />
      <AmbientOrbs />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto max-w-3xl text-center"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#94a3b8]">How we help</p>
          <h2 className="mt-4 text-[clamp(1.95rem,4vw,2.85rem)] font-semibold tracking-tight text-[#0f172a]">
            Ask our receptionist anything about Solvio.
          </h2>
          <p className="mt-5 text-[17px] leading-relaxed text-[#64748b]">
            Tap the purple microphone at the top of the page. You&apos;ll talk live to the receptionist you configured
            in Vapi — same first message, same instructions, no scripted demo.
          </p>
        </motion.div>

        <motion.ul
          initial={reduce ? false : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.48, delay: reduce ? 0 : 0.06, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto mt-12 grid max-w-2xl gap-3 sm:grid-cols-2"
        >
          {topics.map((topic) => (
            <li
              key={topic}
              className="rounded-2xl border border-[#ebe7f7]/90 bg-white/80 px-5 py-4 text-left text-sm font-medium leading-relaxed text-[#475569] shadow-sm"
            >
              {topic}
            </li>
          ))}
        </motion.ul>

        <motion.div
          initial={reduce ? false : { opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: reduce ? 0 : 0.12, duration: 0.35 }}
          className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row"
        >
          <Link
            href="/book/solvio-d67c90cc"
            className={cn(
              buttonVariants({ variant: "default", size: "lg" }),
              "h-12 rounded-full px-9 text-base font-semibold shadow-lg shadow-[#7c3aed]/25",
            )}
          >
            Try live booking demo
          </Link>
          <Link
            href="/#live-ai-receptionist"
            className={cn(
              buttonVariants({ variant: "outline", size: "lg" }),
              "h-12 rounded-full px-6 text-base font-semibold text-[#64748b] hover:bg-white/70",
            )}
          >
            Talk to AI receptionist
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
