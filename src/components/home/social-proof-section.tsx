"use client";

import { Star } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

const stories = [
  {
    biz: "La Terraza · Valencia",
    quote:
      "Bookings jumped 32% in eight weeks — mostly tourists calling after hours. Our staff finally eats dinner uninterrupted.",
    owner: "Marina · Owner",
    metric: "+32% bookings",
  },
  {
    biz: "Bark Barber Studio · Madrid",
    quote:
      "Missed calls basically vanished. Clients pick slots in Spanish or English and show up knowing the price.",
    owner: "Jonás · Founder",
    metric: "Fewer missed calls",
  },
  {
    biz: "Glow Salon Collective · Palma",
    quote:
      "Feels premium like Apple — guests hear a calm voice, not a robot. Weekend chaos finally feels manageable.",
    owner: "Leila · GM",
    metric: "English & Spanish",
  },
];

export function SocialProofSection() {
  const reduce = useReducedMotion();

  return (
    <section id="proof" className="border-b border-[#ebe7f7]/70 bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between"
        >
          <div className="max-w-xl space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#94a3b8]">
              Proof from busy storefronts
            </p>
            <h2 className="text-[clamp(1.95rem,4vw,2.75rem)] font-semibold tracking-tight text-[#0f172a]">
              Loved by restaurants, salons & cafés across Spain.
            </h2>
            <p className="text-[17px] leading-relaxed text-[#64748b]">
              Real-world outcomes — fewer interruptions, fuller calendars and happier guests who feel welcomed instantly.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Badge className="rounded-full bg-[#7c3aed] px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-white hover:bg-[#7c3aed]">
              Bookings up to +32%
            </Badge>
            <Badge variant="outline" className="rounded-full border-[#ebe7f7] px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-[#64748b]">
              Missed calls reduced
            </Badge>
            <Badge variant="secondary" className="rounded-full px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-[#5b21b6]">
              EN / ES conversations
            </Badge>
          </div>
        </motion.div>

        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {stories.map((story, idx) => (
            <motion.div
              key={story.biz}
              initial={reduce ? false : { opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.25 }}
              transition={{
                duration: 0.45,
                delay: reduce ? 0 : idx * 0.07,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              <Card className="flex h-full flex-col rounded-[26px] border border-[#ebe7f7] bg-[#fafbff] p-8 shadow-none ring-1 ring-[#f5f3ff]">
                <div className="flex items-center gap-1 text-[#fbbf24]">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-current text-[#fbbf24]" aria-hidden />
                  ))}
                  <span className="sr-only">Five stars</span>
                </div>
                <p className="mt-6 text-[15px] leading-relaxed text-[#0f172a]">&ldquo;{story.quote}&rdquo;</p>
                <div className="mt-auto pt-8">
                  <p className="text-sm font-semibold text-[#0f172a]">{story.biz}</p>
                  <p className="text-xs uppercase tracking-[0.26em] text-[#94a3b8]">{story.owner}</p>
                  <p className="mt-4 inline-flex rounded-full bg-white px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#7c3aed] ring-1 ring-[#ebe7f7]">
                    {story.metric}
                  </p>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
