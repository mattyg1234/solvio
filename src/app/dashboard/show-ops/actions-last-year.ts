"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireShowOpsAction } from "@/lib/show-ops/access";
import { parseLastYearCsv } from "@/lib/show-ops/last-year";

const BACK = "/dashboard/show-ops/reports";
const MAX_BYTES = 2_000_000;

/**
 * Year on year (Joel, 8 Nov 2026): load last year's pax per night and island
 * from a CSV ("date, island, pax"), e.g. Joel's night tracker. Re-uploading the
 * same night + island replaces it. Admin only.
 */
export async function importLastYearPaxAction(formData: FormData): Promise<void> {
  const ctx = await requireShowOpsAction("admin", "reports");
  const back = (q: Record<string, string>) => redirect(`${BACK}?${new URLSearchParams(q).toString()}#last-year`);
  const file = formData.get("file");
  let text = String(formData.get("text") ?? "");
  if (file && typeof file === "object" && "size" in file && file.size > 0) {
    if (file.size > MAX_BYTES) back({ ly_error: "That file is too big (2 MB max)." });
    text = await file.text();
  }
  if (!text.trim()) back({ ly_error: "Choose a CSV file or paste the figures first." });

  const allowed = ctx.config.islands.filter((i) => ctx.allowedIslands === null || ctx.allowedIslands.includes(i));
  const { rows, skipped } = parseLastYearCsv(text, ctx.config.islands);
  const usable = rows.filter((r) => allowed.includes(r.island));
  if (!usable.length) back({ ly_error: "No lines could be read. Use date, island, pax (e.g. 07/11/2025, ACE, 82)." });

  const now = new Date().toISOString();
  for (let i = 0; i < usable.length; i += 500) {
    const { error } = await ctx.supabase.from("show_last_year_pax").upsert(
      usable.slice(i, i + 500).map((r) => ({
        business_id: ctx.business.id,
        show_date: r.show_date,
        island: r.island,
        pax: r.pax,
        source: "upload",
        updated_at: now,
      })),
      { onConflict: "business_id,show_date,island" },
    );
    if (error) {
      back({
        ly_error: /show_last_year_pax/.test(error.message)
          ? "Last-year figures are not set up in the database yet."
          : error.message.slice(0, 180),
      });
    }
  }
  revalidatePath(BACK);
  back({ ly_imported: String(usable.length), ly_skipped: String(skipped.length + rows.length - usable.length) });
}
