import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type GetLiveStripProps = {
  bookingFlowComplete: boolean;
  stripeChargesEnabled: boolean;
  slugPublished: boolean;
};

export function GetLiveStrip({ bookingFlowComplete, stripeChargesEnabled, slugPublished }: GetLiveStripProps) {
  if (bookingFlowComplete && stripeChargesEnabled && slugPublished) return null;

  const missing: string[] = [];
  if (!bookingFlowComplete) missing.push("booking flow");
  if (!stripeChargesEnabled) missing.push("Stripe Connect");
  if (!slugPublished) missing.push("public link");

  return (
    <div className="rounded-[20px] border border-[#ddd6fe] bg-gradient-to-r from-[#faf5ff] to-white px-5 py-4 md:flex md:items-center md:justify-between md:gap-6">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-[#5b21b6]">Finish getting live</p>
        <p className="text-sm leading-relaxed text-[#64748b]">
          Still needed: {missing.join(" · ")}. Work through the launch checklist on Overview — one path, no guesswork.
        </p>
      </div>
      <Link
        href="/dashboard"
        className={cn(
          buttonVariants({ variant: "default" }),
          "mt-3 inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-5 text-sm font-semibold md:mt-0",
        )}
      >
        Open launch checklist
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  );
}
