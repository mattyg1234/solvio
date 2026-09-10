"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireShowOpsAction, type ShowOpsContext } from "@/lib/show-ops/access";
import { HoldedClient, holdedErrorMessage, unixDay } from "@/lib/show-ops/holded";
import {
  classifyHoldedCreateFailure,
  expenseClaimIsStale,
  findPurchaseForExpense,
  holdedPurchaseFromExpense,
  parseExpenseForm,
  pickHoldedPurchaseTaxKey,
  type ExpenseInput,
} from "@/lib/show-ops/expenses";
import { decryptSecret } from "@/lib/show-ops/secrets";

/*
 * Expense → Holded draft purchase, with a claim lock so a double click, two
 * staff at once, or a failure after Holded created the purchase can never leave
 * a duplicate in Holded or a purchase Solvio does not know about.
 *
 *   not_sent / error ──claim──▶ creating ──created + recorded──▶ draft
 *                                        ──Holded rejected (4xx)──▶ error     (claim released)
 *                                        ──outcome not confirmed──▶ unknown   (claim kept; Reconcile)
 *   unknown / stale creating ──Reconcile──▶ draft (found) | not_sent (nothing in Holded)
 *
 * The claim is one conditional UPDATE; the completing UPDATE is guarded by the
 * claim token. No private-schema functions: the expense side stays simple.
 */

const RECEIPT_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
};
const RECEIPT_MAX_BYTES = 12 * 1024 * 1024;

const IN_HOLDED_MESSAGE = "This expense is already in Holded. Change the amounts there, or delete the draft there first.";
const IN_FLIGHT_MESSAGE = "Another send to Holded is in progress for this expense. Wait a minute and refresh.";
const RECONCILE_MESSAGE = "The last send to Holded was not confirmed. Use Reconcile before sending again.";
const UNCONFIRMED_MESSAGE = "Holded did not confirm whether the purchase was created. Use Reconcile before sending again.";

function back(msg: { ok?: string; error?: string }): never {
  const q = new URLSearchParams({ view: "expenses" });
  if (msg.ok) q.set("expense", msg.ok);
  if (msg.error) q.set("expense_error", msg.error.slice(0, 300));
  revalidatePath("/dashboard/show-ops/invoices");
  redirect(`/dashboard/show-ops/invoices?${q.toString()}`);
}

/** Error text that is safe to store and show: no token-shaped strings, bounded length. */
function safeMessage(err: unknown): string {
  return holdedErrorMessage(err).replace(/pat_[A-Za-z0-9_]+|[0-9a-f]{32}/g, "[redacted]").slice(0, 400);
}

/** Once a purchase exists (or may exist) in Holded, the money on the Solvio row is frozen. */
function expenseLockedByHolded(row: { holded_purchase_id: string | null; holded_status: string }): boolean {
  return Boolean(row.holded_purchase_id) || row.holded_status === "creating" || row.holded_status === "unknown";
}

type MoneyFields = Pick<ExpenseInput, "net_amount" | "tax_rate" | "tax_amount" | "total_amount" | "currency" | "expense_date" | "supplier_name" | "supplier_tax_id">;

function moneyFieldsChanged(row: Record<string, unknown>, value: MoneyFields): boolean {
  const n = (v: unknown) => Math.round(Number(v) * 100) / 100;
  return (
    n(row.net_amount) !== n(value.net_amount) ||
    n(row.tax_rate) !== n(value.tax_rate) ||
    n(row.tax_amount) !== n(value.tax_amount) ||
    n(row.total_amount) !== n(value.total_amount) ||
    String(row.currency ?? "") !== value.currency ||
    String(row.expense_date ?? "") !== value.expense_date ||
    String(row.supplier_name ?? "") !== value.supplier_name ||
    (row.supplier_tax_id ?? null) !== (value.supplier_tax_id ?? null)
  );
}

/** Create or update an expense; the receipt photo is optional and stored next to the no-show proofs. */
export async function saveExpenseAction(formData: FormData): Promise<void> {
  const ctx = await requireShowOpsAction("finance", "invoices");
  const parsed = parseExpenseForm(formData, { currency: ctx.config.currency, taxRate: ctx.config.invoice.defaultVatRate });
  if (!parsed.ok) back({ error: parsed.error });
  const value = parsed.value;
  const existing = String(formData.get("id") ?? "").trim();
  const id = existing || randomUUID();

  // An expense that is (or may be) in Holded keeps its money fields; only the descriptive fields may change here.
  let update: Record<string, unknown> = { ...value };
  if (existing) {
    const { data: row } = await ctx.supabase.from("show_expenses").select("*").eq("id", existing).eq("business_id", ctx.business.id).maybeSingle();
    if (!row) back({ error: "Expense not found." });
    if (expenseLockedByHolded(row)) {
      if (moneyFieldsChanged(row, value)) back({ error: IN_HOLDED_MESSAGE });
      update = { description: value.description, category: value.category, island: value.island, product_id: value.product_id, notes: value.notes };
    }
  }

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
  const row = { ...update, business_id: ctx.business.id, updated_at: now, ...(receipt_path ? { receipt_path } : {}) };
  const { error } = existing
    ? await ctx.supabase.from("show_expenses").update(row).eq("id", existing).eq("business_id", ctx.business.id)
    : await ctx.supabase.from("show_expenses").insert({ ...row, id, created_by: ctx.user.id });
  if (error) back({ error: error.message });
  back({ ok: existing ? "updated" : "saved" });
}

export async function deleteExpenseAction(formData: FormData): Promise<void> {
  const ctx = await requireShowOpsAction("finance", "invoices");
  const id = String(formData.get("id") ?? "").trim();
  const { data: row } = await ctx.supabase.from("show_expenses").select("id,holded_purchase_id,holded_status").eq("id", id).eq("business_id", ctx.business.id).maybeSingle();
  if (!row) back({ error: "Expense not found." });
  if (row.holded_purchase_id) back({ error: "This expense is already in Holded. Delete the purchase draft there first, then here." });
  if (row.holded_status === "creating") back({ error: IN_FLIGHT_MESSAGE });
  if (row.holded_status === "unknown") back({ error: "Holded may hold a purchase for this expense. Use Reconcile before deleting it." });
  const { error } = await ctx.supabase.from("show_expenses").delete().eq("id", id).eq("business_id", ctx.business.id);
  if (error) back({ error: error.message });
  back({ ok: "deleted" });
}

async function holdedClient(ctx: ShowOpsContext): Promise<HoldedClient> {
  const { data } = await ctx.supabase.from("show_ops_integrations").select("secret_ciphertext,status").eq("business_id", ctx.business.id).eq("provider", "holded").maybeSingle();
  if (!data || data.status !== "connected") throw new Error("Holded is not connected. Add the API token in Settings.");
  return new HoldedClient(decryptSecret(data.secret_ciphertext));
}

/** Give the claim back: the send failed before (or without) Holded creating anything. */
async function releaseClaim(ctx: ShowOpsContext, id: string, token: string, patch: { holded_status: "error" | "not_sent"; holded_error: string | null }) {
  const now = new Date().toISOString();
  await ctx.supabase
    .from("show_expenses")
    .update({ ...patch, holded_claim_token: null, holded_claimed_at: null, updated_at: now })
    .eq("id", id)
    .eq("business_id", ctx.business.id)
    .eq("holded_claim_token", token);
}

/** Holded may hold a purchase we cannot see: keep the token, block sends until Reconcile settles it. */
async function markUnknown(ctx: ShowOpsContext, id: string, token: string, message: string) {
  const now = new Date().toISOString();
  await ctx.supabase
    .from("show_expenses")
    .update({ holded_status: "unknown", holded_error: message.slice(0, 400), updated_at: now })
    .eq("id", id)
    .eq("business_id", ctx.business.id)
    .eq("holded_claim_token", token);
}

/** Expense → draft purchase in Holded, through the claim → create → complete lifecycle. */
export async function pushExpenseToHoldedAction(formData: FormData): Promise<void> {
  const ctx = await requireShowOpsAction("finance", "invoices");
  const id = String(formData.get("id") ?? "").trim();
  const { data: e } = await ctx.supabase.from("show_expenses").select("*").eq("id", id).eq("business_id", ctx.business.id).maybeSingle();
  if (!e) back({ error: "Expense not found." });
  if (e.holded_purchase_id) back({ ok: "already" });

  // 1. Claim: one conditional UPDATE; zero rows means somebody else holds it or it needs reconciling.
  const token = randomUUID();
  const claimedAt = new Date().toISOString();
  const { data: claimed, error: claimError } = await ctx.supabase
    .from("show_expenses")
    .update({ holded_status: "creating", holded_claim_token: token, holded_claimed_at: claimedAt, holded_error: null, updated_at: claimedAt })
    .eq("id", id)
    .eq("business_id", ctx.business.id)
    .is("holded_purchase_id", null)
    .is("holded_claim_token", null)
    .in("holded_status", ["not_sent", "error"])
    .select("id");
  if (claimError) back({ error: claimError.message });
  if (!claimed?.length) {
    const { data: fresh } = await ctx.supabase.from("show_expenses").select("holded_purchase_id,holded_status,holded_claimed_at").eq("id", id).eq("business_id", ctx.business.id).maybeSingle();
    if (fresh?.holded_purchase_id) back({ ok: "already" });
    if (fresh?.holded_status === "creating" && !expenseClaimIsStale(fresh.holded_claimed_at)) back({ error: IN_FLIGHT_MESSAGE });
    back({ error: RECONCILE_MESSAGE });
  }

  // 2. Everything that can fail without touching Holded's documents. A throw here releases the claim.
  let prepared: { client: HoldedClient; contactId: string; payload: ReturnType<typeof holdedPurchaseFromExpense> };
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
    prepared = { client, contactId, payload: holdedPurchaseFromExpense(e, contactId, taxKey) };
  } catch (err) {
    const message = safeMessage(err);
    await releaseClaim(ctx, id, token, { holded_status: "error", holded_error: message });
    back({ error: message });
  }

  // 3. The one call that creates something in Holded.
  let created: { id: string };
  try {
    created = await prepared.client.createPurchaseDraft(prepared.payload);
  } catch (err) {
    if (classifyHoldedCreateFailure(err) === "error") {
      // Holded answered and refused: nothing was created, safe to send again.
      const message = safeMessage(err);
      await releaseClaim(ctx, id, token, { holded_status: "error", holded_error: message });
      back({ error: message });
    }
    await markUnknown(ctx, id, token, `${UNCONFIRMED_MESSAGE} (${safeMessage(err)})`);
    back({ error: UNCONFIRMED_MESSAGE });
  }

  // 4. Complete the claim. If Solvio cannot record it, Holded now holds a purchase we do not know about: unknown.
  const now = new Date().toISOString();
  const { data: done, error: doneError } = await ctx.supabase
    .from("show_expenses")
    .update({
      holded_contact_id: prepared.contactId,
      holded_purchase_id: created.id,
      holded_status: "draft",
      holded_pushed_at: now,
      holded_error: null,
      holded_claim_token: null,
      updated_at: now,
    })
    .eq("id", id)
    .eq("business_id", ctx.business.id)
    .eq("holded_claim_token", token)
    .select("id");
  if (doneError || !done?.length) {
    const reason = doneError ? doneError.message.slice(0, 200) : "the claim was no longer held";
    const message = `Holded created purchase ${created.id} but Solvio could not record it (${reason}). Use Reconcile.`;
    await ctx.supabase
      .from("show_expenses")
      .update({ holded_status: "unknown", holded_error: message.slice(0, 400), updated_at: now })
      .eq("id", id)
      .eq("business_id", ctx.business.id)
      .is("holded_purchase_id", null);
    back({ error: message });
  }
  back({ ok: "sent" });
}

/**
 * Recover an expense whose last send was not confirmed (unknown, or a stalled
 * claim): look for the draft in Holded by the "Solvio expense <id>" marker in
 * its notes, then adopt it or release the claim.
 */
export async function reconcileExpenseHoldedAction(formData: FormData): Promise<void> {
  const ctx = await requireShowOpsAction("finance", "invoices");
  const id = String(formData.get("id") ?? "").trim();
  const { data: e } = await ctx.supabase
    .from("show_expenses")
    .select("id,expense_date,holded_purchase_id,holded_status,holded_claim_token,holded_claimed_at")
    .eq("id", id)
    .eq("business_id", ctx.business.id)
    .maybeSingle();
  if (!e) back({ error: "Expense not found." });
  if (e.holded_purchase_id) back({ ok: "already" });
  const stalled = e.holded_status === "creating" && expenseClaimIsStale(e.holded_claimed_at);
  if (e.holded_status !== "unknown" && !stalled) back({ error: "Nothing to reconcile: this expense is not waiting on Holded." });

  let found: { id: string } | null = null;
  try {
    const client = await holdedClient(ctx);
    const day = unixDay(e.expense_date);
    const list = await client.listPurchases(day - 2 * 86400, day + 2 * 86400);
    found = findPurchaseForExpense(list, e.id);
  } catch (err) {
    back({ error: safeMessage(err) });
  }

  const now = new Date().toISOString();
  if (found) {
    const { error } = await ctx.supabase
      .from("show_expenses")
      .update({ holded_purchase_id: found.id, holded_status: "draft", holded_pushed_at: now, holded_error: null, holded_claim_token: null, holded_claimed_at: null, updated_at: now })
      .eq("id", id)
      .eq("business_id", ctx.business.id)
      .is("holded_purchase_id", null);
    if (error) back({ error: error.message });
    back({ ok: "reconciled_found" });
  }
  const { error } = await ctx.supabase
    .from("show_expenses")
    .update({ holded_status: "not_sent", holded_error: "No purchase found in Holded for this expense; safe to send again.", holded_claim_token: null, holded_claimed_at: null, updated_at: now })
    .eq("id", id)
    .eq("business_id", ctx.business.id)
    .is("holded_purchase_id", null);
  if (error) back({ error: error.message });
  back({ ok: "reconciled_missing" });
}
