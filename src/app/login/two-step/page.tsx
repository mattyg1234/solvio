import type { Metadata } from "next";

import { TwoStepCodeForm } from "@/components/auth/two-step-code-form";
import { safeTwoStepNext } from "@/lib/supabase/two-step";

export const metadata: Metadata = {
  title: "Enter your code",
  robots: { index: false, follow: false },
};

/** Second step of the login for anyone who switched on an authenticator app. */
export default async function TwoStepPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h1 className="text-xl font-semibold text-slate-900">Enter your 6-digit code</h1>
        <p className="mt-1 text-sm text-slate-600">
          Open your authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…) and type the code it
          shows for the Hub.
        </p>
        <TwoStepCodeForm next={safeTwoStepNext(next)} />
      </div>
    </main>
  );
}
