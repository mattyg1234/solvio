"use server";

import { revalidatePath } from "next/cache";

import { getLeadSource } from "@/lib/leads/source";
import { qualifyAll } from "@/lib/leads/qualify";
import type { LeadSearchFilters } from "@/lib/leads/types";
import { normalizePhoneE164WithFallbacks } from "@/lib/normalize-phone";
import { isSolvioAdminEmail } from "@/lib/solvio-admin";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";

async function assertAdmin(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isSolvioAdminEmail(user?.email)) {
    throw new Error("Not authorised.");
  }
}

function fitSummary(signals: { label: string }[]): string {
  return signals.map((s) => s.label).join("; ");
}

/** Run a maps search, qualify every result, and persist the run + leads. */
export async function runLeadSearch(formData: FormData): Promise<{ searchId: string }> {
  await assertAdmin();

  const query = String(formData.get("query") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  if (!query || !location) throw new Error("Niche and location are required.");

  const filters: LeadSearchFilters = {
    onlyNoWebsite: formData.get("onlyNoWebsite") === "on",
    requirePhone: formData.get("requirePhone") === "on",
    minRating: formData.get("minRating") ? Number(formData.get("minRating")) : undefined,
    limit: formData.get("limit") ? Number(formData.get("limit")) : 50,
  };

  const db = createSupabaseServiceRoleClient();
  const source = getLeadSource();

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: search, error: searchErr } = await db
    .from("lead_discovery_searches")
    .insert({
      query,
      location,
      filters,
      provider: source.name,
      status: "running",
      created_by: user?.email ?? null,
    })
    .select("id")
    .single();
  if (searchErr || !search) throw new Error(searchErr?.message ?? "Could not start search.");

  try {
    const raw = await source.search({ query, location, filters });

    // Apply operator filters before the (slower) website qualification step.
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
  } catch (err) {
    await db
      .from("lead_discovery_searches")
      .update({ status: "failed", error: err instanceof Error ? err.message : String(err) })
      .eq("id", search.id);
    throw err;
  }

  revalidatePath("/admin/leads");
  return { searchId: search.id };
}

/** Promote selected discovered leads into an outbound calling campaign. */
export async function promoteLeads(formData: FormData): Promise<{ promoted: number; skipped: number }> {
  await assertAdmin();

  const campaignId = String(formData.get("campaignId") ?? "").trim();
  const leadIds = formData.getAll("leadIds").map(String).filter(Boolean);
  if (!campaignId) throw new Error("Pick a campaign to add these leads to.");
  if (!leadIds.length) throw new Error("Select at least one lead.");

  const db = createSupabaseServiceRoleClient();

  const { data: campaign, error: campErr } = await db
    .from("voice_campaigns")
    .select("id, business_id")
    .eq("id", campaignId)
    .single();
  if (campErr || !campaign) throw new Error("Campaign not found.");

  const { data: leads, error: leadsErr } = await db
    .from("discovered_leads")
    .select("id, business_name, phone, email, address, city, postcode, country, fit_signals")
    .in("id", leadIds)
    .eq("status", "new");
  if (leadsErr) throw new Error(leadsErr.message);

  let promoted = 0;
  let skipped = 0;

  for (const lead of leads ?? []) {
    const normalizedPhone = lead.phone ? normalizePhoneE164WithFallbacks(lead.phone, "+44") : null;
    if (!normalizedPhone) {
      skipped++; // can't call a business with no phone
      continue;
    }
    const signals = Array.isArray(lead.fit_signals) ? (lead.fit_signals as { label: string }[]) : [];
    const { data: inserted, error: insErr } = await db
      .from("voice_outbound_leads")
      .upsert(
        {
          business_id: campaign.business_id,
          campaign_id: campaign.id,
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

    await db
      .from("discovered_leads")
      .update({ status: "promoted", promoted_lead_id: inserted.id })
      .eq("id", lead.id);
    promoted++;
  }

  revalidatePath("/admin/leads");
  return { promoted, skipped };
}

export async function dismissLead(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("leadId") ?? "").trim();
  if (!id) return;
  const db = createSupabaseServiceRoleClient();
  await db.from("discovered_leads").update({ status: "dismissed" }).eq("id", id);
  revalidatePath("/admin/leads");
}
