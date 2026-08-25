import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

import { SHOW_OPS_WORKSPACE_COOKIE } from "@/lib/show-ops/access";

/** Active Show Ops workspace (cookie) if allowed, else first owned, else first membership. */
export async function resolveShowOpsBusinessId(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ id: string; show_ops_enabled: boolean } | null> {
  const cookieStore = await cookies();
  const preferred = cookieStore.get(SHOW_OPS_WORKSPACE_COOKIE)?.value?.trim() || "";

  if (preferred) {
    const { data: ownedPreferred } = await supabase
      .from("businesses")
      .select("id,show_ops_enabled")
      .eq("id", preferred)
      .eq("owner_id", userId)
      .maybeSingle();
    if (ownedPreferred) return ownedPreferred;

    const { data: membership } = await supabase
      .from("show_ops_members")
      .select("business_id")
      .eq("user_id", userId)
      .eq("business_id", preferred)
      .maybeSingle();
    if (membership?.business_id) {
      const { data: memberBiz } = await supabase
        .from("businesses")
        .select("id,show_ops_enabled")
        .eq("id", membership.business_id)
        .maybeSingle();
      if (memberBiz) return memberBiz;
    }
  }

  const { data: owned } = await supabase
    .from("businesses")
    .select("id,show_ops_enabled")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (owned) return owned;

  const { data: membership } = await supabase
    .from("show_ops_members")
    .select("business_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (!membership?.business_id) return null;

  const { data: memberBiz } = await supabase
    .from("businesses")
    .select("id,show_ops_enabled")
    .eq("id", membership.business_id)
    .maybeSingle();
  return memberBiz;
}
