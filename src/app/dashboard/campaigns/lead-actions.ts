"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { startOutboundCall } from "@/lib/vapi-outbound";

async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

async function assertOwnsCampaign(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
  campaignId: string,
) {
  const { data: c } = await supabase
    .from("voice_campaigns")
    .select("id, business_id, vapi_assistant_id, success_criteria, name")
    .eq("id", campaignId)
    .maybeSingle();
  if (!c) throw new Error("Campaign not found.");
  const { data: b } = await supabase
    .from("businesses")
    .select("id")
    .eq("id", c.business_id)
    .eq("owner_id", userId)
    .maybeSingle();
  if (!b) throw new Error("Not your campaign.");
  return c;
}

/** Normalize a phone to E.164 (best-effort). Returns null if not a valid number. */
function normalizePhone(raw: string, defaultCountry = "+44"): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Already E.164
  if (/^\+\d{6,15}$/.test(trimmed)) return trimmed;
  // Strip non-digits but keep leading +
  const digits = trimmed.replace(/[^\d]/g, "");
  if (digits.length < 6) return null;
  // UK national 07... → +447...
  if (defaultCountry === "+44" && digits.startsWith("0") && digits.length >= 10) {
    return "+44" + digits.slice(1);
  }
  // Generic: prepend default country code
  return defaultCountry + digits;
}

export async function addLeadAction(params: {
  campaignId: string;
  phone: string;
  name?: string;
  businessName?: string;
  notes?: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const { supabase, user } = await requireUser();
  const c = await assertOwnsCampaign(supabase, user.id, params.campaignId);
  const phoneE164 = normalizePhone(params.phone);
  if (!phoneE164) return { ok: false, message: `Phone "${params.phone}" doesn't look valid.` };

  const { error } = await supabase.from("voice_outbound_leads").insert({
    business_id: c.business_id,
    campaign_id: c.id,
    phone: phoneE164,
    name: params.name?.trim() || null,
    business_name: params.businessName?.trim() || null,
    notes: params.notes?.trim() || null,
    source: "manual",
  });
  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      return { ok: false, message: "Already in this campaign's lead list." };
    }
    return { ok: false, message: error.message };
  }
  revalidatePath(`/dashboard/campaigns/${params.campaignId}`);
  return { ok: true };
}

export async function uploadLeadsCsvAction(params: {
  campaignId: string;
  csv: string;
}): Promise<{ ok: true; added: number; skipped: number } | { ok: false; message: string }> {
  const { supabase, user } = await requireUser();
  const c = await assertOwnsCampaign(supabase, user.id, params.campaignId);

  const lines = params.csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { ok: false, message: "CSV is empty." };

  // Detect header
  const header = lines[0]!.toLowerCase();
  const hasHeader = /phone|name|business/.test(header);
  const dataLines = hasHeader ? lines.slice(1) : lines;

  // Determine column order from header if present, else assume phone,name,business
  let phoneCol = 0,
    nameCol = 1,
    bizCol = 2;
  if (hasHeader) {
    const cols = header.split(",").map((c) => c.trim());
    phoneCol = cols.findIndex((c) => /phone|number|mobile/.test(c));
    nameCol = cols.findIndex((c) => /^name$|first.?name|contact/.test(c));
    bizCol = cols.findIndex((c) => /business|company|venue|org/.test(c));
    if (phoneCol < 0) phoneCol = 0;
  }

  let added = 0;
  let skipped = 0;
  const rows: Array<{
    business_id: string;
    campaign_id: string;
    phone: string;
    name: string | null;
    business_name: string | null;
    source: string;
  }> = [];

  for (const line of dataLines.slice(0, 2000)) {
    const parts = line.split(",").map((p) => p.trim().replace(/^"|"$/g, ""));
    const phoneRaw = parts[phoneCol] ?? "";
    const phoneE164 = normalizePhone(phoneRaw);
    if (!phoneE164) {
      skipped++;
      continue;
    }
    rows.push({
      business_id: c.business_id,
      campaign_id: c.id,
      phone: phoneE164,
      name: (nameCol >= 0 ? parts[nameCol] : null) || null,
      business_name: (bizCol >= 0 ? parts[bizCol] : null) || null,
      source: "csv",
    });
  }

  if (rows.length === 0) return { ok: false, message: `No valid rows. ${skipped} skipped.` };

  const { error } = await supabase.from("voice_outbound_leads").upsert(rows, {
    onConflict: "business_id,phone,campaign_id",
    ignoreDuplicates: true,
  });
  if (error) return { ok: false, message: error.message };
  added = rows.length;

  revalidatePath(`/dashboard/campaigns/${params.campaignId}`);
  return { ok: true, added, skipped };
}

export async function deleteLeadAction(leadId: string, campaignId: string) {
  const { supabase, user } = await requireUser();
  const c = await assertOwnsCampaign(supabase, user.id, campaignId);
  const { error } = await supabase
    .from("voice_outbound_leads")
    .delete()
    .eq("id", leadId)
    .eq("business_id", c.business_id);
  if (error) throw new Error(error.message);
  revalidatePath(`/dashboard/campaigns/${campaignId}`);
}

/** Export all leads for a campaign as a CSV string. */
export async function exportLeadsCSVAction(campaignId: string): Promise<
  { ok: true; csv: string; filename: string } | { ok: false; message: string }
> {
  const { supabase, user } = await requireUser();
  const c = await assertOwnsCampaign(supabase, user.id, campaignId);

  const { data: leads, error } = await supabase
    .from("voice_outbound_leads")
    .select(
      "phone,name,business_name,email,address_line1,city,postcode,country,interest_level,intake_notes,status,attempts,notes,created_at"
    )
    .eq("campaign_id", campaignId)
    .eq("business_id", c.business_id)
    .order("interest_level", { ascending: true, nullsFirst: false })
    .order("created_at");

  if (error) return { ok: false, message: error.message };
  if (!leads || leads.length === 0) return { ok: false, message: "No leads to export." };

  const cols = [
    "phone", "name", "business_name", "email",
    "address_line1", "city", "postcode", "country",
    "interest_level", "intake_notes", "status", "attempts",
    "notes", "created_at",
  ];

  const esc = (v: unknown): string => {
    const s = v == null ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const rows = leads.map((l) => cols.map((col) => esc((l as Record<string, unknown>)[col])).join(","));
  const csv = [cols.join(","), ...rows].join("\n");

  const slug = c.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 40);
  const date = new Date().toISOString().slice(0, 10);
  return { ok: true, csv, filename: `leads-${slug}-${date}.csv` };
}

/** Dial a single lead now (deducts 1 credit). */
export async function dialLeadNowAction(params: {
  leadId: string;
  campaignId: string;
}): Promise<{ ok: true; callId: string; creditSource: string } | { ok: false; message: string }> {
  const { supabase, user } = await requireUser();
  const c = await assertOwnsCampaign(supabase, user.id, params.campaignId);

  if (!c.vapi_assistant_id) {
    return { ok: false, message: "Save the campaign first to provision the assistant." };
  }

  const { data: lead } = await supabase
    .from("voice_outbound_leads")
    .select("id, phone, status, business_id")
    .eq("id", params.leadId)
    .eq("business_id", c.business_id)
    .maybeSingle();
  if (!lead) return { ok: false, message: "Lead not found." };
  if (lead.status === "do_not_call") {
    return { ok: false, message: "Lead is marked Do Not Call." };
  }

  // Atomic credit deduction (trial → bundle waterfall)
  const admin = createSupabaseServiceRoleClient();
  const { data: creditSource, error: credErr } = await admin.rpc("deduct_outbound_call_credit", {
    p_business_id: c.business_id,
  });
  if (credErr) return { ok: false, message: credErr.message };
  if (creditSource === "insufficient") {
    return { ok: false, message: "No call credits left. Buy a bundle to keep dialing." };
  }

  // Mark lead as dialing
  await admin
    .from("voice_outbound_leads")
    .update({
      status: "dialing",
      attempts: 1,
      last_attempted_at: new Date().toISOString(),
    })
    .eq("id", lead.id);

  // Fire the outbound call
  const callRes = await startOutboundCall({
    assistantId: c.vapi_assistant_id,
    toPhoneE164: lead.phone,
    metadata: {
      solvio_campaign_id: c.id,
      solvio_lead_id: lead.id,
      solvio_business_id: c.business_id,
    },
  });

  if (!callRes.ok) {
    await admin
      .from("voice_outbound_leads")
      .update({ status: "failed", last_attempted_at: new Date().toISOString() })
      .eq("id", lead.id);
    return { ok: false, message: callRes.message };
  }

  // Insert call log row (will be enriched by webhook on call.ended)
  await admin.from("voice_call_logs").insert({
    business_id: c.business_id,
    campaign_id: c.id,
    lead_id: lead.id,
    direction: "outbound",
    vapi_call_id: callRes.callId,
    caller_phone: lead.phone,
    started_at: new Date().toISOString(),
  });

  // Bump campaign attempt counter
  const { data: campRow } = await admin
    .from("voice_campaigns")
    .select("total_calls_attempted")
    .eq("id", c.id)
    .maybeSingle();
  const prevAttempts = typeof campRow?.total_calls_attempted === "number" ? campRow.total_calls_attempted : 0;
  await admin
    .from("voice_campaigns")
    .update({ total_calls_attempted: prevAttempts + 1, updated_at: new Date().toISOString() })
    .eq("id", c.id);

  revalidatePath(`/dashboard/campaigns/${params.campaignId}`);
  return { ok: true, callId: callRes.callId, creditSource: String(creditSource) };
}
