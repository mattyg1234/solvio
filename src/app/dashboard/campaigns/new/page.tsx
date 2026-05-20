import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { CampaignAgentBuilder } from "@/components/dashboard/campaign-agent-builder";
import { buttonVariants } from "@/components/ui/button";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "New campaign · Solvio",
};

export default async function NewCampaignPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: business } = await supabase
    .from("businesses")
    .select("id,name,campaigns_enabled")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!business) redirect("/dashboard/settings");
  if (!(business as { campaigns_enabled?: boolean }).campaigns_enabled) {
    redirect("/dashboard/campaigns");
  }

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/campaigns"
        className={cn(
          buttonVariants({ variant: "ghost" }),
          "inline-flex h-10 items-center gap-2 px-2 text-sm font-semibold text-[#64748b] hover:text-[#0f172a]",
        )}
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Campaigns
      </Link>

      <CampaignAgentBuilder
        businessId={business.id}
        businessName={business.name}
        initial={{ name: "", greetingStyle: "warm" }}
      />
    </div>
  );
}
