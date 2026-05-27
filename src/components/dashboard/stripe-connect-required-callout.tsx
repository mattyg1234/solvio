"use client";

import { useState, useTransition } from "react";
import { ExternalLink, Loader2 } from "lucide-react";

import { startStripeConnectOnboardingAction } from "@/app/dashboard/payments/connect-actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function StripeConnectRequiredCallout({
  businessId,
  className,
  highlighted = false,
}: {
  businessId: string;
  className?: string;
  highlighted?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function connectStripe() {
    setError(null);
    startTransition(() => {
      void (async () => {
        const result = await startStripeConnectOnboardingAction(businessId);
        if (!result.ok) {
          setError(result.message);
          return;
        }
        window.location.href = result.data.url;
      })();
    });
  }

  return (
    <div
      id="stripe-connect-required"
      className={cn(
        "rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-4 sm:flex sm:items-center sm:justify-between sm:gap-4",
        highlighted && "ring-2 ring-amber-300",
        className,
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-amber-950">To accept payments, connect Stripe</p>
        <p className="mt-1 text-sm leading-relaxed text-amber-900/90">
          Sign in to your existing Stripe account or create one in a few minutes. Card payments go straight to you — Solvio
          never holds your money.
        </p>
        {error ? <p className="mt-2 text-sm text-rose-900">{error}</p> : null}
      </div>
      <Button
        type="button"
        disabled={pending}
        className="mt-3 shrink-0 rounded-full font-semibold sm:mt-0"
        onClick={connectStripe}
      >
        {pending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <ExternalLink className="mr-2 h-4 w-4" aria-hidden />
        )}
        Connect Stripe
      </Button>
    </div>
  );
}
