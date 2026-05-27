import Link from "next/link";

import type { BookingAnalyticsSnapshot } from "@/app/dashboard/analytics/booking-analytics";
import type { StripeMerchantDashboardSnapshot } from "@/lib/stripe-connect-merchant";
import { formatMoneyDisplay } from "@/lib/checkout-money";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StripeMerchantBalanceDashboard } from "@/components/dashboard/stripe-merchant-balance-dashboard";

function bookingKindLabel(kind: string): string {
  if (kind === "table") return "Tables";
  if (kind === "event") return "Events";
  if (kind === "appointment") return "Appointments";
  return kind;
}

function RequestBars({ rows }: { rows: BookingAnalyticsSnapshot["dailyRequests"] }) {
  const max = Math.max(...rows.map((r) => r.count), 1);
  if (!rows.length) return <p className="text-sm text-[#64748b]">No booking requests in this period.</p>;

  return (
    <div className="flex h-36 items-end gap-1.5 overflow-x-auto pb-1">
      {rows.map((row) => {
        const height = Math.max(8, Math.round((row.count / max) * 100));
        return (
          <div key={row.date} className="flex min-w-[2rem] flex-1 flex-col items-center gap-2">
            <div className="w-full rounded-t-lg bg-[#cbd5e1]" style={{ height: `${height}%` }} title={`${row.date}: ${row.count}`} />
            <span className="text-[10px] font-medium text-[#94a3b8]">{row.date.slice(8)}</span>
          </div>
        );
      })}
    </div>
  );
}

export function DashboardAnalyticsPanels({
  booking,
  stripe,
  stripeBusinessId,
  stripeError,
}: {
  booking: BookingAnalyticsSnapshot | null;
  stripe: StripeMerchantDashboardSnapshot | null;
  stripeBusinessId: string | null;
  stripeError: string | null;
}) {
  return (
    <div className="space-y-8">
      {booking ? (
        <section className="space-y-5">
          <div>
            <Badge className="rounded-full bg-[#ede9fe] text-[#5b21b6] hover:bg-[#ede9fe]">Booking funnel</Badge>
            <h2 className="mt-3 text-lg font-semibold text-[#0f172a]">Intake & conversion</h2>
            <p className="mt-1 text-sm text-[#64748b]">Last {booking.periodDays} days from Solvio booking requests.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="rounded-[20px] border border-[#ebe7f7] bg-white shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-[#64748b]">Requests</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold text-[#0f172a]">{booking.totalRequests}</p>
              </CardContent>
            </Card>
            <Card className="rounded-[20px] border border-[#ebe7f7] bg-white shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-[#64748b]">Paid deposits</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold text-[#0f172a]">{booking.paidDeposits}</p>
              </CardContent>
            </Card>
            <Card className="rounded-[20px] border border-[#ebe7f7] bg-white shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-[#64748b]">Conversion</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold text-[#0f172a]">{booking.conversionRate}%</p>
              </CardContent>
            </Card>
            <Card className="rounded-[20px] border border-[#ebe7f7] bg-white shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-[#64748b]">Solvio-tracked revenue</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold text-[#0f172a]">
                  {formatMoneyDisplay(booking.bookingRevenueCents)}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="rounded-[22px] border border-[#ebe7f7] bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="text-base text-[#0f172a]">Daily requests</CardTitle>
              </CardHeader>
              <CardContent className="pb-6">
                <RequestBars rows={booking.dailyRequests} />
              </CardContent>
            </Card>
            <Card className="rounded-[22px] border border-[#ebe7f7] bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="text-base text-[#0f172a]">By booking type</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pb-6">
                {booking.requestsByKind.map((row) => (
                  <div key={row.kind} className="flex items-center justify-between rounded-xl bg-[#fafbff] px-3 py-2.5">
                    <span className="text-sm font-medium text-[#0f172a]">{bookingKindLabel(row.kind)}</span>
                    <span className="text-sm font-semibold text-[#5b21b6]">{row.count}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </section>
      ) : null}

      <section className="space-y-5">
        <div>
          <Badge className="rounded-full bg-[#dbeafe] text-[#1e40af] hover:bg-[#dbeafe]">Stripe Connect</Badge>
          <h2 className="mt-3 text-lg font-semibold text-[#0f172a]">Live balance & guest payments</h2>
          <p className="mt-1 text-sm text-[#64748b]">
            Pulled from your connected Stripe account — same data merchants would see in Express, surfaced inside Solvio.
          </p>
        </div>

        {stripe && stripeBusinessId ? (
          <StripeMerchantBalanceDashboard initialData={stripe} businessId={stripeBusinessId} />
        ) : (
          <Card className="rounded-[22px] border border-dashed border-[#cbd5e1] bg-[#fafbff]/80 shadow-none">
            <CardHeader>
              <CardTitle className="text-base text-[#0f172a]">Stripe analytics locked</CardTitle>
              <CardDescription>{stripeError ?? "Connect Stripe to view balance, payouts, and guest payment history."}</CardDescription>
            </CardHeader>
            <CardContent className="pb-6">
              <Link href="/dashboard/payments" className="text-sm font-semibold text-[#7c3aed] underline-offset-2 hover:underline">
                Set up payments →
              </Link>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
