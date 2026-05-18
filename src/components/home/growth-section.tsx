"use client";

import {
  CalendarClock,
  CalendarDays,
  Globe2,
  Hourglass,
  PhoneIncoming,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

import { Card } from "@/components/ui/card";

const blocks = [
  {
    title: "Never miss a booking",
    body: "AI answers calls 24/7 so tables stay full — even when your team is slammed.",
    icon: PhoneIncoming,
  },
  {
    title: "Speak multiple languages",
    body: "Perfect for tourist-heavy streets in Spain — greet guests in their language instantly.",
    icon: Globe2,
  },
  {
    title: "Automatic appointments",
    body: "Bookings handled on the spot with confirmations guests actually receive.",
    icon: CalendarClock,
  },
  {
    title: "Less time on the phone",
    body: "Free your crew to focus on hospitality, not repetitive phone loops.",
    icon: Hourglass,
  },
  {
    title: "Works with your calendar",
    body: "Google Calendar stays the source of truth — Solvio keeps it effortlessly updated.",
    icon: CalendarDays,
  },
];

export function GrowthSection() {
  const reduce = useReducedMotion();

  return (
    <section id="growth" className="border-b border-[#ebe7f7]/70 bg-[#f8fafc] py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto max-w-3xl text-center"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#94a3b8]">
            Built for outcomes
          </p>
          <h2 className="mt-4 text-[clamp(1.95rem,4vw,2.85rem)] font-semibold tracking-tight text-[#0f172a]">
            Growth feels effortless — because the boring stuff disappears.
          </h2>
          <p className="mt-5 text-[17px] leading-relaxed text-[#64748b]">
            No dashboards to babysit. Just calmer shifts, fuller books and happier regulars.
          </p>
        </motion.div>

        <div className="mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {blocks.map((block, idx) => (
            <motion.div
              key={block.title}
              initial={reduce ? false : { opacity: 0, y: 22 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.25 }}
              transition={{
                duration: 0.42,
                delay: reduce ? 0 : idx * 0.06,
                ease: [0.22, 1, 0.36, 1],
              }}
              whileHover={
                reduce ? undefined : { y: -8, rotateZ: idx % 2 === 0 ? -0.35 : 0.35 }
              }
            >
              <Card className="h-full rounded-[26px] border border-[#ebe7f7] bg-white p-8 shadow-[0_28px_90px_-58px_rgba(124,58,237,0.55)] transition-shadow hover:shadow-[0_34px_110px_-54px_rgba(124,58,237,0.48)]">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f5f3ff] text-[#7c3aed] ring-1 ring-[#ebe7f7]">
                  <block.icon className="h-6 w-6" aria-hidden />
                </div>
                <h3 className="mt-7 text-xl font-semibold tracking-tight text-[#0f172a]">{block.title}</h3>
                <p className="mt-4 text-[15px] leading-relaxed text-[#64748b]">{block.body}</p>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
