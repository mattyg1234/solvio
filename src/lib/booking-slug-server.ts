import type { SupabaseClient } from "@supabase/supabase-js";

import { cleanSlugFromName, isValidBookingSlug } from "@/lib/booking-slug";

/**
 * Pick the first slug that's free on `businesses.booking_slug`.
 * Tries the name-derived base, then `base-2`, `base-3`, … up to `base-99`,
 * then falls back to a 6-char random suffix on truly hot bases.
 *
 * Callers should still defend against unique-constraint races by treating
 * a "duplicate" error from the eventual insert/update as recoverable.
 */
export async function pickUniqueBookingSlug(
  supabase: SupabaseClient,
  businessName: string,
  excludeBusinessId?: string,
): Promise<string> {
  const base = cleanSlugFromName(businessName);

  const tryCandidate = async (candidate: string): Promise<boolean> => {
    if (!isValidBookingSlug(candidate)) return false;
    let query = supabase.from("businesses").select("id").eq("booking_slug", candidate).limit(1);
    if (excludeBusinessId) query = query.neq("id", excludeBusinessId);
    const { data } = await query;
    return !data || data.length === 0;
  };

  if (await tryCandidate(base)) return base;

  for (let n = 2; n <= 99; n++) {
    const candidate = `${base}-${n}`;
    if (await tryCandidate(candidate)) return candidate;
  }

  const random = Math.random().toString(36).replace(/[^a-z0-9]/g, "").slice(0, 6) || "x";
  return `${base}-${random}`;
}
