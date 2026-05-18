import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CreditCard } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Payments · Dashboard · Solvio",
};

export default async function DashboardPaymentsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: businesses } = await supabase
    .from("businesses")
    .select("id,name,stripe_connect_account_id")
    .eq("owner_id", user.id);

  const stripeConnected = businesses?.some((b) => Boolean(b.stripe_connect_account_id)) ?? false;

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
              Deposits without clipboard gymnastics
            </h1>
            <p className="max-w-2xl text-[15px] leading-relaxed text-[#64748b]">
              Hosted invoices and capture flows route through your connected account — Solvio never parks funds on behalf of your brand.
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
                  stripeConnected ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100" : "bg-amber-50 text-amber-900 ring-1 ring-amber-100"
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${stripeConnected ? "bg-emerald-500" : "bg-amber-400"}`} />
                {stripeConnected ? "Stripe connected" : "Onboarding incomplete"}
              </span>
            </div>
          </div>
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#f5f3ff] text-[#7c3aed] ring-1 ring-[#ebe7f7]">
            <CreditCard className="h-7 w-7" aria-hidden />
          </span>
        </div>
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        <Card className="rounded-[22px] border border-[#ebe7f7] bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-base text-[#0f172a]">Ledger hygiene</CardTitle>
            <CardDescription className="text-[13px] leading-relaxed text-[#64748b]">
              Future payouts, refunds and disputes surface here once Stripe webhooks land.
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-6">
            <p className="text-sm font-medium text-[#64748b]">
              {stripeConnected
                ? "Webhook ingestion is the next unlock — balances stay authoritative in Stripe."
                : "Finish Connect onboarding so test charges can exercise the full funnel."}
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-[22px] border border-[#ebe7f7] bg-white shadow-sm ring-1 ring-[#ede9fe]/40">
          <CardHeader>
            <CardTitle className="text-base text-[#0f172a]">Business coverage</CardTitle>
            <CardDescription className="text-[13px] leading-relaxed text-[#64748b]">
              Each workspace row can carry its own Connect account when you operate multiple venues.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pb-6">
            {!businesses?.length ? (
              <p className="text-sm text-[#64748b]">No businesses on file yet — complete signup or insert a row via SQL.</p>
            ) : (
              <ul className="space-y-2">
                {businesses.map((b) => (
                  <li
                    key={b.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#f1eefc] bg-[#fafbff] px-3 py-2.5 text-sm text-[#0f172a]"
                  >
                    <span className="font-medium">{b.name}</span>
                    {b.stripe_connect_account_id ? (
                      <Badge variant="outline" className="rounded-full border-emerald-100 bg-emerald-50 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-800">
                        Linked
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="rounded-full border-amber-100 bg-amber-50 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-900">
                        Pending
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
