import { createHash } from "node:crypto";

import { headers } from "next/headers";

/** Fingerprint stored server-side inside `booking_submit_audit` (via SECURITY DEFINER RPC). No PII leaked. */
export async function getBookingSubmitRateFingerprint(normalizedSlug: string): Promise<string | null> {
  const trimmed = normalizedSlug.trim().toLowerCase();
  if (!trimmed) return null;

  const salt =
    process.env.BOOKING_RATE_SALT?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.slice(-18) ||
    "solvio-booking-rate";

  try {
    const h = await headers();
    const chain = h.get("x-forwarded-for")?.split(",").map((x) => x.trim()).filter(Boolean);
    const clientIp =
      chain && chain.length > 0 ? chain[0]! : h.get("x-real-ip")?.trim() || h.get("cf-connecting-ip")?.trim() || "anon";
    return createHash("sha256").update(`${trimmed}|${clientIp}|${salt}`, "utf8").digest("hex").slice(0, 72);
  } catch {
    return createHash("sha256").update(`${trimmed}|anon|${salt}`, "utf8").digest("hex").slice(0, 72);
  }
}
