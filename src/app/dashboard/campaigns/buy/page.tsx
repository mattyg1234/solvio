import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Check, Sparkles } from "lucide-react";

import {
  buy100Action,
  buy300Action,
  buy1000Action,
  buy5000Action,
} from "@/app/dashboard/campaigns/buy/checkout-actions";
import { buttonVariants } from "@/components/ui/button";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Buy call credits · Solvio",
};

type Bundle = {
  calls: number;
  pricePounds: number;
  perCall: string;
  action: () => Promise<void>;
  blurb: string;
  features: string[];
  popular?: boolean;
};

const bundles: Bundle[] = [
  {
    calls: 100,
    pricePounds: 150,
    perCall: "£1.50",
    action: buy100Action,
    blurb: "Burst campaigns — try one segment, see what converts.",
    features: ["100 outbound calls", "Never expire", "Use on any campaign"],
  },
  {
    calls: 300,
    pricePounds: 375,
    perCall: "£1.25",
    action: buy300Action,
    blurb: "Monthly outreach for a small list.",
    features: ["300 outbound calls", "£0.25/call cheaper", "Never expire"],
    popular: true,
  },
  {
    calls: 1000,
    pricePounds: 1000,
    perCall: "£1.00",
    action: buy1000Action,
    blurb: "Heavy weekly campaigns — best mid-range value.",
    features: ["1,000 outbound calls", "£0.50/call cheaper", "Never expire"],
  },
  {
    calls: 5000,
    pricePounds: 4000,
    perCall: "£0.80",
    action: buy5000Action,
    blurb: "Volume / agencies / multi-location operators.",
    features: ["5,000 outbound calls", "Best per-call price", "Priority support"],
  },
];

export default async function BuyCreditsPage({
  searchParams,
}: {
  searchParams?: Promise<{ checkout?: string }>;
}) {
  const sp = searchParams ? await searchParams : {};
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: biz } = await supabase
    .from("businesses")
    .select("id, campaigns_enabled")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!biz) redirect("/dashboard/settings");
  if (!(biz as { campaigns_enabled?: boolean }).campaigns_enabled) {
    redirect("/dashboard/campaigns");
  }

  const { data: creditsRow } = await supabase
    .from("voice_outbound_credits")
    .select("bundle_calls_remaining, trial_calls_remaining")
    .eq("business_id", biz.id)
    .maybeSingle();
  const total =
    (creditsRow?.bundle_calls_remaining ?? 0) + (creditsRow?.trial_calls_remaining ?? 0);

  const flashMessage =
    sp.checkout === "cancel"
      ? "Checkout cancelled — no charge. Pick a bundle to try again."
      : sp.checkout === "needs_setup"
        ? "Bundle checkout isn't configured on this deployment — contact support."
        : sp.checkout === "error"
          ? "Stripe couldn't open checkout. Try again or contact support."
          : null;

  return (
    <div className="space-y-8">
      <Link
        href="/dashboard/campaigns"
        className={cn(
          buttonVariants({ variant: "ghost" }),
          "inline-flex h-10 items-center gap-2 px-2 text-sm font-semibold text-[#64748b] hover:text-[#0f172a]",
        )}
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Campaigns
      </Link>

      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#94a3b8]">Outbound call credits</p>
        <h1 className="text-[clamp(1.45rem,3vw,2rem)] font-semibold tracking-tight text-[#0f172a]">
          Top up your outbound budget
        </h1>
        <p className="max-w-2xl text-[15px] leading-relaxed text-[#64748b]">
          One-time purchase — bundles never expire and stack on top of any monthly plan. Each dial deducts one credit
          on connection (no-answer / voicemail still deduct because the line was opened).
        </p>
        <p className="text-sm text-[#475569]">
          Current balance: <span className="font-semibold text-[#0f172a]">{total}</span> calls available
        </p>
      </header>

      {flashMessage ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{flashMessage}</p>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {bundles.map((b) => (
          <article
            key={b.calls}
            className={cn(
              "flex flex-col rounded-[24px] border bg-white p-6 shadow-sm",
              b.popular ? "border-[#c4b5fd] shadow-[0_24px_80px_-52px_rgba(124,58,237,0.45)]" : "border-[#ebe7f7]",
            )}
          >
            {b.popular ? (
              <span className="mb-4 inline-flex w-fit rounded-full bg-[#ede9fe] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#5b21b6]">
                Most popular
              </span>
            ) : (
              <span className="mb-4 block h-6" aria-hidden />
            )}
            <h2 className="text-lg font-semibold text-[#0f172a]">{b.calls.toLocaleString()} calls</h2>
            <p className="mt-3 flex items-baseline gap-1 text-[#0f172a]">
              <span className="text-4xl font-semibold">£{b.pricePounds.toLocaleString()}</span>
            </p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#5b21b6]">
              {b.perCall} per call
            </p>
            <p className="mt-3 text-sm leading-relaxed text-[#64748b]">{b.blurb}</p>
            <ul className="mt-5 flex-1 space-y-2 text-sm text-[#475569]">
              {b.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#7c3aed]" aria-hidden />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <form action={b.action} className="mt-6">
              <button
                type="submit"
                className={cn(
                  buttonVariants({ variant: b.popular ? "default" : "outline" }),
                  "h-11 w-full rounded-full font-semibold shadow-md shadow-[#7c3aed]/15",
                )}
              >
                <Sparkles className="mr-2 inline h-4 w-4" aria-hidden />
                Buy {b.calls.toLocaleString()}
              </button>
            </form>
          </article>
        ))}
      </div>

      <p className="text-center text-xs text-[#94a3b8]">
        Secure checkout on Stripe. Receipts emailed automatically.
      </p>
    </div>
  );
}
