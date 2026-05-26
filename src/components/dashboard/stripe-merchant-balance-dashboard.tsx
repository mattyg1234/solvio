"use client";

import { useState, useTransition } from "react";
import { ExternalLink, Loader2, RefreshCw, Wallet } from "lucide-react";

import { loadStripeMerchantDashboardAction } from "@/app/dashboard/payments/merchant-data-actions";
import type { StripeMerchantDashboardSnapshot } from "@/lib/stripe-connect-merchant";
import { formatMerchantMoney } from "@/lib/stripe-connect-merchant";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function VolumeBars({ rows, currency }: { rows: StripeMerchantDashboardSnapshot["dailyVolume"]; currency: string }) {
  const max = Math.max(...rows.map((r) => r.grossCents), 1);
  if (!rows.length) {
    return <p className="text-sm text-[#64748b]">No guest payments in this period yet.</p>;
  }

  return (
    <div className="flex h-40 items-end gap-1.5 overflow-x-auto pb-1">
      {rows.map((row) => {
        const height = Math.max(8, Math.round((row.grossCents / max) * 100));
        return (
          <div key={row.date} className="flex min-w-[2rem] flex-1 flex-col items-center gap-2">
            <div
              className="w-full rounded-t-lg bg-gradient-to-t from-[#7c3aed] to-[#a78bfa]"
              style={{ height: `${height}%` }}
              title={`${formatShortDate(row.date)} · ${formatMerchantMoney(row.grossCents, currency)} · ${row.chargeCount} payment${row.chargeCount === 1 ? "" : "s"}`}
            />
            <span className="text-[10px] font-medium text-[#94a3b8]">{row.date.slice(8)}</span>
          </div>
        );
      })}
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-[#f1eefc] bg-[#fafbff] px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-[#0f172a]">{value}</p>
      {hint ? <p className="mt-1 text-xs text-[#64748b]">{hint}</p> : null}
    </div>
  );
}

export function StripeMerchantBalanceDashboard({
  initialData,
  businessId,
}: {
  initialData: StripeMerchantDashboardSnapshot;
  businessId: string;
}) {
  const [data, setData] = useState(initialData);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function refresh() {
    setError(null);
    startTransition(() => {
      void loadStripeMerchantDashboardAction(businessId).then((result) => {
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setData(result.data);
      });
    });
  }

  const money = (cents: number) => formatMerchantMoney(cents, data.currency);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Wallet className="h-5 w-5 text-[#7c3aed]" aria-hidden />
            <h2 className="text-lg font-semibold text-[#0f172a]">Balance & payouts</h2>
            <Badge className="rounded-full bg-[#ede9fe] text-[#5b21b6] hover:bg-[#ede9fe]">Live from Stripe</Badge>
          </div>
          <p className="mt-1 text-sm text-[#64748b]">
            {data.businessName} · updated {formatDateTime(data.fetchedAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="rounded-full" disabled={pending} onClick={refresh}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="mr-2 h-4 w-4" aria-hidden />}
            Refresh
          </Button>
          {data.expressDashboardUrl ? (
            <a
              href={data.expressDashboardUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: "default" }), "rounded-full font-semibold")}
            >
              <ExternalLink className="mr-2 h-4 w-4" aria-hidden />
              Refunds & disputes
            </a>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Available" value={money(data.availableCents)} hint="Ready for payout" />
        <StatCard label="Pending" value={money(data.pendingCents)} hint="Still clearing" />
        <StatCard
          label={`${data.periodDays}-day gross`}
          value={money(data.periodGrossCents)}
          hint={`${data.periodChargeCount} successful payment${data.periodChargeCount === 1 ? "" : "s"}`}
        />
        <StatCard
          label={`${data.periodDays}-day net`}
          value={money(data.periodNetCents)}
          hint={`${money(data.periodPlatformFeeCents)} Solvio platform fee`}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="rounded-[22px] border border-[#ebe7f7] bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-base text-[#0f172a]">Guest payment volume</CardTitle>
            <CardDescription>Daily gross deposits over the last {data.periodDays} days.</CardDescription>
          </CardHeader>
          <CardContent className="pb-6">
            <VolumeBars rows={data.dailyVolume} currency={data.currency} />
          </CardContent>
        </Card>

        <Card className="rounded-[22px] border border-[#ebe7f7] bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-base text-[#0f172a]">Recent payouts</CardTitle>
            <CardDescription>Transfers from your Stripe balance to your bank.</CardDescription>
          </CardHeader>
          <CardContent className="pb-6">
            {data.recentPayouts.length ? (
              <ul className="space-y-3">
                {data.recentPayouts.map((payout) => (
                  <li key={payout.id} className="flex items-center justify-between rounded-xl bg-[#fafbff] px-3 py-2.5">
                    <div>
                      <p className="text-sm font-semibold text-[#0f172a]">{money(payout.amountCents)}</p>
                      <p className="text-xs text-[#64748b]">Arrives {formatShortDate(payout.arrivalDate)}</p>
                    </div>
                    <Badge variant="outline" className="rounded-full capitalize">
                      {payout.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[#64748b]">No payouts yet — they appear after your first cleared balance.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-[22px] border border-[#ebe7f7] bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-base text-[#0f172a]">Recent guest payments</CardTitle>
          <CardDescription>
            Direct charges on your Connect account. Use Stripe Express for refunds and dispute responses.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto pb-6">
          {data.recentPayments.length ? (
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#f1eefc] text-xs uppercase tracking-[0.14em] text-[#94a3b8]">
                  <th className="pb-3 pr-4 font-semibold">When</th>
                  <th className="pb-3 pr-4 font-semibold">Guest</th>
                  <th className="pb-3 pr-4 font-semibold">Gross</th>
                  <th className="pb-3 pr-4 font-semibold">Solvio fee</th>
                  <th className="pb-3 pr-4 font-semibold">Net</th>
                  <th className="pb-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.recentPayments.map((payment) => (
                  <tr key={payment.id} className="border-b border-[#f8fafc] last:border-0">
                    <td className="py-3 pr-4 text-[#64748b]">{formatDateTime(payment.createdAt)}</td>
                    <td className="py-3 pr-4 text-[#0f172a]">{payment.guestEmail ?? payment.description ?? "Guest deposit"}</td>
                    <td className="py-3 pr-4 font-medium text-[#0f172a]">{money(payment.amountCents)}</td>
                    <td className="py-3 pr-4 text-[#64748b]">{money(payment.platformFeeCents)}</td>
                    <td className="py-3 pr-4 font-medium text-[#0f172a]">{money(payment.netCents)}</td>
                    <td className="py-3 capitalize text-[#64748b]">{payment.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-[#64748b]">No guest payments recorded in the last {data.periodDays} days.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
