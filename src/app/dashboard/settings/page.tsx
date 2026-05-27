import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { coerceValidIanaTimeZone } from "@/lib/safe-timezone";
import {
  BOOKING_MONTHLY_GBP,
  formatTrialEndDate,
  isTrialExpired,
  trialDaysRemaining,
} from "@/lib/solvio-pricing";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

import { BusinessProfileForm } from "./business-profile-form";
import { SettingsTestEmailButton } from "./settings-test-email-button";
import { UpdatePasswordForm } from "@/components/auth/update-password-form";

export const metadata: Metadata = {
  title: "Settings · Dashboard · Solvio",
};

type SettingsSearchRaw = Record<string, string | string[] | undefined>;

function firstQueryString(raw: SettingsSearchRaw, key: string): string | undefined {
  const v = raw[key];
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return undefined;
}

export default async function DashboardSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<SettingsSearchRaw> | SettingsSearchRaw;
}) {
  const raw = searchParams != null && typeof (searchParams as Promise<unknown>).then === "function"
    ? await (searchParams as Promise<SettingsSearchRaw>)
    : ((searchParams as SettingsSearchRaw | undefined) ?? {});
  const passwordResetFlow = firstQueryString(raw, "password") === "reset";
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile, error: profileError } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  const { data: businesses, error: businessesError } = await supabase
    .from("businesses")
    .select("id,name,website_url,logo_url,time_zone,booking_slug,stripe_connect_account_id,subscription_tier,created_at,stripe_customer_id")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true });

  const primaryBusiness = businesses?.[0] ?? null;
  const subscriptionTier = (primaryBusiness as { subscription_tier?: string } | null)?.subscription_tier ?? "trial";
  const businessCreatedAt = (primaryBusiness as { created_at?: string } | null)?.created_at ?? null;

  const profileMissingMessage =
    profileError?.message?.toLowerCase().includes("permission denied") ||
    businessesError?.message?.toLowerCase().includes("permission denied")
      ? "Your account exists but the database could not read your rows — Supabase table grants were missing. Hard-refresh the page or contact support if this persists."
      : "Your profile row wasn't created yet — run the database migration in Supabase (SQL file in supabase/migrations/), then sign up again or insert a profile for your user id.";

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Badge variant="outline" className="rounded-full border-[#ebe7f7] text-[11px] font-semibold uppercase tracking-[0.2em] text-[#64748b]">
          Workspace identity
        </Badge>
        <h1 className="text-[clamp(1.45rem,3vw,2rem)] font-semibold tracking-tight text-[#0f172a]">Settings</h1>
        <p className="max-w-2xl text-[15px] leading-relaxed text-[#64748b]">
          Profile and venue rows stay governed by Supabase RLS — adjust commerce details under Payments when Stripe connects.
        </p>
      </div>

      {!profile ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {profileMissingMessage}
        </p>
      ) : null}

      <Card className="rounded-[22px] border border-[#c4b5fd] bg-gradient-to-br from-[#faf5ff] to-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-[#0f172a]">Plan &amp; billing</CardTitle>
          <CardDescription className="text-[#64748b]">
            Your Solvio subscription is separate from guest Stripe deposits.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-[15px] text-[#475569]">
            <span className="font-semibold text-[#0f172a]">Current plan:</span>{" "}
            {subscriptionTier === "trial"
              ? "Free trial"
              : subscriptionTier.charAt(0).toUpperCase() + subscriptionTier.slice(1)}
          </p>
          {subscriptionTier === "trial" && businessCreatedAt ? (
            <p className="text-sm text-[#64748b]">
              {isTrialExpired(businessCreatedAt)
                ? `Trial ended — add Booking (£${BOOKING_MONTHLY_GBP}/mo) to keep your link live.`
                : `${trialDaysRemaining(businessCreatedAt)} day${trialDaysRemaining(businessCreatedAt) === 1 ? "" : "s"} left${formatTrialEndDate(businessCreatedAt) ? ` (ends ${formatTrialEndDate(businessCreatedAt)})` : ""}.`}
            </p>
          ) : null}
          <Link
            href="/dashboard/pricing"
            className={cn(buttonVariants({ variant: "default" }), "inline-flex h-10 rounded-full px-6 text-sm font-semibold")}
          >
            {subscriptionTier === "trial" ? `Add card · Booking £${BOOKING_MONTHLY_GBP}/mo →` : "Manage plan →"}
          </Link>
        </CardContent>
      </Card>

      <Card className="rounded-[22px] border border-[#ebe7f7] bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-[#0f172a]">Profile</CardTitle>
          <CardDescription className="text-[#64748b]">Stored securely in Supabase with row-level security.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-[15px] text-[#475569]">
          <p>
            <span className="font-semibold text-[#0f172a]">Email:</span> {profile?.email ?? user.email ?? "—"}
          </p>
          <p>
            <span className="font-semibold text-[#0f172a]">Name:</span> {(profile?.full_name as string)?.trim() || "—"}
          </p>
          <p className="text-xs text-[#94a3b8]">User id: {user.id}</p>
        </CardContent>
      </Card>

      <Card className="rounded-[22px] border border-[#ebe7f7] bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-[#0f172a]">Password</CardTitle>
          <CardDescription className="text-[#64748b]">
            {passwordResetFlow
              ? "You arrived from a reset link — set a new password below."
              : "Update your sign-in password anytime."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UpdatePasswordForm highlight={passwordResetFlow} />
        </CardContent>
      </Card>

      <Card className="rounded-[22px] border border-[#ebe7f7] bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-[#0f172a]">Email delivery</CardTitle>
          <CardDescription className="text-[#64748b]">
            Guest booking confirmations and account emails send through Resend from hello@solviosystems.com.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SettingsTestEmailButton email={profile?.email ?? user.email ?? ""} />
        </CardContent>
      </Card>

      <Card className="rounded-[22px] border border-[#ebe7f7] bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-[#0f172a]">Business profile</CardTitle>
          <CardDescription className="text-[#64748b]">
            Name and timezone feed your public booking page and AI receptionist scripts. Stripe Connect lives under Payments.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!primaryBusiness ? (
            <p className="text-[15px] text-[#64748b]">No business rows yet.</p>
          ) : (
            <>
              <BusinessProfileForm
                businessId={primaryBusiness.id}
                initialName={primaryBusiness.name}
                initialWebsiteUrl={(primaryBusiness.website_url as string | null) ?? ""}
                initialLogoUrl={(primaryBusiness.logo_url as string | null) ?? ""}
                initialTimeZone={coerceValidIanaTimeZone(primaryBusiness.time_zone)}
                bookingSlug={(primaryBusiness.booking_slug as string | null) ?? null}
              />
              {primaryBusiness.stripe_connect_account_id ? (
                <p className="mt-4 text-xs font-medium uppercase tracking-[0.18em] text-[#64748b]">Stripe connected</p>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4 rounded-[22px] border border-dashed border-[#ddd6fe] bg-[#fafbff]/90 px-6 py-6 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-[#0f172a]">Need marketing context?</p>
          <p className="text-sm text-[#64748b]">Jump back to the public site — your session stays signed in.</p>
        </div>
        <Link href="/" className={cn(buttonVariants({ variant: "outline" }), "rounded-full border-[#ebe7f7] font-semibold")}>
          View homepage
        </Link>
      </div>

      <div className="md:hidden">
        <SignOutButton className="w-full rounded-xl border-[#ebe7f7] font-semibold" />
      </div>
    </div>
  );
}
