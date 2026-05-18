import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Check, Minus } from "lucide-react";

import {
  checkoutGrowthAction,
  checkoutScaleAction,
  checkoutStarterAction,
} from "@/app/dashboard/pricing/checkout-actions";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Plans · Dashboard · Solvio",
};

const tiers = [
  {
    name: "Starter",
    price: "€50",
    cadence: "/month",
    blurb: "Solo venues testing AI reception + hosted bookings.",
    bullets: ["1 location", "Booking link + inbox", "Voice rehearsal sandbox"],
  },
  {
    name: "Growth",
    price: "€150",
    cadence: "/month",
    blurb: "Busy floors coordinating appointments, tables, and events.",
    bullets: ["Everything in Starter", "Operational grids & floor planner", "Cancellation-aware scripts"],
    featured: true,
  },
  {
    name: "Scale",
    price: "€250",
    cadence: "/month",
    blurb: "Groups needing pooled dialers, integrations, and bespoke clones.",
    bullets: ["Everything in Growth", "Priority provisioning", "Solution engineering blocks"],
  },
];

const stripeCheckoutTierActions = [checkoutStarterAction, checkoutGrowthAction, checkoutScaleAction] as const;

type ComparisonCell = boolean | "light" | "basic";

type ComparisonRow = {
  feature: string;
  starter: ComparisonCell;
  growth: ComparisonCell;
  scale: ComparisonCell;
};

const comparison: ComparisonRow[] = [
  { feature: "Public booking microsite", starter: true, growth: true, scale: true },
  { feature: "AI voice rehearsal + scripting", starter: true, growth: true, scale: true },
  { feature: "Operations hub (appointments / events / tables)", starter: "light", growth: true, scale: true },
  { feature: "Floor plan + tiered pricing modes", starter: false, growth: true, scale: true },
  { feature: "Lead pipeline insights", starter: "basic", growth: true, scale: true },
  { feature: "Priority support + solution design", starter: false, growth: false, scale: true },
];

const faqs = [
  {
    q: "Can I change tiers later?",
    a: "Yes. Stripe Customer Portal subscriptions can roll up/down once your price IDs map to Starter / Growth / Scale in environment configuration.",
  },
  {
    q: "Do guests need an account?",
    a: "No. Public `/book/<slug>` pages are anonymous-friendly. Only your team authenticates into the dashboard.",
  },
  {
    q: "Where do API keys live?",
    a: "Solvio hosts billing (Stripe secrets), transactional mail (`SOLVIO_RESEND_*`), optional SMS Twilio envs, voice (`SOLVIO_VAPI_*` / ElevenLabs), and Supabase. Merchants do not paste provider secrets into Solvio screens.",
  },
];

function Cell({ value }: { value: boolean | "light" | "basic" }) {
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
        <p className="text-xs font-semibold uppercase tracking-[0.26em] text-[#94a3b8]">Pricing preview</p>
        <h1 className="text-[clamp(1.6rem,3vw,2.15rem)] font-semibold tracking-tight text-[#0f172a]">
          Plans sized for €50 – €250 / month pilots
        </h1>
        <p className="max-w-2xl text-[15px] leading-relaxed text-[#64748b]">
          Configure <code className="rounded bg-[#f1f5f9] px-1.5 py-0.5 text-[13px]">STRIPE_PRICE_*</code> price IDs plus{" "}
          <code className="rounded bg-[#f1f5f9] px-1.5 py-0.5 text-[13px]">STRIPE_SECRET_KEY</code>{" "}
          to enable Stripe Checkout redirects from each card below. Guests still subscribe through Solvio-hosted checkout while you iterate on product entitlement mapping.
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
                  Popular
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
                  Subscribe · Stripe checkout
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
          <h2 className="text-lg font-semibold text-[#0f172a]">Feature snapshot</h2>
          <p className="mt-2 text-sm text-[#64748b]">Quick glance before proposals — detailed SLAs ship with contracts.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[720px] w-full divide-y divide-[#f1eefc] text-sm">
            <thead className="bg-[#fafbff] text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[#94a3b8]">
              <tr>
                <th className="px-6 py-4">Capability</th>
                <th className="px-4 py-4 text-center">Starter</th>
                <th className="px-4 py-4 text-center">Growth</th>
                <th className="px-4 py-4 text-center">Scale</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f8fafc] bg-white">
              {comparison.map((row) => (
                <tr key={row.feature}>
                  <td className="px-6 py-4 font-medium text-[#0f172a]">{row.feature}</td>
                  <td className="px-4 py-4 text-center">
                    <Cell value={row.starter} />
                  </td>
                  <td className="px-4 py-4 text-center">
                    <Cell value={row.growth} />
                  </td>
                  <td className="px-4 py-4 text-center">
                    <Cell value={row.scale} />
                  </td>
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
