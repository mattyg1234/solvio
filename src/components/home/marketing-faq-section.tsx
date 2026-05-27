import Link from "next/link";

import {
  BOOKING_MONTHLY_GBP,
  BOOKING_TRIAL_DAYS,
  BOOKING_PLATFORM_FEE_BPS,
  ENTERPRISE_PLATFORM_FEE_BPS,
  PRO_PLATFORM_FEE_BPS,
  TRIAL_PLATFORM_FEE_BPS,
  trialExploreLine,
} from "@/lib/solvio-pricing";

const faqs = [
  {
    q: "Do I need a card to start?",
    a: trialExploreLine(),
  },
  {
    q: "Who receives guest deposit payments?",
    a: "You do. Guest deposits are paid to your business payout account — Solvio is not the merchant of record. We provide the booking page, inbox, and guest confirmations.",
  },
  {
    q: "What fees does Solvio charge?",
    a: `Booking is £${BOOKING_MONTHLY_GBP}/month after your trial. Deposit fees: ${TRIAL_PLATFORM_FEE_BPS / 100}% during trial, ${BOOKING_PLATFORM_FEE_BPS / 100}% on Booking, ${PRO_PLATFORM_FEE_BPS / 100}% on Pro, ${ENTERPRISE_PLATFORM_FEE_BPS / 100}% on Enterprise — always shown before guests pay.`,
  },
  {
    q: "Can I cancel?",
    a: `Yes. Cancel anytime from the dashboard. Cancel before your ${BOOKING_TRIAL_DAYS}-day trial ends and you won't be charged £${BOOKING_MONTHLY_GBP}/mo.`,
  },
  {
    q: "Is this only for restaurants?",
    a: "No — salons, cafés, bars and ticketed events use the same /book link. Pick tables, appointments, events or a mix when you set up.",
  },
  {
    q: "Will this actually increase my bookings?",
    a: "Results vary by venue — but teams typically share one /book link everywhere (Google, Instagram, voicemail) so guests can book when you're busy or closed. Deposits also cut no-shows. Our homepage shows illustrative examples, not verified case studies.",
  },
];

export function MarketingFaqSection() {
  return (
    <section id="faq" className="border-b border-[#ebe7f7]/70 bg-[#f8fafc] py-20 sm:py-28">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#94a3b8]">FAQ</p>
          <h2 className="mt-4 text-[clamp(1.75rem,3.5vw,2.35rem)] font-semibold tracking-tight text-[#0f172a]">
            Common questions before you sign up
          </h2>
        </div>

        <dl className="mt-12 space-y-4">
          {faqs.map((item) => (
            <div key={item.q} className="rounded-[20px] border border-[#ebe7f7] bg-white px-5 py-5 shadow-sm">
              <dt className="text-[15px] font-semibold text-[#0f172a]">{item.q}</dt>
              <dd className="mt-2 text-[15px] leading-relaxed text-[#64748b]">{item.a}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-10 text-center text-sm text-[#64748b]">
          More detail in our{" "}
          <Link href="/privacy" className="font-semibold text-[#7c3aed] hover:underline">
            Privacy Policy
          </Link>{" "}
          and{" "}
          <Link href="/terms" className="font-semibold text-[#7c3aed] hover:underline">
            Terms
          </Link>
          .
        </p>
      </div>
    </section>
  );
}
