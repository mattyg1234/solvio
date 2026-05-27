import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Check, Minus, Sparkles } from "lucide-react";

import { checkoutBookingAction, checkoutProAction, checkoutScaleAction } from "@/app/dashboard/pricing/checkout-actions";
import { openBillingPortalAction } from "@/app/dashboard/pricing/billing-portal-action";
import { buttonVariants } from "@/components/ui/button";
import {
  BOOKING_DEMO_AI_MINUTES,
  BOOKING_MONTHLY_GBP,
  BOOKING_PLATFORM_FEE_BPS,
  BOOKING_TRIAL_DAYS,
  ENTERPRISE_AI_MINUTES,
  ENTERPRISE_AI_OVERAGE_GBP,
  ENTERPRISE_ANNUAL_GBP,
  ENTERPRISE_MONTHLY_GBP,
  ENTERPRISE_PLATFORM_FEE_BPS,
  PRO_AI_MINUTES,
  PRO_AI_OVERAGE_GBP,
  PRO_ANNUAL_GBP,
  PRO_MONTHLY_GBP,
  PRO_PLATFORM_FEE_BPS,
  TRIAL_AI_MINUTES,
  TRIAL_PLATFORM_FEE_BPS,
  formatTrialEndDate,
  isTrialExpired,
  trialDaysRemaining,
  trialExploreLine,
} from "@/lib/solvio-pricing";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Plans · Dashboard · Solvio",
};

type TierSpec = {
  name: string;
  monthlyDisplay: string;
  cadence: string;
  /** Optional — shown below monthly price, never as the primary price. */
  annualNote?: string;
  blurb: string;
  bullets: string[];
  featured?: boolean;
  badge?: string;
  ctaLabel: string;
  checkoutAction?: () => Promise<void>;
};

const TIERS: TierSpec[] = [
  {
    name: "Booking",
    monthlyDisplay: `£${BOOKING_MONTHLY_GBP}`,
    cadence: "/month",
    blurb: `Full booking system for restaurants, bars and salons — public /book pages, deposits, and confirmations. Add your card to continue after your free trial (£${BOOKING_MONTHLY_GBP}/mo).`,
    bullets: [
      "1 location",
      "Full booking microsite (tables, appointments, events)",
      "Payouts to your account",
      `${BOOKING_DEMO_AI_MINUTES} demo AI minutes to test calls`,
      `${BOOKING_PLATFORM_FEE_BPS / 100}% platform fee on guest deposits`,
      "Email confirmations to guests",
    ],
    ctaLabel: "Add card · continue on Booking",
    checkoutAction: checkoutBookingAction,
    featured: true,
    badge: "Start here",
  },
  {
    name: "Pro",
    monthlyDisplay: `£${PRO_MONTHLY_GBP}`,
    cadence: "/month",
    annualNote: `Annual billing available — £${PRO_ANNUAL_GBP.toLocaleString("en-GB")}/year (save 10% vs monthly).`,
    blurb: "Full AI receptionist for busy venues — limited monthly minutes with overage if you grow past the cap.",
    bullets: [
      "Up to 2 locations",
      `${PRO_AI_MINUTES.toLocaleString("en-GB")} AI receptionist minutes / month`,
      `${PRO_PLATFORM_FEE_BPS / 100}% platform fee on guest deposits`,
      `£${PRO_AI_OVERAGE_GBP.toFixed(2)} / extra AI minute`,
      "Full Operations Hub + floor plan",
      "Lead pipeline + Ask Solvio AI",
    ],
    ctaLabel: "Upgrade to Pro",
    checkoutAction: checkoutProAction,
  },
  {
    name: "Enterprise",
    monthlyDisplay: `£${ENTERPRISE_MONTHLY_GBP}`,
    cadence: "/month",
    annualNote: `Annual billing available — £${ENTERPRISE_ANNUAL_GBP.toLocaleString("en-GB")}/year (save 10% vs monthly).`,
    blurb: "Groups, event venues, and multi-location operators — full platform access with high AI minute caps.",
    bullets: [
      "Unlimited locations",
      `${ENTERPRISE_AI_MINUTES.toLocaleString("en-GB")} AI receptionist minutes / month`,
      `${ENTERPRISE_PLATFORM_FEE_BPS / 100}% platform fee on guest deposits`,
      `£${ENTERPRISE_AI_OVERAGE_GBP.toFixed(2)} / extra AI minute`,
      "Outbound voice campaigns",
      "Custom branding + priority support",
    ],
    ctaLabel: "Upgrade to Enterprise",
    checkoutAction: checkoutScaleAction,
  },
];

type ComparisonCell = boolean | string;
type ComparisonRow = {
  feature: string;
  booking: ComparisonCell;
  pro: ComparisonCell;
  enterprise: ComparisonCell;
};

const comparison: ComparisonRow[] = [
  { feature: "Public booking microsite", booking: true, pro: true, enterprise: true },
  {
    feature: "AI receptionist minutes / month",
    booking: `${BOOKING_DEMO_AI_MINUTES} demo`,
    pro: PRO_AI_MINUTES.toLocaleString("en-GB"),
    enterprise: ENTERPRISE_AI_MINUTES.toLocaleString("en-GB"),
  },
  {
    feature: "Overage rate (per extra minute)",
    booking: "n/a",
    pro: `£${PRO_AI_OVERAGE_GBP.toFixed(2)}`,
    enterprise: `£${ENTERPRISE_AI_OVERAGE_GBP.toFixed(2)}`,
  },
  {
    feature: "Platform fee on guest deposits",
    booking: `${BOOKING_PLATFORM_FEE_BPS / 100}%`,
    pro: `${PRO_PLATFORM_FEE_BPS / 100}%`,
    enterprise: `${ENTERPRISE_PLATFORM_FEE_BPS / 100}%`,
  },
  { feature: "Locations included", booking: "1", pro: "2", enterprise: "Unlimited" },
  { feature: "Payouts to your account", booking: true, pro: true, enterprise: true },
  { feature: "Operations hub (appointments / events / tables)", booking: true, pro: true, enterprise: true },
  { feature: "Floor plan + tiered pricing modes", booking: true, pro: true, enterprise: true },
  { feature: "Full AI receptionist (unlimited config)", booking: false, pro: true, enterprise: true },
  { feature: "Ask Solvio AI (chat with your bookings + calls)", booking: false, pro: true, enterprise: true },
  { feature: "Outbound voice campaigns", booking: false, pro: false, enterprise: true },
  { feature: "Custom branding (logo, colour)", booking: false, pro: false, enterprise: true },
  { feature: "Priority support + solution design", booking: false, pro: false, enterprise: true },
];

const faqs = [
  {
    q: "What happens if I exceed my monthly AI minutes?",
    a: `You're charged £${PRO_AI_OVERAGE_GBP.toFixed(2)} per extra minute on Pro, or £${ENTERPRISE_AI_OVERAGE_GBP.toFixed(2)} on Enterprise. Usage shows live in the dashboard and we alert you at 80% of your included cap.`,
  },
  {
    q: "Can I change tiers later?",
    a: "Yes. Upgrade or downgrade anytime from the Stripe Customer Portal. Changes prorate to the day, and your platform fee % updates immediately on the next guest deposit.",
  },
  {
    q: "Can I pay annually instead of monthly?",
    a: `Yes — on Pro and Enterprise you can prepay 12 months and save 10% (e.g. £${PRO_ANNUAL_GBP.toLocaleString("en-GB")}/year on Pro vs £${PRO_MONTHLY_GBP}/mo). Monthly billing is the default.`,
  },
  {
    q: "Is there a free trial?",
    a: `${trialExploreLine()} During the trial you get ${TRIAL_AI_MINUTES} AI receptionist minutes and a ${TRIAL_PLATFORM_FEE_BPS / 100}% platform fee on guest deposits.`,
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

const TIER_LABELS: Record<string, string> = {
  trial: `Free Trial · ${BOOKING_TRIAL_DAYS} days`,
  booking: `Booking · £${BOOKING_MONTHLY_GBP}/mo`,
  pro: `Pro · £${PRO_MONTHLY_GBP}/mo`,
  business: `Pro · £${PRO_MONTHLY_GBP}/mo`,
  scale: `Enterprise · £${ENTERPRISE_MONTHLY_GBP}/mo`,
  enterprise: "Enterprise · custom",
};

export default async function DashboardPricingPage({
  searchParams,
}: {
  searchParams?: Promise<{ checkout?: string; tier?: string }>;
}) {
  const sp = searchParams ? await searchParams : {};
  const checkoutNotice = (() => {
    switch (sp.checkout) {
      case "success":
        return { tone: "success" as const, text: `Payment started — your ${sp.tier ?? "plan"} subscription is activating.` };
      case "cancel":
        return { tone: "neutral" as const, text: "Checkout cancelled — no charge was made." };
      case "needs_stripe":
        return { tone: "error" as const, text: "Stripe is not configured on production yet (missing secret key or price ID)." };
      case "price_mismatch":
        return {
          tone: "error" as const,
          text: "Stripe checkout could not start — your plan price may be misconfigured. Email hello@solviosystems.com and we'll fix it.",
        };
      case "stripe_error":
        return { tone: "error" as const, text: "Stripe checkout failed — check that live keys and price IDs are from the same account, then try again." };
      case "error":
        return { tone: "error" as const, text: "Checkout could not start. Please try again or contact support." };
      default:
        return null;
    }
  })();

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: biz } = await supabase
    .from("businesses")
    .select("subscription_tier, stripe_customer_id, created_at")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const tier = (biz as { subscription_tier?: string; stripe_customer_id?: string; created_at?: string } | null)?.subscription_tier ?? "trial";
  const hasStripeCustomer = Boolean((biz as { stripe_customer_id?: string } | null)?.stripe_customer_id);
  const isPaid = tier !== "trial";
  const createdAt = (biz as { created_at?: string } | null)?.created_at;
  const onFreeTrial = tier === "trial" && createdAt;
  const trialDaysLeft = createdAt ? trialDaysRemaining(createdAt) : BOOKING_TRIAL_DAYS;
  const trialExpired = createdAt ? isTrialExpired(createdAt) : false;
  const onBookingTier = tier === "booking";
  const trialEndLabel = createdAt ? formatTrialEndDate(createdAt) : null;

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

      {checkoutNotice ? (
        <div
          className={cn(
            "rounded-[20px] border px-5 py-4 text-sm",
            checkoutNotice.tone === "success" && "border-emerald-200 bg-emerald-50 text-emerald-900",
            checkoutNotice.tone === "neutral" && "border-[#ebe7f7] bg-[#fafbff] text-[#64748b]",
            checkoutNotice.tone === "error" && "border-red-200 bg-red-50 text-red-900",
          )}
        >
          {checkoutNotice.text}
        </div>
      ) : null}

      {/* Current subscription status */}
      <div className={cn(
        "flex flex-col gap-4 rounded-[22px] border p-6 sm:flex-row sm:items-center sm:justify-between",
        isPaid
          ? "border-[#c4b5fd] bg-[#f5f3ff]"
          : "border-[#ebe7f7] bg-[#fafbff]",
      )}>
        <div className="flex items-center gap-3">
          <span className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
            isPaid ? "bg-[#7c3aed] text-white" : "bg-white text-[#94a3b8] ring-1 ring-[#ebe7f7]",
          )}>
            <Sparkles className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#94a3b8]">Current plan</p>
            <p className="text-lg font-semibold text-[#0f172a]">{TIER_LABELS[tier] ?? tier}</p>
          </div>
        </div>
        {hasStripeCustomer ? (
          <form action={openBillingPortalAction}>
            <button
              type="submit"
              className={cn(
                buttonVariants({ variant: "outline" }),
                "h-10 rounded-full border-[#c4b5fd] px-5 text-sm font-semibold text-[#5b21b6] hover:bg-[#ede9fe]",
              )}
            >
              Manage billing &amp; invoices →
            </button>
          </form>
        ) : (
          <p className="text-sm text-[#64748b]">
            {trialExpired
              ? `Your ${BOOKING_TRIAL_DAYS}-day trial has ended — add a card on Booking below to keep your link live (£${BOOKING_MONTHLY_GBP}/mo).`
              : onFreeTrial
                ? `${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left on your free trial${trialEndLabel ? ` (ends ${trialEndLabel})` : ""}. Add your card below — we won't charge until the trial ends.`
                : "Choose a plan below to activate your subscription."}
          </p>
        )}
      </div>

      {onBookingTier ? (
        <div className="flex flex-col gap-4 rounded-[22px] border border-[#c4b5fd] bg-gradient-to-br from-[#f5f3ff] to-white p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-[#5b21b6]">
              Want to really maximise your sales with your AI receptionist?
            </p>
            <p className="text-sm leading-relaxed text-[#64748b]">
              You&apos;re on Booking with {BOOKING_DEMO_AI_MINUTES} demo minutes. Upgrade to Pro for {PRO_AI_MINUTES.toLocaleString("en-GB")} minutes/month,
              full voice configuration, and a lower platform fee.
            </p>
          </div>
          <form action={checkoutProAction}>
            <button
              type="submit"
              className={cn(
                buttonVariants({ variant: "default" }),
                "h-10 shrink-0 rounded-full px-6 text-sm font-semibold shadow-md shadow-[#7c3aed]/20",
              )}
            >
              Upgrade to Pro · £{PRO_MONTHLY_GBP}/mo →
            </button>
          </form>
        </div>
      ) : null}

      {onFreeTrial && !trialExpired ? (
        <div className="rounded-[20px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          <p className="font-semibold">
            When your trial ends{trialEndLabel ? ` on ${trialEndLabel}` : ""}, add a card on Booking to stay live.
          </p>
          <p className="mt-1 text-amber-800">
            £{BOOKING_MONTHLY_GBP}/month starts then — not another 7-day wait. You can add your card now; we won&apos;t charge until your trial ends. Cancel anytime in billing.
          </p>
        </div>
      ) : null}

      {onFreeTrial && trialExpired ? (
        <div className="rounded-[20px] border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-900">
          <p className="font-semibold">Your free trial has ended</p>
          <p className="mt-1">
            Add a card on Booking below (£{BOOKING_MONTHLY_GBP}/mo starts immediately) to keep your public /book link live.
          </p>
          <form action={checkoutBookingAction} className="mt-4">
            <button
              type="submit"
              className={cn(
                buttonVariants({ variant: "default" }),
                "h-11 rounded-full px-6 text-sm font-semibold shadow-md shadow-[#7c3aed]/20",
              )}
            >
              Add card · continue on Booking · £{BOOKING_MONTHLY_GBP}/mo →
            </button>
          </form>
        </div>
      ) : null}

      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.26em] text-[#94a3b8]">Pricing</p>
        <h1 className="text-[clamp(1.6rem,3vw,2.15rem)] font-semibold tracking-tight text-[#0f172a]">
          Keep your booking link live — from £{BOOKING_MONTHLY_GBP}/month
        </h1>
        <p className="max-w-2xl text-[15px] leading-relaxed text-[#64748b]">
          {trialExploreLine()} Pro and Enterprise add AI receptionist minutes and lower deposit fees.
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
            {t.featured || t.badge ? (
              <span className="mb-4 inline-flex w-fit rounded-full bg-[#ede9fe] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#5b21b6]">
                {t.badge ?? "Most popular"}
              </span>
            ) : (
              <span className="mb-4 block h-6" aria-hidden />
            )}
            <h2 className="text-lg font-semibold text-[#0f172a]">{t.name}</h2>
            <p className="mt-3 flex items-baseline gap-1 text-[#0f172a]">
              <span className="text-4xl font-semibold">{t.monthlyDisplay}</span>
              {t.cadence ? <span className="text-sm font-medium text-[#64748b]">{t.cadence}</span> : null}
            </p>
            {t.annualNote ? (
              <p className="mt-2 text-[12px] leading-relaxed text-[#64748b]">{t.annualNote}</p>
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
            ) : null}
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
                <th className="px-4 py-4 text-center">Booking</th>
                <th className="px-4 py-4 text-center">Pro</th>
                <th className="px-4 py-4 text-center">Enterprise</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f8fafc] bg-white">
              {comparison.map((row) => (
                <tr key={row.feature}>
                  <td className="px-6 py-4 font-medium text-[#0f172a]">{row.feature}</td>
                  <td className="px-4 py-4 text-center"><Cell value={row.booking} /></td>
                  <td className="px-4 py-4 text-center"><Cell value={row.pro} /></td>
                  <td className="px-4 py-4 text-center"><Cell value={row.enterprise} /></td>
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
