import type { Metadata } from "next";
import Link from "next/link";

import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { SUPPORT_EMAIL, supportMailtoHref } from "@/lib/site-contact";

export const metadata: Metadata = {
  title: "Privacy policy · Solvio",
  description: "How Solvio collects and uses merchant and guest data for booking pages and payments.",
};

export default function PrivacyPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight text-[#0f172a]">Privacy policy</h1>
        <p className="mt-4 text-sm text-[#64748b]">Last updated: May 2026</p>
        <div className="prose prose-slate mt-10 max-w-none space-y-6 text-[15px] leading-relaxed text-[#475569]">
          <p>
            Solvio (&quot;we&quot;) helps hospitality and service businesses take bookings and communicate with guests. This policy
            explains what we collect and why.
          </p>
          <h2 className="text-lg font-semibold text-[#0f172a]">What we collect</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>Account details (name, email) when merchants sign up.</li>
            <li>Guest booking details submitted on public `/book` pages (name, email, phone, party size, preferences).</li>
            <li>Payment metadata via Stripe Connect — card data is handled by Stripe, not stored on our servers.</li>
            <li>Usage logs for security, rate limiting, and product improvement.</li>
          </ul>
          <h2 className="text-lg font-semibold text-[#0f172a]">How we use it</h2>
          <p>
            To operate booking requests, send confirmation emails, process deposits to connected Stripe accounts, and provide
            merchant dashboards. We do not sell guest data to third parties.
          </p>
          <h2 className="text-lg font-semibold text-[#0f172a]">Cookies & analytics</h2>
          <p>
            We use essential cookies for sign-in sessions. We may use privacy-friendly analytics to understand product usage
            — no ad tracking.
          </p>
          <h2 className="text-lg font-semibold text-[#0f172a]">Retention</h2>
          <p>
            Merchant account data is kept while your subscription is active. Guest booking requests are retained for your
            operations inbox — delete or export via dashboard workflows as you define your venue policies.
          </p>
          <h2 id="subprocessors" className="text-lg font-semibold text-[#0f172a]">
            Subprocessors
          </h2>
          <p>
            We rely on trusted providers to run Solvio, including Supabase (data hosting), Stripe (payments), Resend or
            similar (transactional email), and optional voice providers when you enable AI receptionist features.
          </p>
          <h2 className="text-lg font-semibold text-[#0f172a]">Contact</h2>
          <p>
            Questions:{" "}
            <a href={supportMailtoHref()} className="font-semibold text-[#7c3aed] hover:underline">
              {SUPPORT_EMAIL}
            </a>
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
