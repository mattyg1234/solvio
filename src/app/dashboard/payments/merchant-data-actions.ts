"use server";

import { redirect } from "next/navigation";

import {
  fetchStripeMerchantDashboard,
  type StripeMerchantDashboardResult,
} from "@/lib/stripe-connect-merchant";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function assertOwnedConnectBusiness(businessId: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: biz } = await supabase
    .from("businesses")
    .select("id,name,stripe_connect_account_id,stripe_connect_charges_enabled")
    .eq("id", businessId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!biz) {
    return { ok: false as const, message: "Business not found." };
  }

  const connectAccountId = biz.stripe_connect_account_id?.trim() || "";
  if (!connectAccountId || !biz.stripe_connect_charges_enabled) {
    return {
      ok: false as const,
      message: "Finish Stripe Connect setup before viewing balance analytics.",
    };
  }

  return {
    ok: true as const,
    biz: {
      id: biz.id,
      name: biz.name,
      connectAccountId,
    },
  };
}

export async function loadStripeMerchantDashboardAction(
  businessId: string,
): Promise<StripeMerchantDashboardResult> {
  const owned = await assertOwnedConnectBusiness(businessId);
  if (!owned.ok) return owned;

  return fetchStripeMerchantDashboard({
    businessId: owned.biz.id,
    businessName: owned.biz.name,
    connectAccountId: owned.biz.connectAccountId,
  });
}

export async function loadPrimaryStripeMerchantDashboardAction(): Promise<
  StripeMerchantDashboardResult & { businessId?: string }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: biz } = await supabase
    .from("businesses")
    .select("id,name,stripe_connect_account_id,stripe_connect_charges_enabled")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!biz?.id) {
    return { ok: false, message: "Add a business in Settings first." };
  }

  const connectAccountId = biz.stripe_connect_account_id?.trim() || "";
  if (!connectAccountId || !biz.stripe_connect_charges_enabled) {
    return {
      ok: false,
      message: "Connect Stripe under Payments to unlock live balance analytics.",
      businessId: biz.id,
    };
  }

  const result = await fetchStripeMerchantDashboard({
    businessId: biz.id,
    businessName: biz.name,
    connectAccountId,
  });

  return { ...result, businessId: biz.id };
}
