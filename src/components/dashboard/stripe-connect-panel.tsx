"use client";

import { useState, useTransition } from "react";
import { ExternalLink, Loader2 } from "lucide-react";

import {
  disconnectStripeConnectAction,
  refreshStripeConnectStatusAction,
  startStripeConnectOnboardingAction,
} from "@/app/dashboard/payments/connect-actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export type StripeConnectBusinessRow = {
  id: string;
  name: string;
  stripe_connect_account_id: string | null;
  stripe_connect_charges_enabled: boolean | null;
  stripe_connect_details_submitted: boolean | null;
};

export function StripeConnectPanel({ businesses }: { businesses: StripeConnectBusinessRow[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmDisconnectId, setConfirmDisconnectId] = useState<string | null>(null);

  function run(fn: () => Promise<void>) {
    setError(null);
    startTransition(() => {
      void fn().catch((e) => {
        setError(e instanceof Error ? e.message : "Something went wrong.");
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
      <ul className="space-y-3">
        {businesses.map((b) => {
          const linked = Boolean(b.stripe_connect_account_id);
          const ready = linked && Boolean(b.stripe_connect_charges_enabled);
          const acctTail = b.stripe_connect_account_id?.slice(-8);
          return (
            <li
              key={b.id}
              className="flex flex-col gap-3 rounded-2xl border border-[#f1eefc] bg-[#fafbff] px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-semibold text-[#0f172a]">{b.name}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {ready ? (
                    <Badge className="rounded-full bg-emerald-50 text-emerald-800 hover:bg-emerald-50">
                      Ready to collect payments
                    </Badge>
                  ) : linked ? (
                    <Badge variant="outline" className="rounded-full border-amber-200 bg-amber-50 text-amber-900">
                      Onboarding incomplete
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="rounded-full border-[#ebe7f7] text-[#64748b]">
                      Not connected
                    </Badge>
                  )}
                </div>
                {linked && acctTail ? (
                  <p className="mt-2 text-xs text-[#64748b]">
                    Connected account ···{acctTail} — stays linked until you disconnect below.
                  </p>
                ) : (
                  <p className="mt-2 max-w-md text-xs leading-relaxed text-[#64748b]">
                    Click <span className="font-semibold text-[#5b21b6]">Connect Stripe</span> to either{" "}
                    <span className="font-semibold text-[#0f172a]">link your existing Stripe account</span> (Stripe asks you to sign in) or{" "}
                    <span className="font-semibold text-[#0f172a]">create a new one</span> on the spot — both paths take ~2 minutes and finish in a single window.
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={pending}
                  className="rounded-full font-semibold"
                  onClick={() =>
                    run(async () => {
                      const { url } = await startStripeConnectOnboardingAction(b.id);
                      window.location.href = url;
                    })
                  }
                >
                  {pending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <ExternalLink className="mr-2 h-4 w-4" aria-hidden />
                  )}
                  {linked ? "Manage in Stripe" : "Connect Stripe"}
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
                          await refreshStripeConnectStatusAction(b.id);
                        })
                      }
                    >
                      Refresh status
                    </Button>
                    {confirmDisconnectId === b.id ? (
                      <>
                        <Button
                          type="button"
                          variant="destructive"
                          disabled={pending}
                          className="rounded-full"
                          onClick={() =>
                            run(async () => {
                              await disconnectStripeConnectAction(b.id);
                              setConfirmDisconnectId(null);
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
                        onClick={() => setConfirmDisconnectId(b.id)}
                      >
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
