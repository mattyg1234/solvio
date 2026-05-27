import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { bookingDemoHref } from "@/lib/marketing-links";
import {
  BOOKING_MONTHLY_GBP,
  BOOKING_PLATFORM_FEE_BPS,
  BOOKING_TRIAL_DAYS,
  PRO_MONTHLY_GBP,
  TRIAL_PLATFORM_FEE_BPS,
  trialExploreLine,
} from "@/lib/solvio-pricing";
import { cn } from "@/lib/utils";

const tiers = [
  {
    name: "Booking",
    price: `£${BOOKING_MONTHLY_GBP}`,
    period: "/mo",
    badge: "For restaurants, salons & cafés",
    features: [
      "Public /book link for your venue",
      "Appointments, tables & events",
      "Stripe Connect deposits to your account",
      "Guest email confirmations",
      "Operations inbox & calendar",
    ],
    cta: `Start ${BOOKING_TRIAL_DAYS}-day trial`,
    href: "/signup",
    highlight: true,
  },
  {
    name: "Pro",
    price: `£${PRO_MONTHLY_GBP}`,
    period: "/mo",
    badge: "Full AI receptionist",
    features: ["Everything in Booking", "AI receptionist", "Campaign tools", "Priority support"],
    cta: "Start with Pro",
    href: "/signup?intent=pro",
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
            Go live with bookings for £{BOOKING_MONTHLY_GBP}/month.
          </h2>
          <p className="mt-5 text-[17px] leading-relaxed text-[#64748b]">
            {trialExploreLine()} Guest deposits go straight to your Stripe account. Solvio takes a small platform fee on
            processed payments ({TRIAL_PLATFORM_FEE_BPS / 100}% during trial, {BOOKING_PLATFORM_FEE_BPS / 100}% on the Booking
            plan).
          </p>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          {tiers.map((tier) => (
            <div
              key={tier.name}
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
            </div>
          ))}
        </div>

        <p className="mx-auto mt-10 max-w-xl text-center text-sm text-[#94a3b8]">
          Need multi-location or high-volume events?{" "}
          <Link href="/signup?intent=scale" className="font-semibold text-[#7c3aed] hover:underline">
            Scale from £499/mo
          </Link>
          {" · "}
          Try the live guest experience:{" "}
          <Link href={bookingDemoHref()} className="font-semibold text-[#7c3aed] hover:underline">
            book demo →
          </Link>
        </p>
      </div>
    </section>
  );
}
