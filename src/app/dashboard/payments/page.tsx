import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CreditCard } from "lucide-react";

import { StripeConnectPanel } from "@/components/dashboard/stripe-connect-panel";
import { StripeMerchantBalanceDashboard } from "@/components/dashboard/stripe-merchant-balance-dashboard";
import { refreshStripeConnectStatusAction } from "@/app/dashboard/payments/connect-actions";
import { loadStripeMerchantDashboardAction } from "@/app/dashboard/payments/merchant-data-actions";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  describeStripeConnectDisplay,
  snapshotFromBusinessRow,
} from "@/lib/stripe-connect-status";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Payments · Dashboard · Solvio",
};

const STRIPE_BUSINESS_SELECT =
  "id,name,stripe_connect_account_id,stripe_connect_charges_enabled,stripe_connect_details_submitted,stripe_connect_payouts_enabled,stripe_connect_disabled_reason,stripe_connect_requirements_due";

export default async function DashboardPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ connect?: string; tab?: string; business?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const sp = await searchParams;
  const activeTab = sp.tab === "activity" ? "activity" : "connection";

  const connectFlash =
    sp.connect === "return"
      ? "Returned from Stripe — status refreshed below."
      : sp.connect === "refresh"
        ? "Stripe needs a little more information — continue setup on the Connection tab."
        : null;

  const { data: businesses } = await supabase
    .from("businesses")
    .select(STRIPE_BUSINESS_SELECT)
    .eq("owner_id", user.id);

  if (sp.connect === "return" && businesses?.length) {
    const toRefresh = sp.business?.trim()
      ? businesses.filter((b) => b.id === sp.business?.trim())
      : businesses;
    for (const b of toRefresh) {
      if (b.stripe_connect_account_id?.trim()) {
        await refreshStripeConnectStatusAction(b.id);
      }
    }
  }

  const { data: businessesRefreshed } = await supabase
    .from("businesses")
    .select(STRIPE_BUSINESS_SELECT)
    .eq("owner_id", user.id);

  const businessRows = businessesRefreshed ?? [];

  const stripeReady = businessRows.some(
    (b) => Boolean(b.stripe_connect_account_id && b.stripe_connect_charges_enabled),
  );

  const hasRestricted = businessRows.some((b) => {
    if (!b.stripe_connect_account_id?.trim()) return false;
    return (
      describeStripeConnectDisplay(b.stripe_connect_account_id, snapshotFromBusinessRow(b)).status ===
      "restricted"
    );
  });

  const primaryConnected = businessRows.find(
    (b) => b.stripe_connect_account_id?.trim() && b.stripe_connect_charges_enabled,
  );
  const merchantDashboard =
    primaryConnected?.id && primaryConnected.stripe_connect_account_id
      ? await loadStripeMerchantDashboardAction(primaryConnected.id)
      : null;

  const showActivity = Boolean(merchantDashboard?.ok);

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
              Connect once — guest payments land in your Stripe balance. Solvio&apos;s platform fee depends on your plan
              (1–5% — see{" "}
              <Link href="/dashboard/pricing" className="font-semibold text-[#7c3aed] underline-offset-2 hover:underline">
                Plans
              </Link>
              ). Manage your connection, disconnect, or reconnect anytime on the Connection tab.
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span
                className={cn(
                  "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ring-1",
                  hasRestricted
                    ? "bg-rose-50 text-rose-900 ring-rose-100"
                    : stripeReady
                      ? "bg-emerald-50 text-emerald-800 ring-emerald-100"
                      : "bg-amber-50 text-amber-900 ring-amber-100",
                )}
              >
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    hasRestricted ? "bg-rose-500" : stripeReady ? "bg-emerald-500" : "bg-amber-400",
                  )}
                />
                {hasRestricted
                  ? "Stripe account restricted — action required"
                  : stripeReady
                    ? "Ready to collect deposits"
                    : "Connect Stripe to go live"}
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

      <div className="flex flex-wrap gap-2 border-b border-[#ebe7f7] pb-1">
        <Link
          href="/dashboard/payments?tab=connection"
          className={cn(
            "rounded-t-lg px-4 py-2.5 text-sm font-semibold transition-colors",
            activeTab === "connection"
              ? "border-b-2 border-[#7c3aed] text-[#7c3aed]"
              : "text-[#64748b] hover:text-[#0f172a]",
          )}
        >
          Connection
        </Link>
        {showActivity ? (
          <Link
            href="/dashboard/payments?tab=activity"
            className={cn(
              "rounded-t-lg px-4 py-2.5 text-sm font-semibold transition-colors",
              activeTab === "activity"
                ? "border-b-2 border-[#7c3aed] text-[#7c3aed]"
                : "text-[#64748b] hover:text-[#0f172a]",
            )}
          >
            Balance & activity
          </Link>
        ) : null}
      </div>

      {activeTab === "connection" ? (
        <>
          <Card className="rounded-[22px] border border-[#ede9fe] bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-base text-[#0f172a]">Stripe connection</CardTitle>
              <CardDescription className="text-[13px] leading-relaxed text-[#64748b]">
                Link your Express account, refresh status from Stripe, disconnect Solvio&apos;s link, or reconnect to
                start fresh. If Stripe restricts your account, the banner appears across your dashboard until resolved.
              </CardDescription>
            </CardHeader>
            <CardContent className="pb-6">
              <StripeConnectPanel businesses={businessRows} />
            </CardContent>
          </Card>

          <div className="grid gap-5 md:grid-cols-2">
            <Card className="rounded-[22px] border border-[#ebe7f7] bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="text-base text-[#0f172a]">How pricing works</CardTitle>
                <CardDescription className="text-[13px] leading-relaxed text-[#64748b]">
                  You choose deposit amounts when you configure each table — flat per table, per guest, or tiered by
                  party size.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 pb-6">
                <p className="text-sm font-medium text-[#64748b]">
                  {stripeReady
                    ? "Payments are live. Edit table prices anytime under Bookings → Tables."
                    : hasRestricted
                      ? "Resolve the Stripe restriction above before guest checkout can work."
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
                <CardTitle className="text-base text-[#0f172a]">Solvio platform subscription</CardTitle>
                <CardDescription className="text-[13px] leading-relaxed text-[#64748b]">
                  Guest deposits (above) are separate from your Solvio plan. Booking is £50/mo after your free trial.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pb-6">
                <p className="text-sm text-[#64748b]">
                  Connect Stripe for guest payments — then add a card on the Booking plan so your public /book link stays
                  live.
                </p>
                <Link
                  href="/dashboard/pricing"
                  className={cn(
                    buttonVariants({ variant: "default" }),
                    "inline-flex h-10 rounded-full px-6 text-sm font-semibold shadow-md shadow-[#7c3aed]/20",
                  )}
                >
                  View plans · Booking from £50/mo →
                </Link>
              </CardContent>
            </Card>
          </div>
        </>
      ) : showActivity && merchantDashboard?.ok ? (
        <Card className="rounded-[22px] border border-[#ede9fe] bg-white shadow-sm">
          <CardContent className="pb-8 pt-6">
            <StripeMerchantBalanceDashboard
              initialData={merchantDashboard.data}
              businessId={merchantDashboard.data.businessId}
            />
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-[#64748b]">
          Connect Stripe and enable charges to see balance and activity here.
        </p>
      )}
    </div>
  );
}
