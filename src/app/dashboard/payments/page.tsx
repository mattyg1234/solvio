import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CreditCard } from "lucide-react";

import { StripeConnectPanel } from "@/components/dashboard/stripe-connect-panel";
import { refreshStripeConnectStatusAction } from "@/app/dashboard/payments/connect-actions";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Payments · Dashboard · Solvio",
};

export default async function DashboardPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ connect?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const sp = await searchParams;
  const connectFlash =
    sp.connect === "return"
      ? "Stripe connected — your account stays linked until you choose Disconnect. Table prices you set in Bookings control deposit amounts."
      : sp.connect === "refresh"
        ? "Stripe needs a little more information — continue setup below."
        : null;

  const { data: businesses } = await supabase
    .from("businesses")
    .select("id,name,stripe_connect_account_id,stripe_connect_charges_enabled,stripe_connect_details_submitted")
    .eq("owner_id", user.id);

  if (sp.connect === "return" && businesses?.length) {
    for (const b of businesses) {
      if (b.stripe_connect_account_id?.trim()) {
        try {
          await refreshStripeConnectStatusAction(b.id);
        } catch {
          /* onboarding may still be incomplete */
        }
      }
    }
  }

  const { data: businessesRefreshed } = await supabase
    .from("businesses")
    .select("id,name,stripe_connect_account_id,stripe_connect_charges_enabled,stripe_connect_details_submitted")
    .eq("owner_id", user.id);

  const stripeReady =
    businessesRefreshed?.some((b) => Boolean(b.stripe_connect_account_id && b.stripe_connect_charges_enabled)) ?? false;

  return (
    <div className="space-y-8">
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

      <section className="relative overflow-hidden rounded-[28px] border border-[#ebe7f7]/90 bg-white p-8 shadow-sm md:p-10">
        <div className="pointer-events-none absolute -left-12 bottom-0 h-36 w-36 rounded-full bg-[#dbeafe]/60 blur-3xl" aria-hidden />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-3">
            <Badge className="rounded-full bg-[#ede9fe] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#5b21b6] hover:bg-[#ede9fe]">
              Stripe Connect
            </Badge>
            <h1 className="text-[clamp(1.45rem,3vw,2rem)] font-semibold tracking-tight text-[#0f172a]">
              Guest payments on your Stripe account
            </h1>
            <p className="max-w-2xl text-[15px] leading-relaxed text-[#64748b]">
              Connect once — guest payments land in your Stripe balance. Solvio's platform fee depends on your plan
              (1–2.5% — see <Link href="/dashboard/pricing" className="font-semibold text-[#7c3aed] underline-offset-2 hover:underline">Plans</Link>).
              Set prices per table under{" "}
              <Link href="/dashboard/bookings?tab=offerings&view=tables" className="font-semibold text-[#7c3aed] underline-offset-2 hover:underline">
                Bookings → Tables
              </Link>
              ; guests pay those amounts at checkout. Disconnect anytime from this page.
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
                  stripeReady
                    ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100"
                    : "bg-amber-50 text-amber-900 ring-1 ring-amber-100"
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${stripeReady ? "bg-emerald-500" : "bg-amber-400"}`} />
                {stripeReady ? "Ready to collect deposits" : "Connect Stripe to go live"}
              </span>
            </div>
          </div>
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#f5f3ff] text-[#7c3aed] ring-1 ring-[#ebe7f7]">
            <CreditCard className="h-7 w-7" aria-hidden />
          </span>
        </div>
      </section>

      {connectFlash ? (
        <p className="rounded-2xl border border-[#dbeafe] bg-[#eff6ff] px-4 py-3 text-sm text-[#1e40af]">{connectFlash}</p>
      ) : null}

      <Card className="rounded-[22px] border border-[#ede9fe] bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-base text-[#0f172a]">Connect your Stripe account</CardTitle>
          <CardDescription className="text-[13px] leading-relaxed text-[#64748b]">
            Express onboarding opens Stripe in a new tab. When charges are enabled, table bookings with guide pricing can
            offer a deposit checkout step. Solvio automatically retains your plan's platform fee (1–2.5% based on tier)
            on each guest payment; the rest settles to your Connect balance.
          </CardDescription>
        </CardHeader>
        <CardContent className="pb-6">
          <StripeConnectPanel
            businesses={
              businessesRefreshed?.map((b) => ({
                id: b.id,
                name: b.name,
                stripe_connect_account_id: b.stripe_connect_account_id,
                stripe_connect_charges_enabled: b.stripe_connect_charges_enabled,
                stripe_connect_details_submitted: b.stripe_connect_details_submitted,
              })) ?? []
            }
          />
        </CardContent>
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <Card className="rounded-[22px] border border-[#ebe7f7] bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-base text-[#0f172a]">How pricing works</CardTitle>
            <CardDescription className="text-[13px] leading-relaxed text-[#64748b]">
              You choose deposit amounts when you configure each table — flat per table, per guest, or tiered by party size.
              After a guest submits a table enquiry, Solvio can send them to Stripe Checkout for that amount.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pb-6">
            <p className="text-sm font-medium text-[#64748b]">
              {stripeReady
                ? "Payments are live. Edit table prices anytime under Bookings → Tables. Send deposit links from the inbox if a guest skipped checkout."
                : "Connect Stripe above, then set table prices under Dashboard → Bookings → Tables."}
            </p>
            <Link
              href="/dashboard/bookings?tab=offerings&view=tables"
              className="inline-flex text-sm font-semibold text-[#7c3aed] underline-offset-2 hover:underline"
            >
              Set table prices →
            </Link>
          </CardContent>
        </Card>

        <Card className="rounded-[22px] border border-[#ebe7f7] bg-white shadow-sm ring-1 ring-[#ede9fe]/40">
          <CardHeader>
            <CardTitle className="text-base text-[#0f172a]">Solvio subscription</CardTitle>
            <CardDescription className="text-[13px] leading-relaxed text-[#64748b]">
              Platform plans (Pro / Business / Scale) bill separately via{" "}
              <Link href="/dashboard/pricing" className="font-semibold text-[#7c3aed] underline-offset-2 hover:underline">
                Plans
              </Link>
              .
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-6">
            <p className="text-sm text-[#64748b]">
              Guest deposits use your Connect account with a tier-based platform fee (1–2.5% — lower fees on higher plans).
              Solvio SaaS subscriptions bill separately via the platform Stripe account configured in env.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
