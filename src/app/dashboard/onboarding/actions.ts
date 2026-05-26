'use server';

import { revalidatePath } from "next/cache";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PlatformCapabilityKey } from "@/lib/platform-capabilities";

type MerchantExtras = {
  merchant_phone?: string;
  merchant_address_line1?: string;
  merchant_address_line2?: string;
  merchant_city?: string;
  merchant_postcode?: string;
  merchant_country?: string;
  merchant_social?: string;
};

function mergeDetails(existing: Record<string, unknown>, patch: MerchantExtras): Record<string, unknown> {
  const next = { ...existing };
  const profile =
    typeof next.merchant_onboarding_profile === "object" && next.merchant_onboarding_profile !== null
      ? { ...(next.merchant_onboarding_profile as Record<string, unknown>) }
      : {};

  if (patch.merchant_phone !== undefined) profile.phone = patch.merchant_phone;
  if (patch.merchant_address_line1 !== undefined) profile.address_line1 = patch.merchant_address_line1;
  if (patch.merchant_address_line2 !== undefined) profile.address_line2 = patch.merchant_address_line2;
  if (patch.merchant_city !== undefined) profile.city = patch.merchant_city;
  if (patch.merchant_postcode !== undefined) profile.postcode = patch.merchant_postcode;
  if (patch.merchant_country !== undefined) profile.country = patch.merchant_country;
  if (patch.merchant_social !== undefined) profile.social = patch.merchant_social;

  const formattedAddress = [
    patch.merchant_address_line1,
    patch.merchant_address_line2,
    patch.merchant_city,
    patch.merchant_postcode,
    patch.merchant_country,
  ]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(", ");
  if (formattedAddress) profile.address = formattedAddress;

  next.merchant_onboarding_profile = profile;
  return next;
}

export async function saveOnboardingBusinessProfile(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false as const, message: "Not authenticated." };
  }

  const bizId = String(formData.get("business_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const time_zone = String(formData.get("time_zone") ?? "").trim();
  const logo_url = String(formData.get("logo_url") ?? "").trim();
  const website_url = String(formData.get("website_url") ?? "").trim();

  const phone = String(formData.get("merchant_phone") ?? "").trim();
  const addressLine1 = String(formData.get("merchant_address_line1") ?? "").trim();
  const addressLine2 = String(formData.get("merchant_address_line2") ?? "").trim();
  const city = String(formData.get("merchant_city") ?? "").trim();
  const postcode = String(formData.get("merchant_postcode") ?? "").trim();
  const country = String(formData.get("merchant_country") ?? "").trim();
  const social = String(formData.get("merchant_social") ?? "").trim();

  if (!bizId || !name) {
    return { ok: false as const, message: "Business name is required." };
  }

  const { data: row, error: selErr } = await supabase
    .from("businesses")
    .select("id,booking_flow_details")
    .eq("id", bizId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (selErr || !row?.id) {
    return { ok: false as const, message: "Business not found." };
  }

  const existingDetails =
    row.booking_flow_details && typeof row.booking_flow_details === "object" && !Array.isArray(row.booking_flow_details)
      ? (row.booking_flow_details as Record<string, unknown>)
      : {};

  const booking_flow_details = mergeDetails(existingDetails, {
    merchant_phone: phone,
    merchant_address_line1: addressLine1,
    merchant_address_line2: addressLine2,
    merchant_city: city,
    merchant_postcode: postcode,
    merchant_country: country,
    merchant_social: social,
  });

  const { error: updErr } = await supabase
    .from("businesses")
    .update({
      name,
      time_zone: time_zone || "UTC",
      logo_url: logo_url.length > 0 ? logo_url : null,
      website_url: website_url.length > 0 ? website_url : null,
      booking_flow_details,
      updated_at: new Date().toISOString(),
    })
    .eq("id", bizId)
    .eq("owner_id", user.id);

  if (updErr) {
    return { ok: false as const, message: updErr.message };
  }

  revalidatePath("/dashboard/onboarding");
  revalidatePath("/dashboard");
  return { ok: true as const };
}

export async function saveOnboardingCapabilities(caps: Record<PlatformCapabilityKey, boolean>) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false as const, message: "Not authenticated." };
  }

  const { data: biz } = await supabase
    .from("businesses")
    .select("id")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!biz?.id) {
    return { ok: false as const, message: "No business on file." };
  }

  const { error } = await supabase
    .from("businesses")
    .update({
      platform_capabilities: caps,
      updated_at: new Date().toISOString(),
    })
    .eq("id", biz.id)
    .eq("owner_id", user.id);

  if (error) {
    return { ok: false as const, message: error.message };
  }

  revalidatePath("/dashboard");
  return { ok: true as const };
}

export async function completePlatformOnboarding() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false as const, message: "Not authenticated." };
  }

  const { data: biz } = await supabase
    .from("businesses")
    .select("id")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!biz?.id) {
    return { ok: false as const, message: "No business on file." };
  }

  const { error } = await supabase
    .from("businesses")
    .update({
      onboarding_completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", biz.id)
    .eq("owner_id", user.id);

  if (error) {
    return { ok: false as const, message: error.message };
  }

  revalidatePath("/dashboard");
  return { ok: true as const };
}
