import type { Metadata } from "next";

import { TwoStepSetupForm } from "@/components/auth/two-step-setup-form";
import { safeTwoStepNext } from "@/lib/supabase/two-step";

export const metadata: Metadata = {
  title: "Set up two-step login",
  robots: { index: false, follow: false },
};

/** Staff without an authenticator land here once, set it up, then carry on into the Hub. */
export default async function TwoStepSetupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h1 className="text-xl font-semibold text-slate-900">Set up two-step login</h1>
        <p className="mt-1 text-sm text-slate-600">
          The Hub now asks every staff login for a code from an authenticator app as well as your password. You only do
          this setup once. Install Google Authenticator on your phone first if you don&apos;t have it.
        </p>
        <TwoStepSetupForm next={safeTwoStepNext(next)} />
      </div>
    </main>
  );
}
