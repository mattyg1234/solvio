"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, ExternalLink, Loader2, RefreshCw, Unplug } from "lucide-react";

import {
  disconnectStripeConnectAction,
  reconnectStripeConnectAction,
  refreshStripeConnectStatusAction,
  startStripeConnectOnboardingAction,
} from "@/app/dashboard/payments/connect-actions";
import {
  describeStripeConnectDisplay,
  snapshotFromBusinessRow,
  type StripeConnectHealthRow,
} from "@/lib/stripe-connect-status";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type StripeConnectBusinessRow = StripeConnectHealthRow & {
  id: string;
  name: string;
};

export function StripeConnectPanel({ businesses }: { businesses: StripeConnectBusinessRow[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmDisconnectId, setConfirmDisconnectId] = useState<string | null>(null);
  const [confirmReconnectId, setConfirmReconnectId] = useState<string | null>(null);

  function run(fn: () => Promise<void>) {
    setError(null);
    setSuccess(null);
    startTransition(() => {
      void fn().catch(() => {
        setError("Something went wrong.");
      });
    });
  }

  if (!businesses.length) {
    return (
      <p className="text-sm text-[#64748b]">Add a business in Settings before connecting Stripe.</p>
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</p>
      ) : null}
      {success ? (
        <p className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {success}
        </p>
      ) : null}
      <ul className="space-y-4">
        {businesses.map((b) => {
          const snap = snapshotFromBusinessRow(b);
          const display = describeStripeConnectDisplay(b.stripe_connect_account_id, snap);
          const linked = Boolean(b.stripe_connect_account_id?.trim());
          const acctTail = b.stripe_connect_account_id?.slice(-8);
          const restricted = display.status === "restricted";

          return (
            <li
              key={b.id}
              className={cn(
                "flex flex-col gap-4 rounded-2xl border px-4 py-4 sm:px-5 sm:py-5",
                restricted
                  ? "border-rose-200 bg-rose-50/40"
                  : "border-[#f1eefc] bg-[#fafbff]",
              )}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[#0f172a]">{b.name}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {display.status === "ready" ? (
                      <Badge className="rounded-full bg-emerald-50 text-emerald-800 hover:bg-emerald-50">
                        {display.title}
                      </Badge>
                    ) : display.status === "restricted" ? (
                      <Badge className="rounded-full bg-rose-100 text-rose-900 hover:bg-rose-100">
                        {display.title}
                      </Badge>
                    ) : display.status === "onboarding" ? (
                      <Badge variant="outline" className="rounded-full border-amber-200 bg-amber-50 text-amber-900">
                        {display.title}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="rounded-full border-[#ebe7f7] text-[#64748b]">
                        {display.title}
                      </Badge>
                    )}
                  </div>
                  <p
                    className={cn(
                      "mt-2 max-w-xl text-sm leading-relaxed",
                      restricted ? "font-medium text-rose-900" : "text-[#64748b]",
                    )}
                  >
                    {display.message}
                  </p>
                  {linked && acctTail ? (
                    <p className="mt-2 text-xs text-[#64748b]">
                      Connect account ···{acctTail}
                      {snap.chargesEnabled ? " · charges enabled" : " · charges disabled"}
                      {snap.payoutsEnabled ? " · payouts enabled" : ""}
                    </p>
                  ) : (
                    <p className="mt-2 max-w-md text-xs leading-relaxed text-[#64748b]">
                      Link an existing Stripe account or create a new Express account — both finish in one Stripe
                      window (~2 minutes).
                    </p>
                  )}
                </div>
              </div>

              {display.requirementsDue.length > 0 ? (
                <div
                  className={cn(
                    "rounded-xl border px-4 py-3",
                    restricted ? "border-rose-200 bg-white/80" : "border-amber-100 bg-white/70",
                  )}
                >
                  <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#64748b]">
                    {restricted ? (
                      <AlertTriangle className="h-3.5 w-3.5 text-rose-600" aria-hidden />
                    ) : null}
                    Stripe needs
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-[#0f172a]">
                    {display.requirementsDue.slice(0, 8).map((req) => (
                      <li key={req} className="list-inside list-disc">
                        {req}
                      </li>
                    ))}
                    {display.requirementsDue.length > 8 ? (
                      <li className="text-xs text-[#64748b]">
                        +{display.requirementsDue.length - 8} more in Stripe
                      </li>
                    ) : null}
                  </ul>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2 border-t border-[#ebe7f7]/80 pt-4">
                <Button
                  type="button"
                  disabled={pending}
                  className="rounded-full font-semibold"
                  onClick={() =>
                    run(async () => {
                      const result = await startStripeConnectOnboardingAction(b.id);
                      if (!result.ok) {
                        setError(result.message);
                        return;
                      }
                      window.location.href = result.data.url;
                    })
                  }
                >
                  {pending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <ExternalLink className="mr-2 h-4 w-4" aria-hidden />
                  )}
                  {linked ? (restricted ? "Fix in Stripe" : "Continue in Stripe") : "Connect Stripe"}
                </Button>

                {linked ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={pending}
                      className="rounded-full"
                      onClick={() =>
                        run(async () => {
                          const result = await refreshStripeConnectStatusAction(b.id);
                          if (!result.ok) {
                            setError(result.message);
                            return;
                          }
                          setSuccess(
                            result.data.displayStatus === "ready"
                              ? "Stripe is ready to collect payments."
                              : result.data.displayStatus === "restricted"
                                ? "Status refreshed — Stripe still reports this account as restricted."
                                : "Status refreshed from Stripe.",
                          );
                        })
                      }
                    >
                      <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
                      Refresh status
                    </Button>

                    {confirmReconnectId === b.id ? (
                      <>
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={pending}
                          className="rounded-full"
                          onClick={() =>
                            run(async () => {
                              const result = await reconnectStripeConnectAction(b.id);
                              if (!result.ok) {
                                setError(result.message);
                                return;
                              }
                              setConfirmReconnectId(null);
                              window.location.href = result.data.url;
                            })
                          }
                        >
                          Confirm reconnect
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={pending}
                          className="rounded-full"
                          onClick={() => setConfirmReconnectId(null)}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={pending}
                        className="rounded-full"
                        onClick={() => {
                          setConfirmDisconnectId(null);
                          setConfirmReconnectId(b.id);
                        }}
                      >
                        Reconnect
                      </Button>
                    )}

                    {confirmDisconnectId === b.id ? (
                      <>
                        <Button
                          type="button"
                          variant="destructive"
                          disabled={pending}
                          className="rounded-full"
                          onClick={() =>
                            run(async () => {
                              const result = await disconnectStripeConnectAction(b.id);
                              if (!result.ok) {
                                setError(result.message);
                                return;
                              }
                              setConfirmDisconnectId(null);
                              setSuccess("Disconnected from Stripe on Solvio. Guest checkout is paused until you connect again.");
                            })
                          }
                        >
                          Confirm disconnect
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={pending}
                          className="rounded-full"
                          onClick={() => setConfirmDisconnectId(null)}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={pending}
                        className="rounded-full text-rose-700"
                        onClick={() => {
                          setConfirmReconnectId(null);
                          setConfirmDisconnectId(b.id);
                        }}
                      >
                        <Unplug className="mr-2 h-4 w-4" aria-hidden />
                        Disconnect
                      </Button>
                    )}
                  </>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
