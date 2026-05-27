import type { Metadata } from "next";
import Link from "next/link";

import { SignupForm } from "@/components/auth/signup-form";
import { SiteAuthFooter } from "@/components/site/site-auth-footer";
import { SiteHeader } from "@/components/site/site-header";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  BOOKING_MONTHLY_GBP,
  ENTERPRISE_AI_MINUTES,
  ENTERPRISE_MONTHLY_GBP,
  PRO_AI_MINUTES,
  PRO_MONTHLY_GBP,
} from "@/lib/solvio-pricing";
import { scaleInquiryMailtoHref } from "@/lib/site-contact";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Sign up · Solvio",
  description: "Create your Solvio account.",
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string | string[] }>;
}) {
  const params = await searchParams;
  const intentRaw = Array.isArray(params.intent) ? params.intent[0] : params.intent;
  const enterpriseIntent = intentRaw === "enterprise" || intentRaw === "scale";
  const proIntent = intentRaw === "pro";

  return (
    <>
      <SiteHeader />
      <main className="relative min-h-[calc(100vh-4.25rem)] overflow-hidden bg-[#f8fafc]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_12%_-10%,rgba(167,139,250,0.22),transparent_48%),radial-gradient(ellipse_at_88%_72%,rgba(124,58,237,0.08),transparent_44%)]" />

        <div className="relative mx-auto flex w-full max-w-lg flex-col gap-10 px-4 py-14 sm:px-6 sm:py-20">
          <Link
            href="/"
            className="text-sm font-semibold text-[#64748b] underline-offset-4 transition-colors hover:text-[#7c3aed] hover:underline"
          >
            ← Back home
          </Link>

          {enterpriseIntent ? (
            <div className="rounded-[22px] border border-[#ddd6fe] bg-[#faf5ff] px-5 py-4 text-sm leading-relaxed text-[#475569]">
              <p className="font-semibold text-[#0f172a]">Solvio Enterprise — £{ENTERPRISE_MONTHLY_GBP}/mo</p>
              <p className="mt-2">
                {ENTERPRISE_AI_MINUTES.toLocaleString("en-GB")} AI minutes, unlimited locations, campaigns, and priority
                support. Email us for onboarding, or start with Booking below.
              </p>
              <a
                href={scaleInquiryMailtoHref()}
                className={cn(
                  buttonVariants({ variant: "default" }),
                  "mt-4 inline-flex h-10 rounded-full px-5 text-sm font-semibold shadow-md shadow-[#7c3aed]/20",
                )}
              >
                Email about Enterprise →
              </a>
            </div>
          ) : null}

          {proIntent ? (
            <div className="rounded-[22px] border border-[#ede9fe] bg-white px-5 py-4 text-sm leading-relaxed text-[#475569]">
              <p className="font-semibold text-[#0f172a]">Solvio Pro — £{PRO_MONTHLY_GBP}/mo</p>
              <p className="mt-2">
                Everything in Booking plus {PRO_AI_MINUTES} AI receptionist minutes per month. Sign up below, then upgrade
                from Plans in your dashboard.
              </p>
            </div>
          ) : null}

          <Card className="rounded-[26px] border border-[#ebe7f7] bg-white/95 shadow-[0_28px_90px_-52px_rgba(124,58,237,0.55)] backdrop-blur-xl">
            <CardHeader className="gap-3 pb-2">
              <CardTitle className="text-2xl font-semibold tracking-tight text-[#0f172a]">
                {enterpriseIntent || proIntent ? "Start with Booking" : "Start with Solvio"}
              </CardTitle>
              <CardDescription className="text-[15px] leading-relaxed text-[#64748b]">
                £{BOOKING_MONTHLY_GBP}/mo after a 7-day trial — publish your /book link and take optional deposits online.
              </CardDescription>
              {!enterpriseIntent && !proIntent ? (
                <p className="text-[13px] leading-relaxed text-[#94a3b8]">
                  Venues like yours aim for more bookings, fewer no-shows, and hours back each week — illustrative
                  examples on our homepage.
                </p>
              ) : null}
            </CardHeader>
            <CardContent className="pt-2 pb-6">
              <SignupForm />
            </CardContent>
          </Card>
        </div>
      </main>
      <SiteAuthFooter />
    </>
  );
}
