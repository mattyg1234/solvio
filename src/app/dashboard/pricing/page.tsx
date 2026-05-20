import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Check, Minus } from "lucide-react";

import {
  checkoutBusinessAction,
  checkoutProAction,
  checkoutScaleAction,
} from "@/app/dashboard/pricing/checkout-actions";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Plans · Dashboard · Solvio",
};

const tiers = [
  {
    name: "Pro",
    price: "€79",
    cadence: "/month",
    blurb: "Solo venues — barbers, small salons, cafés.",
    bullets: [
      "1 location",
      "300 AI receptionist minutes",
      "2.5% on guest deposits",
      "Booking link + inbox",
      "Voice rehearsal sandbox",
    ],
  },
  {
    name: "Business",
    price: "€199",
    cadence: "/month",
    blurb: "Restaurants, mid-sized salons, gyms with real call volume.",
    bullets: [
      "Up to 3 locations",
      "1,000 AI receptionist minutes",
      "1.5% on guest deposits",
      "Floor plan + tiered pricing",
      "Lead pipeline insights",
    ],
    featured: true,
  },
  {
    name: "Scale",
    price: "€399",
    cadence: "/month",
    blurb: "Groups, event venues, multi-location operators.",
    bullets: [
      "Unlimited locations",
      "3,000 AI receptionist minutes",
      "1% on guest deposits",
      "Priority provisioning",
      "Solution engineering blocks",
    ],
  },
];

const stripeCheckoutTierActions = [checkoutProAction, checkoutBusinessAction, checkoutScaleAction] as const;

type ComparisonCell = boolean | string;

type ComparisonRow = {
  feature: string;
  pro: ComparisonCell;
  business: ComparisonCell;
  scale: ComparisonCell;
};

const comparison: ComparisonRow[] = [
  { feature: "Public booking microsite", pro: true, business: true, scale: true },
  { feature: "AI receptionist minutes / month", pro: "300", business: "1,000", scale: "3,000" },
  { feature: "Overage rate (per extra minute)", pro: "€0.40", business: "€0.40", scale: "€0.30" },
  { feature: "Platform fee on guest deposits", pro: "2.5%", business: "1.5%", scale: "1%" },
  { feature: "Locations included", pro: "1", business: "3", scale: "Unlimited" },
  { feature: "Operations hub (appointments / events / tables)", pro: "Light", business: true, scale: true },
  { feature: "Floor plan + tiered pricing modes", pro: false, business: true, scale: true },
  { feature: "Lead pipeline insights", pro: "Basic", business: true, scale: true },
  { feature: "Custom branding (logo, colour)", pro: false, business: true, scale: true },
  { feature: "Priority support + solution design", pro: false, business: false, scale: true },
];

const faqs = [
  {
    q: "What happens if I exceed my monthly AI minutes?",
    a: "You're charged the overage rate per minute (€0.40 on Pro/Business, €0.30 on Scale). You'll see usage live in the dashboard and we'll alert you at 80% of cap so there are no surprises.",
  },
  {
    q: "Can I change tiers later?",
    a: "Yes. Upgrade or downgrade anytime from the Stripe Customer Portal. Changes prorate to the day, and your platform fee % updates immediately on the next guest deposit.",
  },
  {
    q: "Is there a free trial?",
    a: "Every new account gets 14 days with 50 AI minutes — no card required. Convert anytime to keep your data and skip the rebuild.",
  },
  {
    q: "Do guests need an account?",
    a: "No. Public /book/<slug> pages are anonymous-friendly. Only your team authenticates into the dashboard.",
  },
  {
    q: "What about enterprise / multi-location chains?",
    a: "Custom fees, dedicated minutes, white-label deployments, and per-region SIP routing are available — reply to your onboarding email or contact us from the dashboard.",
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
          Each plan includes AI minutes, hosted booking links, and a tier-based platform fee on guest deposits.
          Start with a 14-day trial — no card needed.
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-3">
        {tiers.map((t, index) => {
          const action = stripeCheckoutTierActions[index]!;
          return (
            <article
              key={t.name}
              className={cn(
                "flex flex-col rounded-[24px] border bg-white p-8 shadow-sm",
                t.featured ? "border-[#c4b5fd] shadow-[0_24px_80px_-52px_rgba(124,58,237,0.35)]" : "border-[#ebe7f7]",
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
                <span className="text-4xl font-semibold">{t.price}</span>
                <span className="text-sm font-medium text-[#64748b]">{t.cadence}</span>
              </p>
              <p className="mt-4 text-sm leading-relaxed text-[#475569]">{t.blurb}</p>
              <ul className="mt-6 flex-1 space-y-3 text-sm text-[#475569]">
                {t.bullets.map((b) => (
                  <li key={b} className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#7c3aed]" aria-hidden />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              <form action={action} className="mt-8 w-full space-y-3">
                <button
                  type="submit"
                  className={cn(
                    buttonVariants({ variant: t.featured ? "default" : "outline" }),
                    "h-11 w-full rounded-full px-6 font-semibold shadow-md shadow-[#7c3aed]/15",
                  )}
                >
                  Start 14-day trial
                </button>
              </form>
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
          );
        })}
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
                <th className="px-4 py-4 text-center">Pro</th>
                <th className="px-4 py-4 text-center">Business</th>
                <th className="px-4 py-4 text-center">Scale</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f8fafc] bg-white">
              {comparison.map((row) => (
                <tr key={row.feature}>
                  <td className="px-6 py-4 font-medium text-[#0f172a]">{row.feature}</td>
                  <td className="px-4 py-4 text-center"><Cell value={row.pro} /></td>
                  <td className="px-4 py-4 text-center"><Cell value={row.business} /></td>
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
