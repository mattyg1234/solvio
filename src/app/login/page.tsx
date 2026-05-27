import type { Metadata } from "next";
import Link from "next/link";

import { LoginForm } from "@/components/auth/login-form";
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
  title: "Log in · Solvio",
  description: "Sign in to your Solvio workspace.",
};

function decodeAuthError(raw: string | string[] | undefined): string | undefined {
  if (!raw) return undefined;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const params = await searchParams;
  const authCallbackError = decodeAuthError(params.error);

  return (
    <>
      <SiteHeader />
      <main className="relative min-h-[calc(100vh-4.25rem)] overflow-hidden bg-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_18%_-12%,rgba(167,139,250,0.2),transparent_48%),radial-gradient(ellipse_at_92%_68%,rgba(124,58,237,0.08),transparent_46%)]" />

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
                Welcome back
              </CardTitle>
              <CardDescription className="text-[15px] leading-relaxed text-[#64748b]">
                Pick up where you left off — bookings, scripts and voice settings stay synced for your team.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-2 pb-6">
              <LoginForm authCallbackError={authCallbackError} />
            </CardContent>
          </Card>
        </div>
      </main>
      <SiteAuthFooter />
    </>
  );
}
