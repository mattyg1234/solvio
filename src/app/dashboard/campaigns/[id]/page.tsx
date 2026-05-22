import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { CampaignAgentBuilder } from "@/components/dashboard/campaign-agent-builder";
import { CampaignLeadsPanel, type LeadRow } from "@/components/dashboard/campaign-leads-panel";
import { buttonVariants } from "@/components/ui/button";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Campaign · Solvio",
};

type CampaignRow = {
  id: string;
  business_id: string;
  name: string;
  agent_name: string | null;
  greeting_style: string | null;
  first_message: string | null;
  system_prompt: string | null;
  success_criteria: string | null;
  vapi_assistant_id: string | null;
};

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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

  const { data: campaignRaw } = await supabase
    .from("voice_campaigns")
    .select("*")
    .eq("id", id)
    .eq("business_id", business.id)
    .maybeSingle();
  if (!campaignRaw) notFound();
  const campaign = campaignRaw as CampaignRow;

  const { data: leadsData } = await supabase
    .from("voice_outbound_leads")
    .select(
      "id, phone, name, business_name, email, address_line1, city, postcode, interest_level, contact_role, reached_decision_maker, owner_name, owner_phone, owner_email, owner_best_time, objections, intake_notes, status, attempts, last_attempted_at, source"
    )
    .eq("campaign_id", campaign.id)
    .order("interest_level", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(500);
  const leads = (leadsData ?? []) as LeadRow[];

  const greetingStyle = ((): "warm" | "casual" | "luxury" => {
    if (campaign.greeting_style === "casual") return "casual";
    if (campaign.greeting_style === "luxury") return "luxury";
    return "warm";
  })();

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
        initial={{
          campaignId: campaign.id,
          name: campaign.name,
          agentName: campaign.agent_name ?? "",
          greetingStyle,
          firstMessage: campaign.first_message ?? "",
          systemPrompt: campaign.system_prompt ?? "",
          successCriteria: campaign.success_criteria ?? "",
          vapiAssistantId: campaign.vapi_assistant_id ?? "",
        }}
      />

      <CampaignLeadsPanel campaignId={campaign.id} leads={leads} />
    </div>
  );
}
