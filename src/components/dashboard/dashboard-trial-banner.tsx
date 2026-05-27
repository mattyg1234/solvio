import Link from "next/link";

import { checkoutBookingAction } from "@/app/dashboard/pricing/checkout-actions";
import { buttonVariants } from "@/components/ui/button";
import {
  BOOKING_MONTHLY_GBP,
  BOOKING_TRIAL_DAYS,
  formatTrialEndDate,
  isTrialExpired,
  trialDaysRemaining,
} from "@/lib/solvio-pricing";
import { cn } from "@/lib/utils";

type DashboardTrialBannerProps = {
  subscriptionTier: string;
  businessCreatedAt: string | null;
};

export function DashboardTrialBanner({ subscriptionTier, businessCreatedAt }: DashboardTrialBannerProps) {
  if (subscriptionTier !== "trial" || !businessCreatedAt) return null;

  const expired = isTrialExpired(businessCreatedAt);
  const daysLeft = trialDaysRemaining(businessCreatedAt);
  const endLabel = formatTrialEndDate(businessCreatedAt);

  return (
    <div
      className={cn(
        "border-b px-4 py-3 md:px-8",
        expired ? "border-red-200 bg-red-50" : daysLeft <= 3 ? "border-amber-200 bg-amber-50" : "border-[#ddd6fe] bg-[#faf5ff]",
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className={cn("text-sm", expired ? "text-red-900" : daysLeft <= 3 ? "text-amber-950" : "text-[#5b21b6]")}>
          {expired ? (
            <>
              <span className="font-semibold">Your free trial has ended.</span> Add a card to keep your public /book link live.
            </>
          ) : (
            <>
              <span className="font-semibold">
                {daysLeft} day{daysLeft === 1 ? "" : "s"} left
              </span>{" "}
              on your {BOOKING_TRIAL_DAYS}-day trial
              {endLabel ? ` (ends ${endLabel})` : ""}. Add a card now — we won&apos;t charge until the trial ends.
            </>
          )}
        </p>
        <form action={checkoutBookingAction} className="shrink-0">
          <button
            type="submit"
            className={cn(
              buttonVariants({ variant: "default", size: "sm" }),
              "h-9 rounded-full px-5 text-sm font-semibold shadow-md shadow-[#7c3aed]/20",
            )}
          >
            Add card · £{BOOKING_MONTHLY_GBP}/mo →
          </button>
        </form>
      </div>
    </div>
  );
}

export function DashboardTrialChip({ subscriptionTier, businessCreatedAt }: DashboardTrialBannerProps) {
  if (subscriptionTier !== "trial" || !businessCreatedAt) return null;

  const expired = isTrialExpired(businessCreatedAt);
  const daysLeft = trialDaysRemaining(businessCreatedAt);

  return (
    <Link
      href="/dashboard/pricing"
      className={cn(
        "inline-flex items-center rounded-full px-3 py-2 text-xs font-semibold",
        expired
          ? "border border-red-200 bg-red-50 text-red-900 hover:bg-red-100"
          : daysLeft <= 3
            ? "border border-amber-200 bg-amber-50 text-amber-950 hover:bg-amber-100"
            : "border border-[#c4b5fd] bg-[#f5f3ff] text-[#5b21b6] hover:bg-[#ede9fe]",
      )}
    >
      {expired ? "Trial ended · Add card" : `${daysLeft}d left · Plans`}
    </Link>
  );
}
