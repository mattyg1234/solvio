"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function SignupForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsEmailConfirm, setNeedsEmailConfirm] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNeedsEmailConfirm(false);
    setLoading(true);

    const fd = new FormData(e.currentTarget);
    const businessName = String(fd.get("business") ?? "").trim();
    const email = String(fd.get("email") ?? "").trim();
    const password = String(fd.get("password") ?? "");
    const websiteUrl = String(fd.get("website_url") ?? "").trim();
    const logoUrl = String(fd.get("logo_url") ?? "").trim();
    const businessCategory = String(fd.get("business_category") ?? "").trim();

    try {
      const origin =
        typeof window !== "undefined"
          ? window.location.origin
          : (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");

      const supabase = createSupabaseBrowserClient();
      const { data, error: signErr } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo:
            origin.length > 0 ? `${origin}/auth/callback?next=/dashboard` : undefined,
          data: {
            business_name: businessName,
            ...(websiteUrl ? { website_url: websiteUrl } : {}),
            ...(logoUrl ? { logo_url: logoUrl } : {}),
            ...(businessCategory ? { business_category: businessCategory } : {}),
          },
        },
      });

      if (signErr) {
        setError(signErr.message);
        return;
      }

      if (data.session) {
        router.push("/dashboard");
        router.refresh();
        return;
      }

      setNeedsEmailConfirm(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Missing Supabase env vars — check .env.local.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-5">
      <div className="space-y-2">
        <label htmlFor="signup-business" className="text-sm font-semibold text-[#0f172a]">
          Business name
        </label>
        <input
          id="signup-business"
          name="business"
          type="text"
          autoComplete="organization"
          required
          placeholder="Café Aurora"
          className="w-full rounded-2xl border border-[#ebe7f7] bg-white px-4 py-3 text-[15px] text-[#0f172a] shadow-inner shadow-black/[0.03] outline-none ring-[#a78bfa]/35 transition-[box-shadow,border-color] placeholder:text-[#94a3b8] focus:border-[#c4b5fd] focus:ring-4"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="signup-category" className="text-sm font-semibold text-[#0f172a]">
          Business type <span className="font-normal text-[#94a3b8]">(optional)</span>
        </label>
        <select
          id="signup-category"
          name="business_category"
          className="w-full rounded-2xl border border-[#ebe7f7] bg-white px-4 py-3 text-[15px] text-[#0f172a] shadow-inner shadow-black/[0.03] outline-none ring-[#a78bfa]/35 focus:border-[#c4b5fd] focus:ring-4"
          defaultValue=""
        >
          <option value="">Choose later…</option>
          <option value="restaurant">Restaurant / café / bar</option>
          <option value="salon">Salon / spa / aesthetics</option>
          <option value="tours">Tour / activity operator</option>
          <option value="professional">Professional services</option>
          <option value="other">Other hospitality / venue</option>
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="signup-www" className="text-sm font-semibold text-[#0f172a]">
            Website URL <span className="font-normal text-[#94a3b8]">(optional)</span>
          </label>
          <input
            id="signup-www"
            name="website_url"
            type="url"
            autoComplete="url"
            placeholder="https://yourvenue.com"
            className="w-full rounded-2xl border border-[#ebe7f7] bg-white px-4 py-3 text-[15px] text-[#0f172a] shadow-inner shadow-black/[0.03] outline-none ring-[#a78bfa]/35 transition-[box-shadow,border-color] placeholder:text-[#94a3b8] focus:border-[#c4b5fd] focus:ring-4"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="signup-logo" className="text-sm font-semibold text-[#0f172a]">
            Logo URL <span className="font-normal text-[#94a3b8]">(optional)</span>
          </label>
          <input
            id="signup-logo"
            name="logo_url"
            type="url"
            placeholder="https://cdn…/logo.png"
            className="w-full rounded-2xl border border-[#ebe7f7] bg-white px-4 py-3 text-[15px] text-[#0f172a] shadow-inner shadow-black/[0.03] outline-none ring-[#a78bfa]/35 transition-[box-shadow,border-color] placeholder:text-[#94a3b8] focus:border-[#c4b5fd] focus:ring-4"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="signup-email" className="text-sm font-semibold text-[#0f172a]">
          Work email
        </label>
        <input
          id="signup-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@business.es"
          className="w-full rounded-2xl border border-[#ebe7f7] bg-white px-4 py-3 text-[15px] text-[#0f172a] shadow-inner shadow-black/[0.03] outline-none ring-[#a78bfa]/35 transition-[box-shadow,border-color] placeholder:text-[#94a3b8] focus:border-[#c4b5fd] focus:ring-4"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="signup-password" className="text-sm font-semibold text-[#0f172a]">
          Password
        </label>
        <input
          id="signup-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          placeholder="At least 8 characters"
          className="w-full rounded-2xl border border-[#ebe7f7] bg-white px-4 py-3 text-[15px] text-[#0f172a] shadow-inner shadow-black/[0.03] outline-none ring-[#a78bfa]/35 transition-[box-shadow,border-color] placeholder:text-[#94a3b8] focus:border-[#c4b5fd] focus:ring-4"
        />
      </div>

      {error ? (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-relaxed text-red-800">
          {error}
        </p>
      ) : null}

      {needsEmailConfirm ? (
        <div className="space-y-3 rounded-2xl border border-[#dbeafe] bg-[#eff6ff] px-4 py-4 text-sm leading-relaxed text-[#1e40af]">
          <p>
            <strong>Confirmation email sent.</strong> Supabase sends this email — open the link to activate your account,
            then{" "}
            <Link href="/login" className="font-semibold underline underline-offset-2">
              log in
            </Link>
            .
          </p>
          <ul className="list-inside list-disc space-y-1 text-[13px] text-[#1e3a8a]/90">
            <li>Check spam / promotions — the default sender domain is generic.</li>
            <li>
              In Supabase: <strong className="font-semibold">Authentication → Users</strong> — your email should appear as{" "}
              <em>unconfirmed</em> until you click the link (proof the signup reached Auth).
            </li>
            <li>
              For production-ready inbox delivery, configure{" "}
              <strong className="font-semibold">custom SMTP</strong> (
              <a
                href="https://supabase.com/docs/guides/auth/auth-smtp"
                className="font-semibold underline underline-offset-2"
                target="_blank"
                rel="noopener noreferrer"
              >
                Supabase SMTP docs
              </a>
              ) — Resend, SendGrid, SES, etc.
            </li>
            <li>
              Add{" "}
              <code className="rounded bg-white/80 px-1 py-0.5 text-[11px] text-[#1e40af]">
                /auth/callback
              </code>{" "}
              under Authentication → URL Configuration → Redirect URLs (localhost + production).
            </li>
          </ul>
        </div>
      ) : null}

      <Button
        type="submit"
        disabled={loading}
        className="h-11 w-full rounded-full text-base font-semibold shadow-lg shadow-[#7c3aed]/25 disabled:opacity-60"
      >
        {loading ? "Creating account…" : "Create account"}
      </Button>

      <p className="text-center text-sm text-[#64748b]">
        Already have Solvio?{" "}
        <Link href="/login" className="font-semibold text-[#7c3aed] underline-offset-4 hover:underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
