import { redirect } from "next/navigation";

import { isSolvioAdminEmail } from "@/lib/solvio-admin";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";

import { LeadSearchForm } from "./search-form";
import { ResultsTable, type DiscoveredLeadRow } from "./results-table";

export const metadata = { title: "Lead finder · Solvio admin" };

export default async function AdminLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isSolvioAdminEmail(user.email ?? null)) redirect("/dashboard");

  const db = createSupabaseServiceRoleClient();
  const { search: searchParam } = await searchParams;

  // Recent searches for the picker / context.
  const { data: searches } = await db
    .from("lead_discovery_searches")
    .select("id, query, location, provider, status, result_count, created_at")
    .order("created_at", { ascending: false })
    .limit(15);

  const activeSearchId = searchParam ?? searches?.[0]?.id ?? null;

  const [{ data: leads }, { data: campaigns }] = await Promise.all([
    activeSearchId
      ? db
          .from("discovered_leads")
          .select(
            "id, business_name, category, phone, website, email, city, rating, review_count, has_website, fit_score, fit_signals, status",
          )
          .eq("search_id", activeSearchId)
          .order("fit_score", { ascending: false })
          .limit(200)
      : Promise.resolve({ data: [] as DiscoveredLeadRow[] }),
    db.from("voice_campaigns").select("id, name, business_id").order("created_at", { ascending: false }),
  ]);

  const activeSearch = searches?.find((s) => s.id === activeSearchId) ?? null;

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6 md:p-10">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#7c3aed]">Solvio admin</p>
        <h1 className="text-2xl font-semibold tracking-tight text-[#0f172a]">Lead finder</h1>
        <p className="max-w-2xl text-sm text-[#64748b]">
          Search a niche + location, pull local businesses, and score them for Solvio-fit (no website, no online
          booking, weak web presence). Promote the best ones straight into an outbound calling campaign — the AI
          takes it from there.
        </p>
      </header>

      <LeadSearchForm />

      {searches && searches.length > 0 && (
        <section className="rounded-2xl border border-[#ebe7f7] bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-[#0f172a]">Recent searches</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {searches.map((s) => (
              <li key={s.id}>
                <a
                  href={`/admin/leads?search=${s.id}`}
                  className={
                    s.id === activeSearchId
                      ? "inline-flex items-center gap-2 rounded-full border border-[#7c3aed] bg-[#f5f3ff] px-3 py-1.5 text-xs font-medium text-[#5b21b6]"
                      : "inline-flex items-center gap-2 rounded-full border border-[#ebe7f7] bg-white px-3 py-1.5 text-xs text-[#475569] hover:border-[#cbb8f5]"
                  }
                >
                  <span className="font-medium">{s.query}</span>
                  <span className="text-[#94a3b8]">· {s.location}</span>
                  <span className="text-[#94a3b8]">· {s.result_count}</span>
                  {s.status !== "completed" && (
                    <span className="rounded bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-700">
                      {s.status}
                    </span>
                  )}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {activeSearch && (
        <ResultsTable
          leads={(leads ?? []) as DiscoveredLeadRow[]}
          campaigns={(campaigns ?? []).map((c) => ({ id: c.id, name: c.name }))}
          searchLabel={`${activeSearch.query} · ${activeSearch.location}`}
        />
      )}
    </div>
  );
}
