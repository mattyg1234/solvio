"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { requestPasswordResetAction } from "@/app/login/actions";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { SIGNUP_EMAIL_PLACEHOLDER } from "@/lib/site-contact";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";

type LoginFormProps = {
  authCallbackError?: string | null;
  redirectTo?: string;
};

function safeDashboardRedirect(raw: string | undefined): string {
  if (!raw?.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  if (!raw.startsWith("/dashboard")) return "/dashboard";
  return raw;
}

export function LoginForm({ authCallbackError, redirectTo = "/dashboard" }: LoginFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

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
        setError("Email or password incorrect — try again or reset your password.");
        return;
      }
      router.push(safeDashboardRedirect(redirectTo));
      router.refresh();
    } catch (err) {
      setError("Something went wrong — please try again or email hello@solviosystems.com.");
    } finally {
      setLoading(false);
    }
  }

  async function onForgotPassword() {
    setError(null);
    setResetSent(false);
    const emailInput = document.getElementById("login-email") as HTMLInputElement | null;
    const email = emailInput?.value.trim() ?? "";
    if (!email) {
      setError("Enter your email above, then click Forgot.");
      return;
    }
    setResetLoading(true);
    try {
      const result = await requestPasswordResetAction(email);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setResetSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send reset email.");
    } finally {
      setResetLoading(false);
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
          placeholder={SIGNUP_EMAIL_PLACEHOLDER}
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
            disabled={resetLoading}
            onClick={() => void onForgotPassword()}
            className="text-sm font-semibold text-[#7c3aed] hover:underline disabled:opacity-50"
          >
            {resetLoading ? "Sending…" : "Forgot password?"}
          </button>
        </div>
        <PasswordInput id="login-password" autoComplete="current-password" required placeholder="Your password" />
      </div>

      {resetSent ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-relaxed text-emerald-900">
          Password reset link sent — check your inbox, then choose a new password on Settings.
        </p>
      ) : null}

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
