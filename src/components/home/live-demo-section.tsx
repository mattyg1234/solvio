"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";

import { AmbientOrbs } from "@/components/site/ambient-orbs";
import { VoiceDemoPanel } from "@/components/home/voice-demo-panel";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#94a3b8]">
            Hands-on preview
          </p>
          <h2 className="mt-4 text-[clamp(1.95rem,4vw,2.85rem)] font-semibold tracking-tight text-[#0f172a]">
            Hear your personal AI receptionist — in your ElevenLabs voice.
          </h2>
          <p className="mt-5 text-[17px] leading-relaxed text-[#64748b]">
            Assistant lines synthesize speech with SOLVIO_VOICE_DEMO_VOICE_ID on the server — tap the mic to hear it live; we fall
            back to the browser if ElevenLabs is unavailable.
          </p>
        </motion.div>

        <motion.div
          initial={reduce ? false : { opacity: 0, y: 26 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ duration: 0.52, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto mt-14 max-w-xl"
        >
          <VoiceDemoPanel scenario="personal_voice" autoPlay={false} />
        </motion.div>

        <motion.div
          initial={reduce ? false : { opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: reduce ? 0 : 0.12, duration: 0.35 }}
          className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row"
        >
          <Link
            href="/#contact"
            className={cn(
              buttonVariants({ variant: "default", size: "lg" }),
              "h-12 rounded-full px-9 text-base font-semibold shadow-lg shadow-[#7c3aed]/25",
            )}
          >
            Book a personalised demo
          </Link>
          <Link
            href="/#growth"
            className={cn(
              buttonVariants({ variant: "ghost", size: "lg" }),
              "h-12 rounded-full px-6 text-base font-semibold text-[#64748b] hover:bg-white/70",
            )}
          >
            Explore benefits
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
