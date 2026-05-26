"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const tiers = [
  {
    name: "Booking",
    price: "£50",
    period: "/mo",
    badge: "Launch offer · first 50 venues",
    features: [
      "Public /book link for your venue",
      "Appointments, tables & events",
      "Stripe Connect deposits",
      "Guest email confirmations",
      "Operations inbox & calendar",
    ],
    cta: "Start 7-day trial",
    href: "/signup",
    highlight: true,
  },
  {
    name: "Pro",
    price: "£150",
    period: "/mo",
    badge: "After launch",
    features: ["Everything in Booking", "AI receptionist", "Campaign tools", "Priority support"],
    cta: "Talk to us",
    href: "/#contact",
    highlight: false,
  },
];

export function PricingSection() {
  const reduce = useReducedMotion();

  return (
    <section id="pricing" className="border-b border-[#ebe7f7]/70 bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 0.45 }}
          className="mx-auto max-w-2xl text-center"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#94a3b8]">Simple pricing</p>
          <h2 className="mt-4 text-[clamp(1.95rem,4vw,2.75rem)] font-semibold tracking-tight text-[#0f172a]">
            Go live with bookings for £50/month.
          </h2>
          <p className="mt-5 text-[17px] leading-relaxed text-[#64748b]">
            7-day trial · card on file · guest deposits go to your Stripe account. No per-booking platform fee at launch.
          </p>
        </motion.div>

        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          {tiers.map((tier, idx) => (
            <motion.div
              key={tier.name}
              initial={reduce ? false : { opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: reduce ? 0 : idx * 0.08 }}
              className={cn(
                "rounded-[28px] border p-8 shadow-sm",
                tier.highlight
                  ? "border-[#c4b5fd] bg-gradient-to-b from-[#faf7ff] to-white shadow-[0_28px_90px_-58px_rgba(124,58,237,0.35)]"
                  : "border-[#ebe7f7] bg-[#fafbff]/50",
              )}
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#7c3aed]">{tier.badge}</p>
              <h3 className="mt-3 text-2xl font-semibold text-[#0f172a]">{tier.name}</h3>
              <p className="mt-2 flex items-baseline gap-1">
                <span className="text-4xl font-bold text-[#0f172a]">{tier.price}</span>
                <span className="text-[#64748b]">{tier.period}</span>
              </p>
              <ul className="mt-6 space-y-2 text-[15px] text-[#475569]">
                {tier.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span className="text-[#7c3aed]" aria-hidden>
                      ✓
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href={tier.href}
                className={cn(
                  buttonVariants({ variant: tier.highlight ? "default" : "outline", size: "lg" }),
                  "mt-8 inline-flex h-12 w-full justify-center rounded-full font-semibold",
                )}
              >
                {tier.cta}
              </Link>
            </motion.div>
          ))}
        </div>

        <p className="mx-auto mt-10 max-w-xl text-center text-sm text-[#94a3b8]">
          Try the live guest experience:{" "}
          <Link href="/book/solvio-d67c90cc" className="font-semibold text-[#7c3aed] hover:underline">
            book demo →
          </Link>
        </p>
      </div>
    </section>
  );
}
