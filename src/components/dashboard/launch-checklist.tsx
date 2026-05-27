"use client";

import Link from "next/link";
import { useState } from "react";
import {
  CalendarRange,
  CheckCircle2,
  Circle,
  Copy,
  CreditCard,
  Link2,
  Mic2,
  Sparkles,
} from "lucide-react";

import { StripeConnectRequiredCallout } from "@/components/dashboard/stripe-connect-required-callout";
import { bookingFlowKindLabel } from "@/lib/booking-flow-labels";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type LaunchChecklistProps = {
  businessId: string | null;
  businessName: string | null;
  bookingFlowComplete: boolean;
  bookingFlowKind: string | null;
  stripeChargesEnabled: boolean;
  bookingSlug: string | null;
  publicBookingUrl: string | null;
  hasInventory: boolean;
  voiceComplete: boolean;
  hasBusiness: boolean;
};

type Step = {
  id: string;
  title: string;
  body: string;
  done: boolean;
  required: boolean;
  href: string;
  cta: string;
  Icon: typeof CalendarRange;
};

export function LaunchChecklist({
  businessId,
  businessName,
  bookingFlowComplete,
  bookingFlowKind,
  stripeChargesEnabled,
  bookingSlug,
  publicBookingUrl,
  hasInventory,
  voiceComplete,
  hasBusiness,
}: LaunchChecklistProps) {
  const [copied, setCopied] = useState(false);

  if (!hasBusiness) {
    return (
      <section className="rounded-[22px] border border-dashed border-[#ddd6fe] bg-[#fafbff]/90 px-6 py-8 md:px-10">
        <p className="text-sm font-semibold text-[#0f172a]">Add a business to unlock setup</p>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#64748b]">
          Finish signup with your venue name, or add one from Settings — then follow the launch checklist below.
        </p>
        <Link
          href="/dashboard/settings"
          className={cn(
            buttonVariants({ variant: "default" }),
            "mt-5 inline-flex h-11 rounded-full px-6 font-semibold shadow-md shadow-[#7c3aed]/20",
          )}
        >
          Open settings
        </Link>
      </section>
    );
  }

  const slugPublished = Boolean(bookingSlug?.trim());
  const flowLabel = bookingFlowKindLabel(bookingFlowKind);

  const steps: Step[] = [
    {
      id: "flow",
      title: "Set up your booking flow",
      body: bookingFlowComplete
        ? `Saved${flowLabel ? ` · ${flowLabel}` : ""}. Guests see the right intake paths on your public link.`
        : "Choose tables, events, or appointments — Solvio builds your hosted booking form and guest copy.",
      done: bookingFlowComplete,
      required: true,
      href: bookingFlowComplete ? "/dashboard/setup/bookings" : "/dashboard/setup/bookings",
      cta: bookingFlowComplete ? "Edit flow" : "Start booking setup",
      Icon: CalendarRange,
    },
    {
      id: "stripe",
      title: "Connect Stripe for deposits",
      body: stripeChargesEnabled
        ? "Payouts route to your connected account — table deposits checkout is live."
        : "Required before guests can pay table deposits. Enquiries still arrive without Stripe, but paid bookings need this step.",
      done: stripeChargesEnabled,
      required: true,
      href: "/dashboard/payments",
      cta: stripeChargesEnabled ? "View payments" : "Connect Stripe",
      Icon: CreditCard,
    },
    {
      id: "link",
      title: "Publish your booking link",
      body: slugPublished
        ? `Live at /book/${bookingSlug} — share on Google, Instagram, and your site.`
        : "Pick a short slug in Bookings — this is the link you send guests and wire into your AI receptionist.",
      done: slugPublished,
      required: true,
      href: "/dashboard/bookings#booking-links",
      cta: slugPublished ? "Manage link" : "Set booking slug",
      Icon: Link2,
    },
    {
      id: "inventory",
      title: "Add something to book",
      body: hasInventory
        ? "Inventory is in place — guests can pick tables, events, or slots on your link."
        : "Add at least one table, hosted event, or appointment window in Bookings so guests have something to choose.",
      done: hasInventory,
      required: false,
      href: "/dashboard/bookings?tab=offerings",
      cta: hasInventory ? "Edit inventory" : "Add inventory",
      Icon: Sparkles,
    },
    {
      id: "voice",
      title: "Train your AI receptionist",
      body: voiceComplete
        ? "Reception profile saved — preview calls and refine scripts before attaching a number."
        : "Optional for your first enquiry, but essential for the demo: greet callers and mention your booking link.",
      done: voiceComplete,
      required: false,
      href: "/dashboard/setup/voice",
      cta: voiceComplete ? "Edit voice setup" : "Set up voice",
      Icon: Mic2,
    },
  ];

  const requiredDone = steps.filter((s) => s.required).every((s) => s.done);
  const completedCount = steps.filter((s) => s.done).length;
  const nextStep = steps.find((s) => !s.done);

  async function copyLink() {
    if (!publicBookingUrl) return;
    try {
      await navigator.clipboard.writeText(publicBookingUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <section className="overflow-hidden rounded-[24px] border border-[#ebe7f7]/90 bg-white shadow-[0_24px_80px_-56px_rgba(124,58,237,0.35)]">
      <div className="border-b border-[#f1eefc] bg-[#fafbff]/80 px-6 py-5 md:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.26em] text-[#94a3b8]">
          {requiredDone ? "Ready for guests" : "Launch checklist"}
        </p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-[#0f172a] md:text-2xl">
          {requiredDone
            ? "Your booking link is live"
            : businessName
              ? `Get ${businessName} ready for its first booking`
              : "Get ready for your first booking"}
        </h2>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-[#64748b]">
          {requiredDone ? (
            <>
              Core setup is done. Share your link, test a guest submission, and optionally train voice before you pitch
              live.
            </>
          ) : (
            <>
              To receive your <strong className="font-semibold text-[#0f172a]">first booking with deposit checkout</strong>,
              complete steps 1–3 in order — booking flow, Stripe, then publish your link.
            </>
          )}
        </p>
        <p className="mt-3 text-sm font-medium text-[#7c3aed]">
          {completedCount} of {steps.length} complete
          {nextStep && !requiredDone ? (
            <>
              {" "}
              · next: <span className="text-[#5b21b6]">{nextStep.title.toLowerCase()}</span>
            </>
          ) : null}
        </p>
      </div>

      <ol className="divide-y divide-[#f1eefc] px-4 py-2 md:px-6">
        {steps.map((step, idx) => {
          const StatusIcon = step.done ? CheckCircle2 : Circle;
          const isNext = !step.done && steps.slice(0, idx).every((s) => s.done || !s.required);
          return (
            <li
              key={step.id}
              className={cn(
                "flex flex-col gap-4 py-5 md:flex-row md:items-start md:justify-between",
                isNext && "rounded-2xl bg-[#faf5ff]/80 px-3 -mx-1 ring-1 ring-[#ede9fe]",
              )}
            >
              <div className="flex gap-4">
                <span
                  className={cn(
                    "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl",
                    step.done ? "bg-emerald-50 text-emerald-600" : "bg-[#f5f3ff] text-[#7c3aed]",
                  )}
                >
                  <step.Icon className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0 space-y-1">
                  <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-[#0f172a]">
                    <span className="text-[#94a3b8]">{idx + 1}.</span>
                    {step.title}
                    {step.required ? (
                      <span className="rounded-full bg-[#ede9fe] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#5b21b6]">
                        Required
                      </span>
                    ) : (
                      <span className="rounded-full bg-[#f1f5f9] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#64748b]">
                        Recommended
                      </span>
                    )}
                    <StatusIcon
                      className={cn("h-4 w-4", step.done ? "text-emerald-500" : "text-[#cbd5e1]")}
                      aria-hidden
                    />
                    <span className="sr-only">{step.done ? "Complete" : "Not complete"}</span>
                  </p>
                  <p className="max-w-xl text-sm leading-relaxed text-[#64748b]">{step.body}</p>
                  {step.id === "stripe" && !step.done && businessId ? (
                    <div className="mt-3 max-w-xl">
                      <StripeConnectRequiredCallout businessId={businessId} />
                    </div>
                  ) : null}
                </div>
              </div>
              <Link
                href={step.href}
                className={cn(
                  buttonVariants({ variant: step.done ? "outline" : "default" }),
                  "inline-flex h-10 shrink-0 items-center justify-center rounded-full px-5 text-sm font-semibold md:mt-1",
                  !step.done && "shadow-md shadow-[#7c3aed]/20",
                )}
              >
                {step.cta}
              </Link>
            </li>
          );
        })}
      </ol>

      {publicBookingUrl && slugPublished ? (
        <div className="border-t border-[#f1eefc] bg-[#fafbff]/60 px-6 py-5 md:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#94a3b8]">Your public link</p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
            <code className="min-w-0 flex-1 truncate rounded-xl border border-[#ebe7f7] bg-white px-4 py-3 text-sm text-[#0f172a]">
              {publicBookingUrl}
            </code>
            <button
              type="button"
              onClick={() => void copyLink()}
              className={cn(
                buttonVariants({ variant: "secondary" }),
                "inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-5 font-semibold",
              )}
            >
              <Copy className="h-4 w-4" aria-hidden />
              {copied ? "Copied" : "Copy link"}
            </button>
            <Link
              href={publicBookingUrl}
              target="_blank"
              rel="noreferrer"
              className={cn(
                buttonVariants({ variant: "outline" }),
                "inline-flex h-11 shrink-0 items-center rounded-full px-5 font-semibold",
              )}
            >
              Preview
            </Link>
          </div>
        </div>
      ) : null}
    </section>
  );
}
