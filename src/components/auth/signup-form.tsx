"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { signUpAction } from "@/app/signup/actions";
import { BUSINESS_LOGO_ACCEPT, BUSINESS_LOGO_MAX_BYTES } from "@/lib/business-logo";
import { PhoneDialCodeField } from "@/components/ui/phone-dial-code-field";
import { BOOKING_TRIAL_DAYS, trialExploreLine } from "@/lib/solvio-pricing";
import { SIGNUP_EMAIL_PLACEHOLDER } from "@/lib/site-contact";
import { validateBookingPhone } from "@/lib/normalize-phone";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";

export function SignupForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsEmailConfirm, setNeedsEmailConfirm] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [phoneDial, setPhoneDial] = useState("+44");
  const [phoneLocal, setPhoneLocal] = useState("");
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoName, setLogoName] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  function onLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setError(null);
    if (logoPreview) URL.revokeObjectURL(logoPreview);
    if (!file) {
      setLogoPreview(null);
      setLogoName(null);
      return;
    }
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      setError("Your logo must be a PNG or JPEG so it can be printed on invoices.");
      e.target.value = "";
      setLogoPreview(null);
      setLogoName(null);
      return;
    }
    if (file.size > BUSINESS_LOGO_MAX_BYTES) {
      setError("Your logo is larger than 2 MB — export a smaller version and try again.");
      e.target.value = "";
      setLogoPreview(null);
      setLogoName(null);
      return;
    }
    setLogoPreview(URL.createObjectURL(file));
    setLogoName(file.name);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNeedsEmailConfirm(false);
    if (!acceptedTerms) {
      setError("Please accept the Terms and Privacy Policy to continue.");
      return;
    }
    setLoading(true);

    const form = e.currentTarget;
    const logoFile = logoInputRef.current?.files?.[0];
    if (!logoFile) {
      setError("Upload your logo — it goes on every invoice you send from Solvio.");
      setLoading(false);
      return;
    }
    const phoneCheck = validateBookingPhone(phoneDial, phoneLocal);
    if (!phoneCheck.ok) {
      setError(phoneCheck.message);
      setLoading(false);
      return;
    }

    const fd = new FormData();
    fd.set("business_name", String(new FormData(form).get("business") ?? "").trim());
    fd.set("email", String(new FormData(form).get("email") ?? "").trim());
    fd.set("password", String(new FormData(form).get("password") ?? ""));
    fd.set("business_category", String(new FormData(form).get("business_category") ?? "").trim());
    fd.set("merchant_phone", phoneCheck.e164);
    fd.set("logo", logoFile);

    try {
      const result = await signUpAction(fd);

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
    } catch {
      setError("Something went wrong — please try again or email hello@solviosystems.com.");
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
        <p className="text-[13px] leading-relaxed text-[#64748b]">
          Helps us tailor your booking setup — you can change this later.
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="signup-logo" className="text-sm font-semibold text-[#0f172a]">
          Your logo
        </label>
        <div className="flex items-center gap-4 rounded-2xl border border-dashed border-[#c4b5fd] bg-[#faf5ff] px-4 py-3">
          {logoPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoPreview} alt="Logo preview" className="h-14 w-24 shrink-0 rounded-lg bg-white object-contain p-1 ring-1 ring-[#ebe7f7]" />
          ) : (
            <div className="flex h-14 w-24 shrink-0 items-center justify-center rounded-lg bg-white text-[11px] font-semibold uppercase tracking-wide text-[#a78bfa] ring-1 ring-[#ebe7f7]">
              Logo
            </div>
          )}
          <div className="min-w-0 flex-1 space-y-1">
            <input
              ref={logoInputRef}
              id="signup-logo"
              name="logo"
              type="file"
              accept={BUSINESS_LOGO_ACCEPT}
              required
              onChange={onLogoChange}
              className="block w-full text-[13px] text-[#475569] file:mr-3 file:rounded-full file:border-0 file:bg-[#7c3aed] file:px-3 file:py-1.5 file:text-[13px] file:font-semibold file:text-white hover:file:bg-[#6d28d9]"
            />
            <p className="truncate text-[12px] text-[#64748b]">{logoName ?? "PNG or JPEG, up to 2 MB"}</p>
          </div>
        </div>
        <p className="text-[13px] leading-relaxed text-[#64748b]">
          This goes in the header of every invoice you issue and on your public booking page, so upload the version
          you would print. You can swap it later under Settings.
        </p>
      </div>

      <PhoneDialCodeField
        idPrefix="signup-phone"
        label="Mobile for booking alerts"
        required
        dialCode={phoneDial}
        localNumber={phoneLocal}
        onDialCodeChange={setPhoneDial}
        onLocalNumberChange={setPhoneLocal}
        localPlaceholder="7700 900123"
        showHint
      />
      <p className="-mt-2 text-[13px] leading-relaxed text-[#64748b]">
        We text this number when a guest books — use the mobile you check during service.
      </p>

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

      <p className="rounded-2xl border border-[#ede9fe] bg-[#faf5ff] px-4 py-3 text-[13px] leading-relaxed text-[#5b21b6]">
        Next: ~5-minute setup → optional deposits → publish your <span className="font-semibold">/book</span> link.
      </p>

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
