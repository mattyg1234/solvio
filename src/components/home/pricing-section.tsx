import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { bookingDemoHref } from "@/lib/marketing-links";
import {
  BOOKING_DEMO_AI_MINUTES,
  BOOKING_MONTHLY_GBP,
  BOOKING_PLATFORM_FEE_BPS,
  BOOKING_TRIAL_DAYS,
  ENTERPRISE_AI_MINUTES,
  ENTERPRISE_MONTHLY_GBP,
  ENTERPRISE_PLATFORM_FEE_BPS,
  PRO_AI_MINUTES,
  PRO_MONTHLY_GBP,
  PRO_PLATFORM_FEE_BPS,
  guestDepositPayoutLine,
  trialExploreLine,
} from "@/lib/solvio-pricing";
import { cn } from "@/lib/utils";

const tiers = [
  {
    name: "Booking",
    price: `£${BOOKING_MONTHLY_GBP}`,
    period: "/mo",
    badge: "Start here",
    features: [
      "Public /book link — tables, appointments & events",
      "Operations inbox & calendar",
      "Optional card deposits — paid to you",
      `${BOOKING_PLATFORM_FEE_BPS / 100}% fee on guest deposits`,
      `${BOOKING_DEMO_AI_MINUTES} demo AI minutes to test a call`,
    ],
    cta: `Start ${BOOKING_TRIAL_DAYS}-day trial`,
    href: "/signup",
    highlight: true,
  },
  {
    name: "Pro",
    price: `£${PRO_MONTHLY_GBP}`,
    period: "/mo",
    badge: "AI receptionist",
    features: [
      "Everything in Booking",
      `${PRO_AI_MINUTES.toLocaleString("en-GB")} AI receptionist minutes / month`,
      `${PRO_PLATFORM_FEE_BPS / 100}% fee on guest deposits`,
      "Full voice configuration & call history",
      "Ask Solvio + lead pipeline",
    ],
    cta: "Start with Pro",
    href: "/signup?intent=pro",
    highlight: false,
  },
  {
    name: "Enterprise",
    price: `£${ENTERPRISE_MONTHLY_GBP}`,
    period: "/mo",
    badge: "Multi-site & volume",
    features: [
      "Everything in Pro",
      `${ENTERPRISE_AI_MINUTES.toLocaleString("en-GB")} AI minutes / month`,
      `${ENTERPRISE_PLATFORM_FEE_BPS / 100}% fee on guest deposits`,
      "Outbound campaigns + unlimited locations",
      "Priority support & custom branding",
    ],
    cta: "Talk to us about Enterprise",
    href: "/signup?intent=enterprise",
    highlight: false,
  },
];

export function PricingSection() {
  return (
    <section id="pricing" className="border-b border-[#ebe7f7]/70 bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#94a3b8]">Simple pricing</p>
          <h2 className="mt-4 text-[clamp(1.95rem,4vw,2.75rem)] font-semibold tracking-tight text-[#0f172a]">
            Booking from £{BOOKING_MONTHLY_GBP}/mo — add AI when you&apos;re ready.
          </h2>
          <p className="mt-5 text-[17px] leading-relaxed text-[#64748b]">
            {trialExploreLine()} {guestDepositPayoutLine()}
          </p>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={cn(
                "flex flex-col rounded-[28px] border p-8 shadow-sm",
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
              <ul className="mt-6 flex-1 space-y-2 text-[15px] text-[#475569]">
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
            </div>
          ))}
        </div>

        <p className="mx-auto mt-10 max-w-xl text-center text-sm text-[#94a3b8]">
          Pro includes {PRO_AI_MINUTES} AI minutes — enough for steady call volume; Enterprise adds{" "}
          {ENTERPRISE_AI_MINUTES.toLocaleString("en-GB")}+ for groups and events.{" "}
          <Link href={bookingDemoHref()} className="font-semibold text-[#7c3aed] hover:underline">
            Try the live booking demo →
          </Link>
        </p>
      </div>
    </section>
  );
}
