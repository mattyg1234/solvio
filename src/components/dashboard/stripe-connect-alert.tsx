import Link from "next/link";
import { AlertTriangle, CreditCard } from "lucide-react";

import {
  businessRowNeedsStripeAlert,
  describeStripeConnectDisplay,
  snapshotFromBusinessRow,
  type StripeConnectHealthRow,
} from "@/lib/stripe-connect-status";
import { cn } from "@/lib/utils";

type AlertBusiness = StripeConnectHealthRow & { id: string; name: string };

export function StripeConnectAlert({ businesses }: { businesses: AlertBusiness[] }) {
  const alerts = businesses
    .filter((b) => businessRowNeedsStripeAlert(b))
    .map((b) => ({
      id: b.id,
      name: b.name,
      display: describeStripeConnectDisplay(b.stripe_connect_account_id, snapshotFromBusinessRow(b)),
    }));

  if (!alerts.length) return null;

  return (
    <div className="border-b border-[#ebe7f7]/90 bg-white px-4 py-3 md:px-8">
      <ul className="mx-auto flex max-w-6xl flex-col gap-2">
        {alerts.map(({ id, name, display }) => {
          const critical = display.severity === "critical";
          return (
            <li key={id}>
              <Link
                href="/dashboard/payments?tab=connection"
                className={cn(
                  "flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm transition-colors hover:opacity-95",
                  critical
                    ? "border-rose-200 bg-rose-50 text-rose-950 hover:bg-rose-100/80"
                    : "border-amber-200 bg-amber-50 text-amber-950 hover:bg-amber-100/80",
                )}
              >
                {critical ? (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden />
                ) : (
                  <CreditCard className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                )}
                <span>
                  <span className="font-semibold">
                    {critical ? "Stripe account restricted" : "Stripe setup incomplete"}
                    {alerts.length > 1 ? ` · ${name}` : ""}
                  </span>
                  <span className="mt-0.5 block text-[13px] leading-relaxed opacity-90">{display.message}</span>
                  <span className="mt-1 inline-block text-xs font-semibold underline-offset-2 hover:underline">
                    Open Stripe connection →
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
