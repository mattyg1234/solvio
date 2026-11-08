"use client";

import { useRouter } from "next/navigation";

import { TwoStepSettings } from "@/components/show-ops/two-step-settings";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/** First-login setup: the same QR + code steps as Settings, then straight on to where they were going. */
export function TwoStepSetupForm({ next }: { next: string }) {
  const router = useRouter();

  async function signOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="mt-2">
      <TwoStepSettings
        required
        onDone={() => {
          router.replace(next);
          router.refresh();
        }}
      />
      <button type="button" onClick={signOut} className="mt-5 text-sm text-slate-500 underline">
        Sign out
      </button>
    </div>
  );
}
