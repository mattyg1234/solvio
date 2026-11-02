"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireGlobalShowOpsAdmin, requireShowOpsAction } from "@/lib/show-ops/access";
import { fillFor, holdedDetailsFor, type PartnerFill } from "@/lib/show-ops/holded-partner-import";
import { loadPartnerImportPlan } from "@/lib/show-ops/holded-partner-import-data";
import {
  holdedClientFor,
  safeHoldedMessage,
  sendPartnerToHolded,
  updatePartnerFromHolded,
  type PartnerHoldedResult,
} from "@/lib/show-ops/holded-partner-sync";

const PAGE = "/dashboard/show-ops/settings/holded-partners";

function done(q: Record<string, string>): never {
  revalidatePath("/dashboard/show-ops", "layout");
  revalidatePath(PAGE);
  redirect(`${PAGE}?${new URLSearchParams(q).toString()}`);
}

function failedNote(failed: string[]): string {
  return `Could not update: ${failed.slice(0, 5).join(", ")}${failed.length > 5 ? ` and ${failed.length - 5} more` : ""}`;
}

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

  const patches: Array<{ id: string; name: string; patch: PartnerFill }> = [];
  for (const row of plan.rows) {
    if (row.kind === "fill" && chosen.has(row.partner.id)) patches.push({ id: row.partner.id, name: row.partner.name, patch: row.fill });
  }
  const { filled, failed } = await savePatches(ctx, patches);
  done({ filled: String(filled), ...(failed.length ? { error: failedNote(failed) } : {}) });
}

/** Unclear name matches: link each partner to the Holded contact the office picked, filling its empty fields. */
export async function linkHoldedPartnersAction(formData: FormData): Promise<void> {
  const ctx = await requireGlobalShowOpsAdmin();
  const plan = await loadPartnerImportPlan(ctx);
  if (plan.error) redirect(`${PAGE}?error=${encodeURIComponent(plan.error)}`);
  const patches: Array<{ id: string; name: string; patch: PartnerFill }> = [];
  for (const row of plan.rows) {
    if (row.kind !== "ambiguous") continue;
    const pick = String(formData.get(`link:${row.partner.id}`) ?? "");
    // Only one of the contacts offered for this partner can be chosen.
    const contact = row.contacts.find((c) => c.id === pick);
    if (contact) patches.push({ id: row.partner.id, name: row.partner.name, patch: { ...fillFor(row.partner, contact), holded_contact_id: contact.id } });
  }
  if (!patches.length) redirect(`${PAGE}?error=${encodeURIComponent("Pick a Holded contact for at least one partner.")}`);
  const { filled, failed } = await savePatches(ctx, patches);
  done({ linked: String(filled), ...(failed.length ? { error: failedNote(failed) } : {}) });
}

/** Conflicts the office resolved in Holded's favour: the Hub takes Holded's details and link. */
export async function applyHoldedDetailsAction(formData: FormData): Promise<void> {
  const ctx = await requireGlobalShowOpsAdmin();
  const chosen = new Set(formData.getAll("partner").map((v) => String(v)));
  if (!chosen.size) redirect(`${PAGE}?error=${encodeURIComponent("Tick at least one partner.")}`);
  const plan = await loadPartnerImportPlan(ctx);
  if (plan.error) redirect(`${PAGE}?error=${encodeURIComponent(plan.error)}`);
  const patches: Array<{ id: string; name: string; patch: PartnerFill }> = [];
  for (const row of plan.rows) {
    if (row.kind === "conflict" && chosen.has(row.partner.id)) patches.push({ id: row.partner.id, name: row.partner.name, patch: holdedDetailsFor(row.contact) });
  }
  const { filled, failed } = await savePatches(ctx, patches);
  done({ replaced: String(filled), ...(failed.length ? { error: failedNote(failed) } : {}) });
}

/** Partners Holded doesn't have yet: create their Holded contacts from the Hub's details. */
export async function createHoldedContactsAction(formData: FormData): Promise<void> {
  const ctx = await requireGlobalShowOpsAdmin();
  const chosen = new Set(formData.getAll("partner").map((v) => String(v)));
  if (!chosen.size) redirect(`${PAGE}?error=${encodeURIComponent("Tick at least one partner to create in Holded.")}`);
  const plan = await loadPartnerImportPlan(ctx);
  if (plan.error) redirect(`${PAGE}?error=${encodeURIComponent(plan.error)}`);
  const client = await holdedClientFor(ctx);
  if (!client) redirect(`${PAGE}?error=${encodeURIComponent("Holded is not connected.")}`);
  let created = 0;
  const failed: string[] = [];
  for (const row of plan.rows) {
    if (row.kind !== "unmatched" || !chosen.has(row.partner.id)) continue;
    try {
      // The plan just checked Holded by link, NIF and name, so skip a second lookup per partner.
      const res = await sendPartnerToHolded(ctx, client, row.partner.id, { knownMissing: true });
      if (res.ok) created++;
      else failed.push(row.partner.name);
    } catch (err) {
      failed.push(`${row.partner.name} (${safeHoldedMessage(err)})`);
    }
  }
  done({ created: String(created), ...(failed.length ? { error: failedNote(failed) } : {}) });
}

async function savePatches(
  ctx: Awaited<ReturnType<typeof requireGlobalShowOpsAdmin>>,
  patches: Array<{ id: string; name: string; patch: PartnerFill }>,
): Promise<{ filled: number; failed: string[] }> {
  let filled = 0;
  const failed: string[] = [];
  const now = new Date().toISOString();
  for (const p of patches) {
    const { error } = await ctx.supabase
      .from("show_suppliers")
      .update({ ...p.patch, updated_at: now })
      .eq("id", p.id)
      .eq("business_id", ctx.business.id);
    if (error) failed.push(p.name);
    else filled++;
  }
  return { filled, failed };
}

async function onePartner(
  formData: FormData,
  run: (ctx: Awaited<ReturnType<typeof requireShowOpsAction>>, client: NonNullable<Awaited<ReturnType<typeof holdedClientFor>>>, id: string) => Promise<PartnerHoldedResult>,
): Promise<PartnerHoldedResult> {
  try {
    const ctx = await requireShowOpsAction("admin", "partners");
    const id = String(formData.get("supplier_id") ?? "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, message: "Pick a partner first." };
    const client = await holdedClientFor(ctx);
    if (!client) return { ok: false, message: "Holded is not connected. Add the API token in Settings." };
    const res = await run(ctx, client, id);
    revalidatePath("/dashboard/show-ops/master");
    return res;
  } catch (err) {
    return { ok: false, message: safeHoldedMessage(err) };
  }
}

/** Partner row button: make Holded's contact match this partner (creating it if needed). */
export async function sendPartnerToHoldedAction(formData: FormData): Promise<PartnerHoldedResult> {
  return onePartner(formData, (ctx, client, id) => sendPartnerToHolded(ctx, client, id));
}

/** Partner row button: make this partner's invoicing details match its Holded contact. */
export async function updatePartnerFromHoldedAction(formData: FormData): Promise<PartnerHoldedResult> {
  return onePartner(formData, (ctx, client, id) => updatePartnerFromHolded(ctx, client, id));
}
