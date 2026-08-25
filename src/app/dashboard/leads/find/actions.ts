"use server";

import { revalidatePath } from "next/cache";

import { getLeadSource } from "@/lib/leads/source";
import { qualifyAll } from "@/lib/leads/qualify";
import type { LeadSearchFilters } from "@/lib/leads/types";
import { normalizePhoneE164WithFallbacks } from "@/lib/normalize-phone";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";

/** Resolve the signed-in user and their primary business. Throws if not set up. */
async function requireUserBusiness() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Please sign in.");

  const { data: biz } = await supabase
    .from("businesses")
    .select("id, name")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!biz) throw new Error("No business found on your account yet.");
  return { user, business: biz as { id: string; name: string } };
}

function fitSummary(signals: { label: string }[]): string {
  return signals.map((s) => s.label).join("; ");
}

/** Result object for useActionState — never throws to the client. */
export type FinderState = { ok: boolean; message: string };

/**
 * Run a Solvio lead search for the signed-in business, qualify every result and
 * store it. Searches are scoped to the user via `created_by`, so one customer
 * never sees another's results. Returns a friendly result instead of throwing.
 */
export async function runMyLeadSearch(
  _prev: FinderState | undefined,
  formData: FormData,
): Promise<FinderState> {
  const query = String(formData.get("query") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  if (!query || !location) return { ok: false, message: "Please enter a business type and a location." };

  const filters: LeadSearchFilters = {
    onlyNoWebsite: formData.get("onlyNoWebsite") === "on",
    requirePhone: formData.get("requirePhone") === "on",
    minRating: formData.get("minRating") ? Number(formData.get("minRating")) : undefined,
    limit: formData.get("limit") ? Number(formData.get("limit")) : 50,
  };

  let user: Awaited<ReturnType<typeof requireUserBusiness>>["user"];
  try {
    ({ user } = await requireUserBusiness());
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Please sign in." };
  }

  const db = createSupabaseServiceRoleClient();
  const source = getLeadSource();

  const { data: search, error: searchErr } = await db
    .from("lead_discovery_searches")
    .insert({
      query,
      location,
      filters,
      provider: source.name,
      status: "running",
      created_by: user.email ?? user.id,
    })
    .select("id")
    .single();
  if (searchErr || !search) {
    return { ok: false, message: "Couldn't start the search. Please try again in a moment." };
  }

  try {
    const raw = await source.search({ query, location, filters });
    const filtered = raw.filter((p) => {
      if (filters.onlyNoWebsite && p.website) return false;
      if (filters.requirePhone && !p.phone) return false;
      if (filters.minRating && (p.rating ?? 0) < filters.minRating) return false;
      return true;
    });

    const scored = await qualifyAll(filtered);
    scored.sort((a, b) => b.fitScore - a.fitScore);

    if (scored.length) {
      const rows = scored.map((p) => ({
        search_id: search.id,
        place_id: p.placeId,
        business_name: p.name,
        category: p.category,
        phone: p.phone,
        website: p.website,
        email: p.email,
        address: p.address,
        city: p.city,
        postcode: p.postcode,
        country: p.country,
        lat: p.lat,
        lng: p.lng,
        rating: p.rating,
        review_count: p.reviewCount,
        has_website: p.hasWebsite,
        fit_score: p.fitScore,
        fit_signals: p.fitSignals,
        raw: p.raw,
      }));
      const { error: insErr } = await db.from("discovered_leads").insert(rows);
      if (insErr) throw new Error(insErr.message);
    }

    await db
      .from("lead_discovery_searches")
      .update({ status: "completed", result_count: scored.length, completed_at: new Date().toISOString() })
      .eq("id", search.id);

    revalidatePath("/dashboard/leads/find");
    return scored.length
      ? { ok: true, message: `Found ${scored.length} ${scored.length === 1 ? "lead" : "leads"} for "${query}" in ${location}.` }
      : { ok: true, message: `No matching businesses found for "${query}" in ${location} — try a broader search.` };
  } catch (err) {
    await db
      .from("lead_discovery_searches")
      .update({ status: "failed", error: err instanceof Error ? err.message : String(err) })
      .eq("id", search.id);
    return { ok: false, message: "The search couldn't be completed. Please try again." };
  }
}

/** Find (or create) the business's "Lead Finder" campaign to receive new leads. */
async function findOrCreateLeadFinderCampaign(businessId: string): Promise<string> {
  const db = createSupabaseServiceRoleClient();
  const { data: existing } = await db
    .from("voice_campaigns")
    .select("id")
    .eq("business_id", businessId)
    .eq("name", "Lead Finder")
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  const { data: created, error } = await db
    .from("voice_campaigns")
    .insert({ business_id: businessId, name: "Lead Finder", status: "draft" })
    .select("id")
    .single();
  if (error || !created) throw new Error(error?.message ?? "Could not create a campaign for these leads.");
  return created.id as string;
}

/**
 * Add selected discovered leads to the business's call list (a campaign), so the
 * AI receptionist/agent can dial them. Mirrors the admin promote flow, scoped to
 * the signed-in business.
 */
export async function addLeadsToCallList(
  _prev: FinderState | undefined,
  formData: FormData,
): Promise<FinderState> {
  const leadIds = formData.getAll("leadIds").map(String).filter(Boolean);
  if (!leadIds.length) return { ok: false, message: "Select at least one lead first." };

  let business: Awaited<ReturnType<typeof requireUserBusiness>>["business"];
  try {
    ({ business } = await requireUserBusiness());
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Please sign in." };
  }

  const db = createSupabaseServiceRoleClient();
  let campaignId: string;
  try {
    campaignId = await findOrCreateLeadFinderCampaign(business.id);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Couldn't prepare your call list." };
  }

  const { data: leads, error: leadsErr } = await db
    .from("discovered_leads")
    .select("id, business_name, phone, email, address, city, postcode, country, fit_signals")
    .in("id", leadIds)
    .eq("status", "new");
  if (leadsErr) return { ok: false, message: "Couldn't load the selected leads. Please try again." };

  let added = 0;
  let skipped = 0;
  for (const lead of leads ?? []) {
    const normalizedPhone = lead.phone ? normalizePhoneE164WithFallbacks(lead.phone, "+44") : null;
    if (!normalizedPhone) {
      skipped++;
      continue;
    }
    const signals = Array.isArray(lead.fit_signals) ? (lead.fit_signals as { label: string }[]) : [];
    const { data: inserted, error: insErr } = await db
      .from("voice_outbound_leads")
      .upsert(
        {
          business_id: business.id,
          campaign_id: campaignId,
          phone: normalizedPhone,
          business_name: lead.business_name,
          email: lead.email,
          address_line1: lead.address,
          city: lead.city,
          postcode: lead.postcode,
          country: lead.country,
          source: "lead_finder",
          notes: fitSummary(signals),
          status: "queued",
        },
        { onConflict: "business_id,phone,campaign_id" },
      )
      .select("id")
      .single();
    if (insErr || !inserted) {
      skipped++;
      continue;
    }
    await db.from("discovered_leads").update({ status: "promoted", promoted_lead_id: inserted.id }).eq("id", lead.id);
    added++;
  }

  revalidatePath("/dashboard/leads/find");
  revalidatePath("/dashboard/campaigns");
  const skipNote = skipped ? ` (${skipped} skipped — no phone number)` : "";
  return added
    ? { ok: true, message: `Added ${added} ${added === 1 ? "lead" : "leads"} to your call list${skipNote}.` }
    : { ok: false, message: `Nothing added${skipNote || " — those leads need a phone number"}.` };
}
