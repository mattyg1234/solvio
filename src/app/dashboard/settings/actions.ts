"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { suggestBookingSlug, isValidBookingSlug } from "@/lib/booking-slug";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SettingsActionResult = { ok: true } | { ok: false; message: string };

async function ownedBusiness(businessId: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: row } = await supabase
    .from("businesses")
    .select("id,name,booking_slug")
    .eq("id", businessId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!row) return { ok: false as const, message: "Business not found." };
  return { ok: true as const, supabase, row };
}

export async function updateBusinessProfileAction(formData: FormData): Promise<SettingsActionResult> {
  const businessId = String(formData.get("business_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const websiteUrl = String(formData.get("website_url") ?? "").trim();
  const logoUrl = String(formData.get("logo_url") ?? "").trim();
  const timeZone = String(formData.get("time_zone") ?? "").trim() || "UTC";

  if (!businessId) return { ok: false, message: "Missing business." };
  if (name.length < 2) return { ok: false, message: "Business name must be at least 2 characters." };

  const auth = await ownedBusiness(businessId);
  if (!auth.ok) return auth;

  const patch: Record<string, string> = {
    name,
    website_url: websiteUrl,
    logo_url: logoUrl,
    time_zone: timeZone,
    updated_at: new Date().toISOString(),
  };

  if (!auth.row.booking_slug?.trim()) {
    patch.booking_slug = suggestBookingSlug(name, businessId);
  }

  const { error } = await auth.supabase.from("businesses").update(patch).eq("id", businessId);
  if (error) return { ok: false, message: error.message };

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/bookings");
  return { ok: true };
}

export async function ensureBookingSlugAction(businessId: string): Promise<SettingsActionResult> {
  const auth = await ownedBusiness(businessId);
  if (!auth.ok) return auth;

  const existing = auth.row.booking_slug?.trim().toLowerCase() ?? "";
  if (existing && isValidBookingSlug(existing)) return { ok: true };

  const next = suggestBookingSlug(auth.row.name, businessId);
  const { error } = await auth.supabase
    .from("businesses")
    .update({ booking_slug: next, updated_at: new Date().toISOString() })
    .eq("id", businessId);

  if (error) return { ok: false, message: error.message };

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/bookings");
  return { ok: true };
}
