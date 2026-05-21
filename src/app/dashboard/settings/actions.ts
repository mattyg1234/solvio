"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { isValidBookingSlug } from "@/lib/booking-slug";
import { pickUniqueBookingSlug } from "@/lib/booking-slug-server";
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

  // Auto-create the booking slug from the (possibly-updated) name if the business has none yet.
  // Once a slug exists we leave it alone — slugs are permanent so customer-facing links never break.
  if (!auth.row.booking_slug?.trim()) {
    patch.booking_slug = await pickUniqueBookingSlug(auth.supabase, name, businessId);
  }

  const { error } = await auth.supabase.from("businesses").update(patch).eq("id", businessId);
  if (error) return { ok: false, message: error.message };

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/bookings");
  return { ok: true };
}

export type EnsureBookingSlugResult =
  | { ok: true; slug: string }
  | { ok: false; message: string };

/**
 * Make sure a business has a booking_slug. If it already has one, return it
 * unchanged. If not, derive one from the business name (with `-2`, `-3`, …
 * collision fallback) and persist it. Slugs are immutable once set — public
 * /book/[slug] URLs are forever, so this action never overwrites an existing
 * value, only fills in a missing one.
 */
export async function ensureBookingSlugAction(businessId: string): Promise<EnsureBookingSlugResult> {
  const auth = await ownedBusiness(businessId);
  if (!auth.ok) return auth;

  const existing = auth.row.booking_slug?.trim().toLowerCase() ?? "";
  if (existing && isValidBookingSlug(existing)) return { ok: true, slug: existing };

  const next = await pickUniqueBookingSlug(auth.supabase, auth.row.name, businessId);

  const { data, error } = await auth.supabase
    .from("businesses")
    .update({ booking_slug: next, updated_at: new Date().toISOString() })
    .eq("id", businessId)
    .is("booking_slug", null)
    .select("id, booking_slug");

  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      const retry = await pickUniqueBookingSlug(auth.supabase, auth.row.name, businessId);
      const second = await auth.supabase
        .from("businesses")
        .update({ booking_slug: retry, updated_at: new Date().toISOString() })
        .eq("id", businessId)
        .is("booking_slug", null)
        .select("id, booking_slug");
      if (second.error || !second.data?.length) {
        return { ok: false, message: "Couldn't reserve your booking link. Refresh and try again." };
      }
      revalidatePath("/dashboard");
      revalidatePath("/dashboard/bookings");
      revalidatePath(`/book/${encodeURIComponent(retry)}`);
      return { ok: true, slug: retry };
    }
    return { ok: false, message: error.message };
  }

  // Row missing means another tab already populated booking_slug — re-read.
  if (!data?.length) {
    const { data: refreshed } = await auth.supabase
      .from("businesses")
      .select("booking_slug")
      .eq("id", businessId)
      .maybeSingle();
    const slug = refreshed?.booking_slug?.trim() ?? "";
    if (slug) return { ok: true, slug };
    return { ok: false, message: "Couldn't reserve your booking link. Refresh and try again." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/bookings");
  revalidatePath(`/book/${encodeURIComponent(next)}`);
  return { ok: true, slug: next };
}
