import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Radar } from "lucide-react";

import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";

import { FindLeadsForm } from "./search-form";
import { FoundLeadsTable, type FoundLead } from "./results-table";

export const metadata: Metadata = {
  title: "Find leads · Dashboard · Solvio",
};

export default async function FindLeadsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: biz } = await supabase
    .from("businesses")
    .select("id,name")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  // Load this user's most recent search + its scored leads.
  const db = createSupabaseServiceRoleClient();
  const owner = user.email ?? user.id;
  let leads: FoundLead[] = [];
  let lastSearchLabel = "";
  if (biz) {
    const { data: search } = await db
      .from("lead_discovery_searches")
      .select("id, query, location, status, created_at")
      .eq("created_by", owner)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (search?.id) {
      lastSearchLabel = `${search.query} in ${search.location}`;
      const { data: rows } = await db
        .from("discovered_leads")
        .select(
          "id, business_name, category, phone, city, rating, review_count, has_website, fit_score, status",
        )
        .eq("search_id", search.id)
        .in("status", ["new", "promoted"])
        .order("fit_score", { ascending: false })
        .limit(200);
      leads = (rows ?? []) as FoundLead[];
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 md:py-10">
      <Link
        href="/dashboard/leads"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-[#7c3aed] hover:underline"
      >
        <ArrowLeft className="size-4" /> Leads
      </Link>

      <div className="mb-6 flex items-start gap-3">
        <div className="flex size-11 items-center justify-center rounded-2xl bg-[#f3effe] text-[#7c3aed]">
          <Radar className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[#0f172a]">Find leads</h1>
          <p className="mt-1 text-sm text-[#64748b]">
            Discover local businesses to call, scored as prospects, and add them straight to your call list.
          </p>
        </div>
      </div>

      {!biz ? (
        <p className="rounded-2xl border border-dashed border-[#e2e0f0] bg-white p-8 text-center text-sm text-[#94a3b8]">
          Finish setting up your business first, then come back to find leads.
        </p>
      ) : (
        <div className="space-y-6">
          <FindLeadsForm />
          {lastSearchLabel ? (
            <p className="text-sm font-medium text-[#475569]">
              Latest search: <span className="text-[#0f172a]">{lastSearchLabel}</span>
            </p>
          ) : null}
          <FoundLeadsTable leads={leads} />
        </div>
      )}
    </div>
  );
}
