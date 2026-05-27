import type { Metadata } from "next";
import Link from "next/link";

import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { trialExploreLine } from "@/lib/solvio-pricing";
import { SUPPORT_EMAIL, supportMailtoHref } from "@/lib/site-contact";

export const metadata: Metadata = {
  title: "Terms of service · Solvio",
  description: "Terms for merchants and guests using Solvio booking pages and Stripe Connect deposits.",
};

export default function TermsPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight text-[#0f172a]">Terms of service</h1>
        <p className="mt-4 text-sm text-[#64748b]">Last updated: May 2026</p>
        <div className="prose prose-slate mt-10 max-w-none space-y-6 text-[15px] leading-relaxed text-[#475569]">
          <p>
            By using Solvio you agree to these terms. Solvio provides booking infrastructure for merchants; guest payments for
            deposits are processed via each merchant&apos;s connected Stripe account.
          </p>
          <h2 className="text-lg font-semibold text-[#0f172a]">Merchants</h2>
          <p>
            You are responsible for your availability, pricing, cancellations, and compliance with local laws. Subscription fees
            are billed monthly unless cancelled. {trialExploreLine()}
          </p>
          <h2 className="text-lg font-semibold text-[#0f172a]">Guests</h2>
          <p>
            Submitting a booking request does not guarantee confirmation until the venue accepts it. Deposit payments are subject
            to the venue&apos;s policies and Stripe&apos;s terms. See our{" "}
            <Link href="/privacy" className="font-semibold text-[#7c3aed] hover:underline">
              Privacy policy
            </Link>{" "}
            for how guest data is handled.
          </p>
          <h2 className="text-lg font-semibold text-[#0f172a]">Limitation</h2>
          <p>
            We strive for reliable booking and email delivery. If something breaks, contact us at{" "}
            <a href={supportMailtoHref()} className="font-semibold text-[#7c3aed] hover:underline">
              {SUPPORT_EMAIL}
            </a>{" "}
            and we will help resolve it promptly.
          </p>
          <p>
            Questions:{" "}
            <a href={supportMailtoHref()} className="font-semibold text-[#7c3aed] hover:underline">
              {SUPPORT_EMAIL}
            </a>
          </p>
          <p>
            <Link href="/privacy" className="font-semibold text-[#7c3aed] hover:underline">
              Privacy policy
            </Link>
          </p>
          <p>
            <Link href="/" className="font-semibold text-[#7c3aed] hover:underline">
              ← Back to home
            </Link>
          </p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
