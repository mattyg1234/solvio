import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { DashboardMobileNav } from "@/components/dashboard/dashboard-mobile-nav";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";
import { OnboardingGate } from "@/components/dashboard/onboarding-gate";
import { businessNeedsOnboarding, resolvePlatformCapabilities } from "@/lib/platform-capabilities";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();

  const greetingName =
    typeof profile?.full_name === "string" && profile.full_name.trim().length > 0
      ? profile.full_name.trim()
      : null;

  const { data: primaryBiz } = await supabase
    .from("businesses")
    .select("platform_capabilities,onboarding_completed_at,campaigns_enabled")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const capabilities = resolvePlatformCapabilities(primaryBiz?.platform_capabilities);
  const needsOnboarding = businessNeedsOnboarding(primaryBiz ?? null);
  const campaignsEnabled = Boolean((primaryBiz as { campaigns_enabled?: boolean } | null)?.campaigns_enabled);

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <OnboardingGate needsOnboarding={needsOnboarding} />
      <div className="flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-[17rem] shrink-0 overflow-hidden border-r border-[#ebe7f7]/90 md:block">
          <DashboardSidebar capabilities={capabilities} campaignsEnabled={campaignsEnabled} />
        </aside>

        <div className="flex min-h-screen flex-1 flex-col pb-[5.75rem] md:pb-0">
          <DashboardHeader email={user.email ?? ""} greetingName={greetingName} />
          <main className="relative mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8 md:py-10">{children}</main>

          <DashboardMobileNav capabilities={capabilities} campaignsEnabled={campaignsEnabled} />
        </div>
      </div>
    </div>
  );
}
