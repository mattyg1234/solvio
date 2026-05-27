"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { signUpAction } from "@/app/signup/actions";
import { BOOKING_TRIAL_DAYS, trialExploreLine } from "@/lib/solvio-pricing";
import { SIGNUP_EMAIL_PLACEHOLDER } from "@/lib/site-contact";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";

export function SignupForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsEmailConfirm, setNeedsEmailConfirm] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNeedsEmailConfirm(false);
    if (!acceptedTerms) {
      setError("Please accept the Terms and Privacy Policy to continue.");
      return;
    }
    setLoading(true);

    const fd = new FormData(e.currentTarget);
    const businessName = String(fd.get("business") ?? "").trim();
    const email = String(fd.get("email") ?? "").trim();
    const password = String(fd.get("password") ?? "");
    const websiteUrl = String(fd.get("website_url") ?? "").trim();
    const logoUrl = String(fd.get("logo_url") ?? "").trim();
    const businessCategory = String(fd.get("business_category") ?? "").trim();

    try {
      const result = await signUpAction({
        email,
        password,
        businessName,
        websiteUrl,
        logoUrl,
        businessCategory,
      });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      if (!result.needsEmailConfirm) {
        router.push("/dashboard/onboarding");
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
          placeholder={SIGNUP_EMAIL_PLACEHOLDER}
          className="w-full rounded-2xl border border-[#ebe7f7] bg-white px-4 py-3 text-[15px] text-[#0f172a] shadow-inner shadow-black/[0.03] outline-none ring-[#a78bfa]/35 transition-[box-shadow,border-color] placeholder:text-[#94a3b8] focus:border-[#c4b5fd] focus:ring-4"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="signup-password" className="text-sm font-semibold text-[#0f172a]">
          Password
        </label>
        <PasswordInput
          id="signup-password"
          autoComplete="new-password"
          required
          minLength={8}
          placeholder="At least 8 characters"
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
            <strong>Check your inbox.</strong> We sent a confirmation link to activate your account — it may take a minute
            to arrive. After confirming,{" "}
            <Link href="/login" className="font-semibold underline underline-offset-2">
              log in
            </Link>{" "}
            to start your {BOOKING_TRIAL_DAYS}-day trial.
          </p>
          <p className="text-[13px] text-[#1e3a8a]/90">If you don&apos;t see it, check spam or promotions.</p>
        </div>
      ) : null}

      <label className="flex items-start gap-3 text-sm leading-relaxed text-[#475569]">
        <input
          type="checkbox"
          checked={acceptedTerms}
          onChange={(e) => setAcceptedTerms(e.target.checked)}
          className="mt-1 h-4 w-4 rounded border-[#cbd5e1] text-[#7c3aed]"
          required
        />
        <span>
          I agree to the{" "}
          <Link href="/terms" className="font-semibold text-[#7c3aed] underline-offset-2 hover:underline">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="font-semibold text-[#7c3aed] underline-offset-2 hover:underline">
            Privacy Policy
          </Link>
          . {trialExploreLine()}
        </span>
      </label>

      <Button
        type="submit"
        disabled={loading || !acceptedTerms}
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
