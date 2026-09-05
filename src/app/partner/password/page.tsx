"use client";

import { useState } from "react";
import Link from "next/link";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { PasswordInput } from "@/components/ui/password-input";

export default function PartnerPasswordPage() {
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const password = String(fd.get("password") ?? "");
    const confirm = String(fd.get("confirm") ?? "");
    if (password.length < 8) {
      setErr("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setErr("Passwords do not match.");
      return;
    }
    setPending(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setErr(error.message);
        return;
      }
      setMsg("Password updated.");
      form.reset();
    } catch {
      setErr("Could not save your password. Please retry.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-md space-y-3 rounded-2xl bg-white p-6 ring-1 ring-slate-200">
      <h1 className="text-lg font-semibold text-slate-900">Set or change your password</h1>
      <p className="text-sm text-slate-600">Your email link has signed you in. You can set a password for this Solvio account, or continue to your bookings.</p>
      <label className="block text-sm">
        New password
        <PasswordInput id="seller-new-password" name="password" autoComplete="new-password" required minLength={8} className="mt-1" />
      </label>
      <label className="block text-sm">
        Confirm
        <PasswordInput id="seller-confirm-password" name="confirm" autoComplete="new-password" required minLength={8} className="mt-1" />
      </label>
      {err ? <p className="text-sm text-rose-700">{err}</p> : null}
      {msg ? <p className="text-sm text-emerald-800">{msg}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-[var(--show-ops-primary,#0f766e)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save password"}
      </button>
      <Link href="/partner" className="block text-sm font-medium underline">Continue to bookings</Link>
    </form>
  );
}
