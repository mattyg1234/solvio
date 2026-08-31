import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { DashboardMain } from "@/components/dashboard/dashboard-main";
import { DashboardMobileNav } from "@/components/dashboard/dashboard-mobile-nav";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";
import { visibleShowOpsNav, type ShowOpsNavSection } from "@/lib/show-ops/nav";
import { OnboardingGate } from "@/components/dashboard/onboarding-gate";
import { StripeConnectAlert } from "@/components/dashboard/stripe-connect-alert";
import {
  describeStripeConnectDisplay,
  snapshotFromBusinessRow,
} from "@/lib/stripe-connect-status";
import { businessNeedsOnboarding, resolvePlatformCapabilities } from "@/lib/platform-capabilities";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Dashboard · Solvio",
  description: "Manage bookings, payments and AI reception for your business.",
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: ownedBiz } = await supabase
    .from("businesses")
    .select("id")
    .eq("owner_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!ownedBiz) {
    const { data: sellerMem } = await supabase
      .from("show_ops_members")
      .select("id")
      .eq("user_id", user.id)
      .eq("role", "seller")
      .limit(1)
      .maybeSingle();
    if (sellerMem) redirect("/partner");
  }

  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();

  const greetingName =
    typeof profile?.full_name === "string" && profile.full_name.trim().length > 0
      ? profile.full_name.trim()
      : null;

  const bizCols =
    "id,owner_id,platform_capabilities,onboarding_completed_at,campaigns_enabled,show_ops_enabled,show_ops_display_name,name,stripe_connect_account_id,stripe_connect_charges_enabled,stripe_connect_details_submitted,stripe_connect_payouts_enabled,stripe_connect_disabled_reason,stripe_connect_requirements_due,subscription_tier,created_at,booking_flow_completed_at,booking_slug";
  let { data: primaryBiz } = await supabase
    .from("businesses")
    .select(bizCols)
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!primaryBiz) {
    const admin = createSupabaseServiceRoleClient();
    const adminBiz = await admin
      .from("businesses")
      .select(bizCols)
      .eq("owner_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    primaryBiz = adminBiz.data;
  }

  const { data: stripeBusinesses } = await supabase
    .from("businesses")
    .select(
      "id,name,stripe_connect_account_id,stripe_connect_charges_enabled,stripe_connect_details_submitted,stripe_connect_payouts_enabled,stripe_connect_disabled_reason,stripe_connect_requirements_due",
    )
    .eq("owner_id", user.id);

  const capabilities = resolvePlatformCapabilities(primaryBiz?.platform_capabilities);
  const needsOnboarding = businessNeedsOnboarding(primaryBiz ?? null);
  const campaignsEnabled = Boolean((primaryBiz as { campaigns_enabled?: boolean } | null)?.campaigns_enabled);
  const showOpsEnabled = Boolean((primaryBiz as { show_ops_enabled?: boolean } | null)?.show_ops_enabled);

  // Which Show Ops pages this person may reach. primaryBiz is looked up by
  // owner_id, so a staff member who is not the owner never appears there —
  // fall back to their show_ops_members row, or a check-in login would get no
  // Show Ops sidebar at all. Hiding links is cosmetic; each page also calls
  // requireShowOpsPage server-side.
  let showOpsNavSections: ShowOpsNavSection[] | undefined;
  let showOpsMemberEnabled = false;
  if (showOpsEnabled && (primaryBiz as { owner_id?: string } | null)?.owner_id === user.id) {
    showOpsNavSections = visibleShowOpsNav("owner", null);
  } else {
    const { data: membership } = await supabase
      .from("show_ops_members")
      .select("role,allowed_pages")
      .eq("user_id", user.id)
      .neq("role", "seller")
      .limit(1)
      .maybeSingle();
    if (membership) {
      showOpsMemberEnabled = true;
      showOpsNavSections = visibleShowOpsNav(
        (membership as { role?: string }).role ?? "booker",
        (membership as { allowed_pages?: string[] | null }).allowed_pages ?? null,
      );
    }
  }
  const venueLaunchRequired =
    capabilities.appointments ||
    capabilities.events ||
    capabilities.tables ||
    capabilities.ai_receptionist ||
    capabilities.lead_generation;
  const stripePaymentsReady = Boolean(
    primaryBiz?.stripe_connect_account_id?.trim() && primaryBiz?.stripe_connect_charges_enabled,
  );
  const stripeConnectDisplay = primaryBiz?.stripe_connect_account_id?.trim()
    ? describeStripeConnectDisplay(
        primaryBiz.stripe_connect_account_id,
        snapshotFromBusinessRow(primaryBiz),
      )
    : null;
  const stripeConnectRestricted = stripeConnectDisplay?.status === "restricted";
  const subscriptionTier = (primaryBiz as { subscription_tier?: string } | null)?.subscription_tier ?? "trial";
  const businessCreatedAt = (primaryBiz as { created_at?: string } | null)?.created_at ?? null;
  const bookingFlowComplete = Boolean((primaryBiz as { booking_flow_completed_at?: string } | null)?.booking_flow_completed_at);
  const slugPublished = Boolean((primaryBiz as { booking_slug?: string } | null)?.booking_slug?.trim());

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <OnboardingGate needsOnboarding={needsOnboarding} />
      <div className="flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-[17rem] shrink-0 overflow-hidden md:block">
          <DashboardSidebar
            capabilities={capabilities}
            campaignsEnabled={campaignsEnabled}
            subscriptionTier={subscriptionTier}
            businessCreatedAt={businessCreatedAt}
            showOpsEnabled={showOpsEnabled || showOpsMemberEnabled}
            showOpsDisplayName={
              (primaryBiz as { show_ops_display_name?: string | null } | null)?.show_ops_display_name ||
              (primaryBiz as { name?: string | null } | null)?.name ||
              null
            }
            showOpsUserName={greetingName}
            showOpsNavSections={showOpsNavSections}
          />
        </aside>

        {/* min-w-0: a flex item defaults to min-width:auto, so without this the
            widest child (the bookings table) sets the column's floor and the whole
            page scrolls sideways — clipping the header actions and filter bar. */}
        <div className="flex min-h-screen min-w-0 flex-1 flex-col pb-[5.75rem] md:pb-0">
          <DashboardHeader
            email={user.email ?? ""}
            greetingName={greetingName}
            stripePaymentsReady={stripePaymentsReady}
            stripeConnectRestricted={stripeConnectRestricted}
            subscriptionTier={subscriptionTier}
            businessCreatedAt={businessCreatedAt}
            bookingFlowComplete={bookingFlowComplete}
            slugPublished={slugPublished}
            venueLaunchRequired={venueLaunchRequired}
          />
          {venueLaunchRequired ? <StripeConnectAlert businesses={stripeBusinesses ?? []} /> : null}
          <DashboardMain>{children}</DashboardMain>

          <DashboardMobileNav
            capabilities={capabilities}
            campaignsEnabled={campaignsEnabled}
            subscriptionTier={subscriptionTier}
            businessCreatedAt={businessCreatedAt}
            showOpsEnabled={showOpsEnabled}
          />
        </div>
      </div>
    </div>
  );
}
