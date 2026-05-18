"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

type LoginFormProps = {
  authCallbackError?: string | null;
};

export function LoginForm({ authCallbackError }: LoginFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = e.currentTarget;
    const fd = new FormData(form);
    const email = String(fd.get("email") ?? "").trim();
    const password = String(fd.get("password") ?? "");

    try {
      const supabase = createSupabaseBrowserClient();
      const { error: signErr } = await supabase.auth.signInWithPassword({ email, password });
      if (signErr) {
        setError(signErr.message);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Missing Supabase env vars — check .env.local.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-5">
      {authCallbackError ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-950">
          {authCallbackError}
        </p>
      ) : null}

      <div className="space-y-2">
        <label htmlFor="login-email" className="text-sm font-semibold text-[#0f172a]">
          Email
        </label>
        <input
          id="login-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@business.es"
          className="w-full rounded-2xl border border-[#ebe7f7] bg-white px-4 py-3 text-[15px] text-[#0f172a] shadow-inner shadow-black/[0.03] outline-none ring-[#a78bfa]/35 transition-[box-shadow,border-color] placeholder:text-[#94a3b8] focus:border-[#c4b5fd] focus:ring-4"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="login-password" className="text-sm font-semibold text-[#0f172a]">
            Password
          </label>
          <button
            type="button"
            disabled
            title="Password reset coming soon"
            className="cursor-not-allowed text-xs font-semibold uppercase tracking-[0.18em] text-[#cbd5e1]"
          >
            Forgot?
          </button>
        </div>
        <input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
          className="w-full rounded-2xl border border-[#ebe7f7] bg-white px-4 py-3 text-[15px] text-[#0f172a] shadow-inner shadow-black/[0.03] outline-none ring-[#a78bfa]/35 transition-[box-shadow,border-color] placeholder:text-[#94a3b8] focus:border-[#c4b5fd] focus:ring-4"
        />
      </div>

      {error ? (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-relaxed text-red-800">
          {error}
        </p>
      ) : null}

      <Button
        type="submit"
        disabled={loading}
        className="h-11 w-full rounded-full text-base font-semibold shadow-lg shadow-[#7c3aed]/25 disabled:opacity-60"
      >
        {loading ? "Signing in…" : "Log in"}
      </Button>

      <p className="text-center text-sm text-[#64748b]">
        New to Solvio?{" "}
        <Link href="/signup" className="font-semibold text-[#7c3aed] underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}
