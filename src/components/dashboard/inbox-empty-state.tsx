"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Copy, Link2 } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function InboxEmptyState({
  publicBookingUrl,
  bookingFlowComplete,
}: {
  publicBookingUrl?: string | null;
  bookingFlowComplete?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    if (!publicBookingUrl) return;
    try {
      await navigator.clipboard.writeText(publicBookingUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="rounded-2xl border border-[#f1eefc] bg-[#fafbff] px-4 py-8 text-center">
      <p className="text-sm leading-relaxed text-[#64748b]">
        No submissions yet — share your booking link on Instagram, Google Business, QR menus, or SMS footers so guests land here
        first.
      </p>
      {publicBookingUrl ? (
        <div className="mx-auto mt-5 max-w-md space-y-3">
          <div className="flex flex-wrap items-center justify-center gap-2 rounded-xl border border-[#ebe7f7] bg-white px-3 py-2">
            <Link2 className="h-4 w-4 shrink-0 text-[#7c3aed]" aria-hidden />
            <a
              href={publicBookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 truncate font-mono text-[13px] text-[#5b21b6] hover:underline"
            >
              {publicBookingUrl}
            </a>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              className={cn(buttonVariants({ variant: "default", size: "sm" }), "rounded-full font-semibold")}
              onClick={() => void copyLink()}
            >
              {copied ? (
                <>
                  <Check className="mr-1.5 inline h-4 w-4" aria-hidden />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="mr-1.5 inline h-4 w-4" aria-hidden />
                  Copy booking link
                </>
              )}
            </button>
            <Link
              href="#booking-links"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "rounded-full font-semibold")}
            >
              Manage link
            </Link>
          </div>
        </div>
      ) : bookingFlowComplete ? (
        <p className="mt-4 text-sm text-[#64748b]">
          Publish your link in{" "}
          <Link href="#booking-links" className="font-semibold text-[#7c3aed] underline-offset-2 hover:underline">
            Guest booking link
          </Link>{" "}
          below.
        </p>
      ) : (
        <p className="mt-4 text-sm text-[#64748b]">
          Finish setup on{" "}
          <Link href="/dashboard" className="font-semibold text-[#7c3aed] underline-offset-2 hover:underline">
            Overview → launch checklist
          </Link>
          , then share your link.
        </p>
      )}
    </div>
  );
}
