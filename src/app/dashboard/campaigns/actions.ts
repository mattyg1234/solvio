"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

async function assertOwnedBusiness(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, businessId: string, userId: string) {
  const { data: biz } = await supabase
    .from("businesses")
    .select("id")
    .eq("id", businessId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (!biz) throw new Error("Business not found.");
  return biz;
}

/** Flip the per-business opt-in flag for the AI Voice Campaigns module. */
export async function toggleCampaignsEnabledAction(businessId: string, enabled: boolean) {
  const { supabase, user } = await requireUser();
  await assertOwnedBusiness(supabase, businessId, user.id);

  const { error } = await supabase
    .from("businesses")
    .update({ campaigns_enabled: enabled, updated_at: new Date().toISOString() })
    .eq("id", businessId);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/campaigns");
  revalidatePath("/dashboard/settings");
  return { ok: true };
}
