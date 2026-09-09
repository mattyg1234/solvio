"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireShowOpsAction, type ShowOpsContext } from "@/lib/show-ops/access";
import { HoldedClient, holdedErrorMessage } from "@/lib/show-ops/holded";
import { holdedPurchaseFromExpense, parseExpenseForm, pickHoldedPurchaseTaxKey } from "@/lib/show-ops/expenses";
import { decryptSecret } from "@/lib/show-ops/secrets";

const RECEIPT_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
};
const RECEIPT_MAX_BYTES = 12 * 1024 * 1024;

function back(msg: { ok?: string; error?: string }) {
  const q = new URLSearchParams({ view: "expenses" });
  if (msg.ok) q.set("expense", msg.ok);
  if (msg.error) q.set("expense_error", msg.error.slice(0, 300));
  revalidatePath("/dashboard/show-ops/invoices");
  redirect(`/dashboard/show-ops/invoices?${q.toString()}`);
}

/** Create or update an expense; the receipt photo is optional and stored next to the no-show proofs. */
export async function saveExpenseAction(formData: FormData): Promise<void> {
  const ctx = await requireShowOpsAction("finance", "invoices");
  const parsed = parseExpenseForm(formData, { currency: ctx.config.currency, taxRate: ctx.config.invoice.defaultVatRate });
  if (!parsed.ok) back({ error: parsed.error });
  const value = parsed.ok ? parsed.value : null;
  if (!value) return;
  const id = String(formData.get("id") ?? "").trim() || randomUUID();

  let receipt_path: string | undefined;
  const file = formData.get("receipt");
  if (file instanceof File && file.size > 0) {
    const ext = RECEIPT_TYPES[file.type];
    if (!ext) back({ error: "Receipt must be a photo (JPG, PNG, HEIC) or a PDF." });
    if (file.size > RECEIPT_MAX_BYTES) back({ error: "Receipt is larger than 12 MB." });
    const path = `${ctx.business.id}/expenses/${id}.${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());
    const { error } = await ctx.supabase.storage.from("show-ops-proofs").upload(path, buf, { contentType: file.type, upsert: true });
    if (error) back({ error: `Receipt upload failed: ${error.message}` });
    receipt_path = path;
  }

  const now = new Date().toISOString();
  const row = { ...value, business_id: ctx.business.id, updated_at: now, ...(receipt_path ? { receipt_path } : {}) };
  const existing = String(formData.get("id") ?? "").trim();
  const { error } = existing
    ? await ctx.supabase.from("show_expenses").update(row).eq("id", existing).eq("business_id", ctx.business.id)
    : await ctx.supabase.from("show_expenses").insert({ ...row, id, created_by: ctx.user.id });
  if (error) back({ error: error.message });
  back({ ok: existing ? "updated" : "saved" });
}

export async function deleteExpenseAction(formData: FormData): Promise<void> {
  const ctx = await requireShowOpsAction("finance", "invoices");
  const id = String(formData.get("id") ?? "").trim();
  const { data: row } = await ctx.supabase.from("show_expenses").select("id,holded_purchase_id").eq("id", id).eq("business_id", ctx.business.id).maybeSingle();
  if (!row) back({ error: "Expense not found." });
  if (row?.holded_purchase_id) back({ error: "This expense is already in Holded. Delete the purchase draft there first, then here." });
  const { error } = await ctx.supabase.from("show_expenses").delete().eq("id", id).eq("business_id", ctx.business.id);
  if (error) back({ error: error.message });
  back({ ok: "deleted" });
}

async function holdedClient(ctx: ShowOpsContext): Promise<HoldedClient> {
  const { data } = await ctx.supabase.from("show_ops_integrations").select("secret_ciphertext,status").eq("business_id", ctx.business.id).eq("provider", "holded").maybeSingle();
  if (!data || data.status !== "connected") throw new Error("Holded is not connected. Add the API token in Settings.");
  return new HoldedClient(decryptSecret(data.secret_ciphertext));
}

/** Expense → draft purchase in Holded. One-shot: already-sent expenses are left alone. */
export async function pushExpenseToHoldedAction(formData: FormData): Promise<void> {
  const ctx = await requireShowOpsAction("finance", "invoices");
  const id = String(formData.get("id") ?? "").trim();
  const { data: e } = await ctx.supabase.from("show_expenses").select("*").eq("id", id).eq("business_id", ctx.business.id).maybeSingle();
  if (!e) back({ error: "Expense not found." });
  if (!e) return;
  if (e.holded_purchase_id) back({ ok: "already" });

  const now = new Date().toISOString();
  try {
    const client = await holdedClient(ctx);
    const taxes = await client.listTaxes();
    const taxKey = pickHoldedPurchaseTaxKey(taxes, Number(e.tax_rate));
    if (!taxKey && Number(e.tax_rate) > 0) {
      throw new Error(`Holded has no purchase tax at ${e.tax_rate}%. Ask the accountant to add it (IGIC ${e.tax_rate}% on purchases).`);
    }
    let contactId: string | null = e.holded_contact_id;
    if (!contactId) {
      const found = (e.supplier_tax_id ? await client.findContactByCode(e.supplier_tax_id) : null) ?? (await client.findContactByName(e.supplier_name));
      contactId = found?.id ?? (await client.createContact({ name: e.supplier_name, code: e.supplier_tax_id, type: "supplier", tags: ["solvio"] })).id;
    }
    const created = await client.createPurchaseDraft(holdedPurchaseFromExpense(e, contactId, taxKey));
    await ctx.supabase
      .from("show_expenses")
      .update({ holded_contact_id: contactId, holded_purchase_id: created.id, holded_status: "draft", holded_pushed_at: now, holded_error: null, updated_at: now })
      .eq("id", id)
      .eq("business_id", ctx.business.id);
  } catch (err) {
    const message = holdedErrorMessage(err).slice(0, 400);
    await ctx.supabase.from("show_expenses").update({ holded_status: "error", holded_error: message, updated_at: now }).eq("id", id).eq("business_id", ctx.business.id);
    back({ error: message });
  }
  back({ ok: "sent" });
}
