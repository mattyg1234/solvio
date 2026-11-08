"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/** Login step 2: checks the authenticator code and upgrades the session (aal2). */
export function TwoStepCodeForm({ next }: { next: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error: listErr } = await supabase.auth.mfa.listFactors();
      if (listErr) throw listErr;
      const factor = data?.totp?.find((f) => f.status === "verified");
      if (!factor) {
        router.replace(next);
        router.refresh();
        return;
      }
      const { error: verifyErr } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() });
      if (verifyErr) {
        setError("That code didn't work. Check the time on your phone and try the newest code.");
        return;
      }
      router.replace(next);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-5 space-y-3">
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        placeholder="123456"
        aria-label="6-digit code"
        className="block w-full rounded-xl border border-slate-300 px-3 py-3 text-center font-mono text-2xl tracking-[0.4em]"
      />
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      <button
        type="submit"
        disabled={busy || code.length !== 6}
        className="w-full rounded-xl bg-[var(--show-ops-primary,#7c3aed)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy ? "Checking…" : "Continue"}
      </button>
      <button type="button" onClick={signOut} className="w-full text-center text-xs text-slate-500 underline">
        Not you? Sign out
      </button>
      <p className="text-xs text-slate-500">Lost your phone? Ask Matty to switch two-step login off for your account.</p>
    </form>
  );
}
