"use client";

import {
  CalendarSync,
  CalendarX,
  CreditCard,
  Mail,
  Phone,
  Scissors,
  Sparkles,
  UtensilsCrossed,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

import { AmbientOrbs } from "@/components/site/ambient-orbs";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

const capabilities = [
  { title: "Answers calls", body: "Guests reach a calm voice — day or night." },
  { title: "Takes bookings", body: "Tables, chairs or stylist slots — held correctly." },
  { title: "Collects deposits", body: "Secure prepayments before you turn anyone away." },
  { title: "Confirms visits", body: "Texts or emails guests actually open." },
  { title: "Syncs calendars", body: "Google Calendar stays aligned automatically." },
  { title: "Handles changes", body: "Cancellations and refunds follow your rules." },
];

export function CommerceSection() {
  const reduce = useReducedMotion();

  return (
    <section
      id="commerce"
      className="relative overflow-hidden border-b border-[#ebe7f7]/70 bg-gradient-to-b from-white via-[#fafbff] to-[#f8fafc] py-20 sm:py-28"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_70%_-20%,rgba(167,139,250,0.12),transparent_50%),radial-gradient(ellipse_at_10%_80%,rgba(124,58,237,0.06),transparent_45%)]" />
      <AmbientOrbs />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto max-w-3xl text-center"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#94a3b8]">
            Commerce-ready assistant
          </p>
          <h2 className="mt-4 text-[clamp(1.95rem,4vw,2.85rem)] font-semibold tracking-tight text-[#0f172a]">
            AI-powered booking infrastructure — calls, calendars and checkout working together.
          </h2>
          <p className="mt-5 text-[17px] leading-relaxed text-[#64748b]">
            Think reception plus scheduling plus deposits in one workflow — closer to Calendly than an enterprise dashboard,
            tuned for storefronts that live on walk-ins and reservations.
          </p>
        </motion.div>

        <motion.div
          initial={reduce ? false : { opacity: 0, y: 22 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.22 }}
          transition={{ duration: 0.45, delay: reduce ? 0 : 0.06, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto mt-10 flex justify-center"
        >
          <Badge className="rounded-full bg-[#ede9fe] px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#5b21b6] hover:bg-[#ede9fe]">
            Stripe Connect · payouts stay yours
          </Badge>
        </motion.div>

        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 22 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ duration: 0.44, ease: [0.22, 1, 0.36, 1] }}
          >
            <Card className="h-full rounded-[26px] border border-[#ebe7f7] bg-white/95 p-8 shadow-[0_28px_90px_-58px_rgba(124,58,237,0.45)] backdrop-blur-sm">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f5f3ff] text-[#7c3aed] ring-1 ring-[#ebe7f7]">
                <CreditCard className="h-6 w-6" aria-hidden />
              </div>
              <h3 className="mt-6 text-xl font-semibold tracking-tight text-[#0f172a]">
                Businesses connect their own Stripe account
              </h3>
              <p className="mt-4 text-[15px] leading-relaxed text-[#64748b]">
                Solvio sits alongside Stripe Connect so guests pay{" "}
                <span className="font-medium text-[#0f172a]">your business directly</span>. Deposits land where they belong,
                payout timelines stay yours, and Solvio can collect a predictable platform fee — transparent for finance teams.
              </p>
              <ul className="mt-6 space-y-3 text-[15px] leading-relaxed text-[#64748b]">
                <li className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#7c3aed]" aria-hidden />
                  Cleaner legally — guests contract with you, not a mystery marketplace.
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#a78bfa]" aria-hidden />
                  Revenue scales when bookings scale — Solvio earns alongside your wins.
                </li>
              </ul>
            </Card>
          </motion.div>

          <motion.div
            initial={reduce ? false : { opacity: 0, y: 22 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ duration: 0.44, delay: reduce ? 0 : 0.08, ease: [0.22, 1, 0.36, 1] }}
          >
            <Card className="h-full rounded-[26px] border border-[#ebe7f7] bg-white/95 p-8 shadow-[0_28px_90px_-58px_rgba(124,58,237,0.45)] backdrop-blur-sm">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f5f3ff] text-[#7c3aed] ring-1 ring-[#ebe7f7]">
                <Sparkles className="h-6 w-6" aria-hidden />
              </div>
              <h3 className="mt-6 text-xl font-semibold tracking-tight text-[#0f172a]">
                Pricing that grows when you grow
              </h3>
              <p className="mt-4 text-[15px] leading-relaxed text-[#64748b]">
                Expect a straightforward monthly plan — typically{" "}
                <span className="font-medium text-[#0f172a]">€79–€299</span> depending on seats and locations — plus a tiny{" "}
                <span className="font-medium text-[#0f172a]">booking fee</span> (often around{" "}
                <span className="font-medium text-[#0f172a]">1%</span> or €0.50–€2 per reservation).
              </p>
              <p className="mt-4 text-[14px] leading-relaxed text-[#94a3b8]">
                Five hundred bookings at €1 each means €500/month before subscriptions — proof that aligned incentives beat bolt-on AI widgets.
              </p>
              <p className="mt-4 text-[13px] italic leading-relaxed text-[#94a3b8]">
                Figures shown as examples — exact tiers confirmed during onboarding.
              </p>
            </Card>
          </motion.div>
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {capabilities.map((item, idx) => (
            <motion.div
              key={item.title}
              initial={reduce ? false : { opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.15 }}
              transition={{
                duration: 0.38,
                delay: reduce ? 0 : idx * 0.05,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              <Card className="h-full rounded-[22px] border border-[#ebe7f7]/90 bg-white/90 p-6 shadow-none ring-1 ring-[#f5f3ff]">
                <p className="text-[15px] font-semibold text-[#0f172a]">{item.title}</p>
                <p className="mt-2 text-[14px] leading-relaxed text-[#64748b]">{item.body}</p>
              </Card>
            </motion.div>
          ))}
        </div>

        <div className="mt-16 grid gap-6 lg:grid-cols-2">
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 22 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.44, ease: [0.22, 1, 0.36, 1] }}
          >
            <Card className="h-full rounded-[26px] border border-[#ebe7f7] bg-[#fafbff] p-8 ring-1 ring-[#ede9fe]/80">
              <div className="flex items-center gap-3 text-[#7c3aed]">
                <UtensilsCrossed className="h-6 w-6 shrink-0" aria-hidden />
                <span className="text-xs font-semibold uppercase tracking-[0.26em] text-[#64748b]">Restaurant flow</span>
              </div>
              <div className="mt-6 space-y-5 text-[15px] leading-relaxed text-[#475569]">
                <p>
                  <span className="font-semibold text-[#0f172a]">Caller:</span> “Table for four tonight at eight.”
                </p>
                <p>
                  <span className="font-semibold text-[#0f172a]">Solvio:</span> checks live availability → locks the seating → sends a deposit link → confirms once paid → notifies your maître team.
                </p>
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-[#64748b]">
                  <Phone className="h-4 w-4 text-[#7c3aed]" aria-hidden />
                  Voice booking
                  <span aria-hidden className="text-[#cbd5e1]">
                    ·
                  </span>
                  <CreditCard className="h-4 w-4 text-[#7c3aed]" aria-hidden />
                  Stripe payout to you
                  <span aria-hidden className="text-[#cbd5e1]">
                    ·
                  </span>
                  <Mail className="h-4 w-4 text-[#7c3aed]" aria-hidden />
                  Guest confirmation
                </p>
              </div>
            </Card>
          </motion.div>

          <motion.div
            initial={reduce ? false : { opacity: 0, y: 22 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.44, delay: reduce ? 0 : 0.06, ease: [0.22, 1, 0.36, 1] }}
          >
            <Card className="h-full rounded-[26px] border border-[#ebe7f7] bg-[#fafbff] p-8 ring-1 ring-[#ede9fe]/80">
              <div className="flex items-center gap-3 text-[#7c3aed]">
                <Scissors className="h-6 w-6 shrink-0" aria-hidden />
                <span className="text-xs font-semibold uppercase tracking-[0.26em] text-[#64748b]">Salon flow</span>
              </div>
              <div className="mt-6 space-y-5 text-[15px] leading-relaxed text-[#475569]">
                <p>
                  <span className="font-semibold text-[#0f172a]">Caller:</span> “Haircut tomorrow afternoon.”
                </p>
                <p>
                  <span className="font-semibold text-[#0f172a]">Solvio:</span> picks an open stylist slot → collects a €10 deposit → fires SMS/email confirmations → writes straight into Google Calendar so nobody double-books.
                </p>
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-[#64748b]">
                  <CalendarSync className="h-4 w-4 text-[#7c3aed]" aria-hidden />
                  Calendar sync
                  <span aria-hidden className="text-[#cbd5e1]">
                    ·
                  </span>
                  <CreditCard className="h-4 w-4 text-[#7c3aed]" aria-hidden />
                  Deposit secured
                  <span aria-hidden className="text-[#cbd5e1]">
                    ·
                  </span>
                  <CalendarX className="h-4 w-4 text-[#7c3aed]" aria-hidden />
                  Cancellation rules respected
                </p>
              </div>
            </Card>
          </motion.div>
        </div>

        <motion.div
          initial={reduce ? false : { opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto mt-14 max-w-2xl rounded-[22px] border border-[#ebe7f7] bg-white px-6 py-8 text-center shadow-[0_18px_60px_-44px_rgba(124,58,237,0.35)] sm:px-10"
        >
          <p className="text-[15px] font-semibold uppercase tracking-[0.22em] text-[#94a3b8]">
            Dashboard layer
          </p>
          <p className="mt-4 text-[17px] leading-relaxed text-[#475569]">
            Operators still deserve clarity — bookings, payouts, transcripts and refunds surfaced in one calm workspace while Solvio handles the phone lines.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
