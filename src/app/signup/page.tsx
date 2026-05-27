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
  const scaleIntent = intentRaw === "scale";

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

          {scaleIntent ? (
            <div className="rounded-[22px] border border-[#ddd6fe] bg-[#faf5ff] px-5 py-4 text-sm leading-relaxed text-[#475569]">
              <p className="font-semibold text-[#0f172a]">Solvio Scale — multi-location & high-volume events</p>
              <p className="mt-2">
                Scale starts from £499/mo with dedicated onboarding. Email us for a walkthrough, or start with the Booking
                trial below if you want to explore first.
              </p>
              <a
                href={scaleInquiryMailtoHref()}
                className={cn(
                  buttonVariants({ variant: "default" }),
                  "mt-4 inline-flex h-10 rounded-full px-5 text-sm font-semibold shadow-md shadow-[#7c3aed]/20",
                )}
              >
                Email about Scale →
              </a>
            </div>
          ) : null}

          <Card className="rounded-[26px] border border-[#ebe7f7] bg-white/95 shadow-[0_28px_90px_-52px_rgba(124,58,237,0.55)] backdrop-blur-xl">
            <CardHeader className="gap-3 pb-2">
              <CardTitle className="text-2xl font-semibold tracking-tight text-[#0f172a]">
                {scaleIntent ? "Or start with Booking" : "Start with Solvio"}
              </CardTitle>
              <CardDescription className="text-[15px] leading-relaxed text-[#64748b]">
                {scaleIntent
                  ? "£50/mo after a 7-day trial — publish your /book link and take deposits with Stripe."
                  : "About two minutes — then a short setup wizard to publish your booking link."}
              </CardDescription>
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
