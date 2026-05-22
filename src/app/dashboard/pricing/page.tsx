import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Check, Minus } from "lucide-react";

import { checkoutProAction, checkoutScaleAction } from "@/app/dashboard/pricing/checkout-actions";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Plans · Dashboard · Solvio",
};

type TierSpec = {
  name: string;
  monthlyDisplay: string;
  yearlyDisplay: string;
  yearlyTotal: string;
  yearlyEquivalent: string;
  cadence: string;
  blurb: string;
  bullets: string[];
  featured?: boolean;
  badge?: string;
  ctaLabel: string;
  checkoutAction?: () => Promise<void>;
};

const TIERS: TierSpec[] = [
  {
    name: "Trial",
    monthlyDisplay: "Free",
    yearlyDisplay: "Free",
    yearlyTotal: "Free",
    yearlyEquivalent: "",
    cadence: "",
    blurb: "Try Solvio end-to-end with no card — guests can book and pay through your link from day one.",
    bullets: [
      "1 location",
      "50 AI receptionist minutes",
      "10% platform fee on guest deposits",
      "Public booking microsite",
      "Email + SMS confirmations",
    ],
    ctaLabel: "Already on trial",
  },
  {
    name: "Pro",
    monthlyDisplay: "£200",
    yearlyDisplay: "£180",
    yearlyTotal: "£2,160",
    yearlyEquivalent: "(save £240 vs monthly)",
    cadence: "/month",
    blurb: "Every working venue — bars, restaurants, salons, ticketed events. Founders' rate £200/mo for the first 50 merchants.",
    bullets: [
      "Up to 2 locations",
      "1,000 AI receptionist minutes",
      "2.5% platform fee on guest deposits",
      "Stripe Connect payouts",
      "Full Operations Hub + floor plan",
      "Lead pipeline + Ask Solvio AI",
    ],
    featured: true,
    badge: "Founders' rate · £299 after first 50",
    ctaLabel: "Start with Pro",
    checkoutAction: checkoutProAction,
  },
  {
    name: "Scale",
    monthlyDisplay: "£499",
    yearlyDisplay: "£449",
    yearlyTotal: "£5,388",
    yearlyEquivalent: "(save £600 vs monthly)",
    cadence: "/month",
    blurb: "Groups, event venues, multi-location operators selling thousands of tickets a month.",
    bullets: [
      "Unlimited locations",
      "3,000 AI receptionist minutes (€0.30 / extra min)",
      "1% platform fee on guest deposits",
      "Priority provisioning + custom routing",
      "Solution engineering blocks",
      "Custom branding (logo, colour)",
    ],
    ctaLabel: "Start with Scale",
    checkoutAction: checkoutScaleAction,
  },
];

type ComparisonCell = boolean | string;
type ComparisonRow = {
  feature: string;
  trial: ComparisonCell;
  pro: ComparisonCell;
  scale: ComparisonCell;
};

const comparison: ComparisonRow[] = [
  { feature: "Public booking microsite", trial: true, pro: true, scale: true },
  { feature: "AI receptionist minutes / month", trial: "50", pro: "1,000", scale: "3,000" },
  { feature: "Overage rate (per extra minute)", trial: "n/a", pro: "€0.40", scale: "€0.30" },
  { feature: "Platform fee on guest deposits", trial: "10%", pro: "2.5%", scale: "1%" },
  { feature: "Locations included", trial: "1", pro: "2", scale: "Unlimited" },
  { feature: "Stripe Connect payouts", trial: false, pro: true, scale: true },
  { feature: "Operations hub (appointments / events / tables)", trial: "Light", pro: true, scale: true },
  { feature: "Floor plan + tiered pricing modes", trial: false, pro: true, scale: true },
  { feature: "Ask Solvio AI (chat with your bookings + calls)", trial: false, pro: true, scale: true },
  { feature: "Custom branding (logo, colour)", trial: false, pro: false, scale: true },
  { feature: "Priority support + solution design", trial: false, pro: false, scale: true },
];

const faqs = [
  {
    q: "What happens if I exceed my monthly AI minutes?",
    a: "You're charged the overage rate per minute (€0.40 on Pro, €0.30 on Scale). You'll see usage live in the dashboard and we'll alert you at 80% of cap so there are no surprises.",
  },
  {
    q: "Can I change tiers later?",
    a: "Yes. Upgrade or downgrade anytime from the Stripe Customer Portal. Changes prorate to the day, and your platform fee % updates immediately on the next guest deposit.",
  },
  {
    q: "How does the founders' rate work?",
    a: "Pro is £200/mo for the first 50 paying merchants. After that, list price moves to £299/mo. Existing founders keep their £200/mo rate as long as the subscription stays active.",
  },
  {
    q: "Annual prepay — what's the deal?",
    a: "Pay 12 months up front and save 10% (£2,160 vs £2,400 on Pro, £5,388 vs £5,988 on Scale). Locks in your founders' rate even if list pricing changes.",
  },
  {
    q: "Is there a free trial?",
    a: "Yes — every account starts on Trial. 50 AI minutes, full public booking page, 10% platform fee on any deposits taken during trial. Upgrade to Pro any time to drop the fee to 2.5%.",
  },
  {
    q: "Do guests need an account?",
    a: "No. Public /book/<slug> pages are anonymous-friendly. Only your team authenticates into the dashboard.",
  },
];

function Cell({ value }: { value: ComparisonCell }) {
  if (value === true) {
    return (
      <span className="inline-flex items-center justify-center text-[#7c3aed]">
        <Check className="h-4 w-4" aria-label="Included" />
      </span>
    );
  }
  if (value === false) {
    return (
      <span className="inline-flex items-center justify-center text-[#cbd5f5]">
        <Minus className="h-4 w-4" aria-label="Not included" />
      </span>
    );
  }
  return <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#64748b]">{value}</span>;
}

export default function DashboardPricingPage() {
  return (
    <div className="space-y-12">
      <Link
        href="/dashboard"
        className={cn(
          buttonVariants({ variant: "ghost" }),
          "inline-flex h-10 items-center gap-2 px-2 text-sm font-semibold text-[#64748b] hover:text-[#0f172a]",
        )}
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Overview
      </Link>

      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.26em] text-[#94a3b8]">Pricing</p>
        <h1 className="text-[clamp(1.6rem,3vw,2.15rem)] font-semibold tracking-tight text-[#0f172a]">
          AI receptionist + bookings, priced like a part-time team member
        </h1>
        <p className="max-w-2xl text-[15px] leading-relaxed text-[#64748b]">
          Free trial · founders&apos; rate £200/mo · annual prepay saves 10%. Each plan includes AI minutes, hosted
          booking links, and a tier-based platform fee on guest deposits.
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-3">
        {TIERS.map((t) => (
          <article
            key={t.name}
            className={cn(
              "flex flex-col rounded-[24px] border bg-white p-8 shadow-sm",
              t.featured
                ? "border-[#c4b5fd] shadow-[0_24px_80px_-52px_rgba(124,58,237,0.35)]"
                : "border-[#ebe7f7]",
            )}
          >
            {t.featured ? (
              <span className="mb-4 inline-flex w-fit rounded-full bg-[#ede9fe] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#5b21b6]">
                Most popular
              </span>
            ) : (
              <span className="mb-4 block h-6" aria-hidden />
            )}
            <h2 className="text-lg font-semibold text-[#0f172a]">{t.name}</h2>
            <p className="mt-3 flex items-baseline gap-1 text-[#0f172a]">
              <span className="text-4xl font-semibold">{t.monthlyDisplay}</span>
              {t.cadence ? <span className="text-sm font-medium text-[#64748b]">{t.cadence}</span> : null}
            </p>
            {t.yearlyEquivalent ? (
              <p className="mt-1 text-[12px] text-[#7c3aed]">
                or {t.yearlyDisplay}/mo annual ({t.yearlyTotal} up front · {t.yearlyEquivalent.replace(/[()]/g, "")})
              </p>
            ) : null}
            {t.badge ? (
              <p className="mt-2 inline-flex w-fit rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-900 ring-1 ring-amber-100">
                {t.badge}
              </p>
            ) : null}
            <p className="mt-4 text-sm leading-relaxed text-[#475569]">{t.blurb}</p>
            <ul className="mt-6 flex-1 space-y-3 text-sm text-[#475569]">
              {t.bullets.map((b) => (
                <li key={b} className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#7c3aed]" aria-hidden />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
            {t.checkoutAction ? (
              <form action={t.checkoutAction} className="mt-8 w-full space-y-3">
                <button
                  type="submit"
                  className={cn(
                    buttonVariants({ variant: t.featured ? "default" : "outline" }),
                    "h-11 w-full rounded-full px-6 font-semibold shadow-md shadow-[#7c3aed]/15",
                  )}
                >
                  {t.ctaLabel}
                </button>
              </form>
            ) : (
              <button
                type="button"
                disabled
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "mt-8 h-11 w-full rounded-full px-6 font-semibold opacity-60",
                )}
              >
                {t.ctaLabel}
              </button>
            )}
            <Link
              href="/dashboard/setup/voice"
              className={cn(
                buttonVariants({ variant: "ghost" }),
                "inline-flex h-10 w-full items-center justify-center rounded-full text-sm font-semibold text-[#7c3aed]",
              )}
            >
              Continue product setup →
            </Link>
          </article>
        ))}
      </div>

      <section className="overflow-hidden rounded-[26px] border border-[#ebe7f7] bg-white shadow-sm">
        <div className="border-b border-[#f1eefc] px-6 py-5">
          <h2 className="text-lg font-semibold text-[#0f172a]">Plan comparison</h2>
          <p className="mt-2 text-sm text-[#64748b]">Everything at a glance — pick the tier that matches your call volume.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[720px] w-full divide-y divide-[#f1eefc] text-sm">
            <thead className="bg-[#fafbff] text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[#94a3b8]">
              <tr>
                <th className="px-6 py-4">Capability</th>
                <th className="px-4 py-4 text-center">Trial</th>
                <th className="px-4 py-4 text-center">Pro</th>
                <th className="px-4 py-4 text-center">Scale</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f8fafc] bg-white">
              {comparison.map((row) => (
                <tr key={row.feature}>
                  <td className="px-6 py-4 font-medium text-[#0f172a]">{row.feature}</td>
                  <td className="px-4 py-4 text-center"><Cell value={row.trial} /></td>
                  <td className="px-4 py-4 text-center"><Cell value={row.pro} /></td>
                  <td className="px-4 py-4 text-center"><Cell value={row.scale} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-[26px] border border-[#f1eefc] bg-[#fafbff] px-6 py-8 md:px-10">
        <h2 className="text-lg font-semibold text-[#0f172a]">FAQ</h2>
        <dl className="mt-6 space-y-6">
          {faqs.map((item) => (
            <div key={item.q}>
              <dt className="font-semibold text-[#0f172a]">{item.q}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-[#64748b]">{item.a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
