import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { businessNeedsOnboarding } from "@/lib/platform-capabilities";

import type { MerchantProfileDraft } from "./platform-onboarding-wizard";
import { PlatformOnboardingWizard } from "./platform-onboarding-wizard";

export const metadata: Metadata = {
  title: "Set up · Solvio",
};

type PageProps = {
  searchParams: Promise<{ step?: string; booking?: string }>;
};

function parseMerchantProfile(raw: unknown): MerchantProfileDraft {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const mp = raw as Record<string, unknown>;
  return {
    phone: typeof mp.phone === "string" ? mp.phone : "",
    address_line1: typeof mp.address_line1 === "string" ? mp.address_line1 : "",
    address_line2: typeof mp.address_line2 === "string" ? mp.address_line2 : "",
    city: typeof mp.city === "string" ? mp.city : "",
    postcode: typeof mp.postcode === "string" ? mp.postcode : "",
    country: typeof mp.country === "string" ? mp.country : "",
    address: typeof mp.address === "string" ? mp.address : "",
    social: typeof mp.social === "string" ? mp.social : "",
  };
}

export default async function DashboardPlatformOnboardingPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: biz } = await supabase
    .from("businesses")
    .select(
      "id,name,time_zone,logo_url,website_url,booking_flow_details,booking_flow_completed_at,onboarding_completed_at",
    )
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!biz?.id) {
    return (
      <div className="mx-auto max-w-lg space-y-6 rounded-[24px] border border-[#ebe7f7] bg-white p-8 text-[15px] text-[#64748b] shadow-sm">
        <p>You don&apos;t have a workspace yet — add a business from signup metadata or create one manually in Supabase.</p>
        <SignOutButton className="w-full rounded-full border-[#ebe7f7] font-semibold" />
      </div>
    );
  }

  if (!businessNeedsOnboarding(biz)) {
    redirect("/dashboard");
  }

  let merchantProfile: MerchantProfileDraft = {};
  const d = biz.booking_flow_details;
  if (d && typeof d === "object" && !Array.isArray(d)) {
    merchantProfile = parseMerchantProfile((d as Record<string, unknown>).merchant_onboarding_profile);
  }

  const stepFromQuery = Number.parseInt(sp.step ?? "", 10);
  let initialStep = Number.isFinite(stepFromQuery) ? Math.min(Math.max(stepFromQuery, 0), 4) : 0;
  if (sp.booking === "done" || biz.booking_flow_completed_at) {
    initialStep = Math.max(initialStep, 2);
  }

  return (
    <div className="space-y-10 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link href="/signup" className="text-[13px] font-semibold text-[#64748b] underline-offset-4 hover:text-[#7c3aed] hover:underline">
          Wrong account?
        </Link>
        <SignOutButton className="rounded-full border-[#ebe7f7] px-6 font-semibold" />
      </div>

      <PlatformOnboardingWizard
        businessId={biz.id}
        initialName={biz.name ?? ""}
        initialTimeZone={biz.time_zone ?? "UTC"}
        initialLogoUrl={biz.logo_url as string | null}
        initialWebsiteUrl={biz.website_url as string | null}
        merchantProfile={merchantProfile}
        initialStep={initialStep}
        bookingSetupComplete={Boolean(biz.booking_flow_completed_at)}
      />
    </div>
  );
}
