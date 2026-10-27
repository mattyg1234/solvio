"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireGlobalShowOpsAdmin } from "@/lib/show-ops/access";
import { loadPartnerImportPlan } from "@/lib/show-ops/holded-partner-import-data";

const PAGE = "/dashboard/show-ops/settings/holded-partners";

/**
 * Copies Holded contact details into the ticked partners' empty fields. The plan is
 * worked out again here from Holded and the database, so the form only chooses which
 * partners; it can't carry values in, and nothing already filled is overwritten.
 */
export async function applyHoldedPartnerImportAction(formData: FormData): Promise<void> {
  const ctx = await requireGlobalShowOpsAdmin();
  const chosen = new Set(formData.getAll("partner").map((v) => String(v)));
  if (!chosen.size) redirect(`${PAGE}?error=${encodeURIComponent("Tick at least one partner to fill.")}`);

  const plan = await loadPartnerImportPlan(ctx);
  if (plan.error) redirect(`${PAGE}?error=${encodeURIComponent(plan.error)}`);

  let filled = 0;
  const failed: string[] = [];
  const now = new Date().toISOString();
  for (const row of plan.rows) {
    if (row.kind !== "fill" || !chosen.has(row.partner.id)) continue;
    const { error } = await ctx.supabase
      .from("show_suppliers")
      .update({ ...row.fill, updated_at: now })
      .eq("id", row.partner.id)
      .eq("business_id", ctx.business.id);
    if (error) failed.push(row.partner.name);
    else filled++;
  }

  revalidatePath("/dashboard/show-ops", "layout");
  revalidatePath(PAGE);
  const q = new URLSearchParams({ filled: String(filled) });
  if (failed.length) q.set("error", `Could not update: ${failed.slice(0, 5).join(", ")}${failed.length > 5 ? ` and ${failed.length - 5} more` : ""}`);
  redirect(`${PAGE}?${q.toString()}`);
}
