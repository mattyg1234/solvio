import type { Metadata } from "next";
import Link from "next/link";

import { SignupForm } from "@/components/auth/signup-form";
import { SiteAuthFooter } from "@/components/site/site-auth-footer";
import { SiteHeader } from "@/components/site/site-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Sign up · Solvio",
  description: "Create your Solvio account.",
};

export default function SignupPage() {
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

          <Card className="rounded-[26px] border border-[#ebe7f7] bg-white/95 shadow-[0_28px_90px_-52px_rgba(124,58,237,0.55)] backdrop-blur-xl">
            <CardHeader className="gap-3 pb-2">
              <CardTitle className="text-2xl font-semibold tracking-tight text-[#0f172a]">
                Start with Solvio
              </CardTitle>
              <CardDescription className="text-[15px] leading-relaxed text-[#64748b]">
                About two minutes — then a short setup wizard to publish your booking link.
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
