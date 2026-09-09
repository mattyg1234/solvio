"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireGlobalShowOpsAdmin, requireShowOpsAction, type ShowOpsContext } from "@/lib/show-ops/access";
import {
  HoldedClient,
  HoldedReconciliationRequiredError,
  HoldedWriteAmbiguousError,
  approvalForRate,
  approvalFromTax,
  holdedContactFromSupplier,
  holdedErrorMessage,
  holdedInvoiceFromPack,
  parseIgicApprovals,
  rateKey,
  holdedItemsFromLines,
  unixDay,
  type HoldedDocumentSummary,
  type HoldedIgicTaxApproval,
} from "@/lib/show-ops/holded";
import { decryptSecret, encryptSecret, secretHint, secretsKeyConfigured } from "@/lib/show-ops/secrets";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

/*
 * Holded is the legal issuer. Every write to an invoice's Holded lifecycle
 * columns goes through the database claim → external call → complete/sync
 * functions, so a crash between steps leaves a recoverable "unknown" state,
 * never a silent duplicate. Completion, resolution and sync run as the backend
 * (service role); claiming runs as the finance user.
 */

function revalidate(invoiceId?: string) {
  revalidatePath("/dashboard/show-ops/settings");
  revalidatePath("/dashboard/show-ops/invoices");
  if (invoiceId) revalidatePath(`/dashboard/show-ops/invoices/${invoiceId}`);
}

function safeMessage(err: unknown): string {
  return holdedErrorMessage(err).replace(/pat_[A-Za-z0-9_]+|[0-9a-f]{32}/g, "[redacted]").slice(0, 1000);
}

function operationReference(invoiceId: string): string {
  return `solvio-inv-${invoiceId}`;
}

async function loadIntegration(ctx: ShowOpsContext) {
  const { data } = await ctx.supabase
    .from("show_ops_integrations")
    .select("secret_ciphertext,status,meta")
    .eq("business_id", ctx.business.id)
    .eq("provider", "holded")
    .maybeSingle();
  if (!data) throw new Error("Holded is not connected. Add the API token in Settings.");
  if (data.status === "disabled") throw new Error("Holded is paused for this workspace. Re-enable it in Settings.");
  return {
    client: new HoldedClient(decryptSecret(data.secret_ciphertext)),
    meta: (data.meta ?? {}) as Record<string, unknown>,
    approvals: parseIgicApprovals(data.meta),
  };
}

async function markIntegration(ctx: ShowOpsContext, patch: Record<string, unknown>) {
  await ctx.supabase
    .from("show_ops_integrations")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("business_id", ctx.business.id)
    .eq("provider", "holded");
}

function regimeFromTaxes(taxes: Array<{ legalTreatment?: string }>): "igic" | "iva" | "unknown" {
  if (taxes.some((t) => t.legalTreatment === "igic")) return "igic";
  return taxes.length ? "iva" : "unknown";
}

/** Owner/admin pastes the Holded token; we prove it works before storing it encrypted. */
export async function connectHoldedAction(formData: FormData): Promise<void> {
  const ctx = await requireGlobalShowOpsAdmin();
  const token = String(formData.get("holded_token") ?? "").trim();
  if (!token) redirect("/dashboard/show-ops/settings?holded_error=" + encodeURIComponent("Paste the Holded API token first."));
  if (!secretsKeyConfigured()) {
    redirect("/dashboard/show-ops/settings?holded_error=" + encodeURIComponent("Server is missing SHOW_OPS_SECRETS_KEY. Add it to the environment before connecting Holded."));
  }

  let regime: "igic" | "iva" | "unknown" = "unknown";
  try {
    const client = new HoldedClient(token);
    await client.ping();
    regime = regimeFromTaxes(await client.listTaxes());
  } catch (err) {
    redirect("/dashboard/show-ops/settings?holded_error=" + encodeURIComponent(safeMessage(err)));
  }

  const now = new Date().toISOString();
  const { data: existing } = await ctx.supabase.from("show_ops_integrations").select("meta").eq("business_id", ctx.business.id).eq("provider", "holded").maybeSingle();
  const keptApprovals = parseIgicApprovals(existing?.meta);
  const { error } = await ctx.supabase.from("show_ops_integrations").upsert(
    {
      business_id: ctx.business.id,
      provider: "holded",
      secret_ciphertext: encryptSecret(token),
      status: "connected",
      meta: { hint: secretHint(token), regime, igic_taxes: keptApprovals },
      last_checked_at: now,
      last_error: null,
      created_by: ctx.user.id,
      updated_at: now,
    },
    { onConflict: "business_id,provider" },
  );
  if (error) redirect("/dashboard/show-ops/settings?holded_error=" + encodeURIComponent(error.message));
  revalidate();
  redirect("/dashboard/show-ops/settings?holded=connected");
}

export async function testHoldedAction(): Promise<void> {
  const ctx = await requireGlobalShowOpsAdmin();
  try {
    const { client, meta } = await loadIntegration(ctx);
    const regime = regimeFromTaxes(await client.listTaxes());
    await markIntegration(ctx, { status: "connected", last_checked_at: new Date().toISOString(), last_error: null, meta: { ...meta, regime } });
  } catch (err) {
    await markIntegration(ctx, { status: "error", last_checked_at: new Date().toISOString(), last_error: safeMessage(err) });
    revalidate();
    redirect("/dashboard/show-ops/settings?holded_error=" + encodeURIComponent(safeMessage(err)));
  }
  revalidate();
  redirect("/dashboard/show-ops/settings?holded=ok");
}

export async function disconnectHoldedAction(): Promise<void> {
  const ctx = await requireGlobalShowOpsAdmin();
  await ctx.supabase.from("show_ops_integrations").delete().eq("business_id", ctx.business.id).eq("provider", "holded");
  revalidate();
  redirect("/dashboard/show-ops/settings?holded=disconnected");
}

/** Settings: which Holded IGIC sales taxes Solvio may put on invoice lines, one per rate. */
export async function saveHoldedTaxApprovalsAction(formData: FormData): Promise<void> {
  const ctx = await requireGlobalShowOpsAdmin();
  const chosen = formData.getAll("approve_tax").map(String).filter(Boolean);
  try {
    const { client, meta } = await loadIntegration(ctx);
    const taxes = await client.listTaxes();
    const approvals: Record<string, HoldedIgicTaxApproval> = {};
    for (const id of chosen) {
      const tax = taxes.find((t) => t.id === id);
      const approval = tax ? approvalFromTax(tax) : null;
      if (!approval) throw new Error("One of the chosen taxes is not an IGIC sales tax in Holded any more. Refresh and choose again.");
      const key = rateKey(approval.rate);
      if (approvals[key]) throw new Error(`Choose only one Holded tax for ${key}%.`);
      approvals[key] = approval;
    }
    await markIntegration(ctx, { meta: { ...meta, igic_taxes: approvals } });
  } catch (err) {
    revalidate();
    redirect("/dashboard/show-ops/settings?holded_error=" + encodeURIComponent(safeMessage(err)));
  }
  revalidate();
  redirect("/dashboard/show-ops/settings?holded=taxes_saved");
}

async function ensureHoldedContact(
  ctx: ShowOpsContext,
  client: HoldedClient,
  supplierId: string | null,
  fallbackName: string,
  recipient: { name?: string | null; taxId?: string | null; address?: string | null },
): Promise<string> {
  let supplier: {
    id: string; name: string; legal_name: string | null; tax_id: string | null; email: string | null; invoice_address: string | null; island: string | null; holded_contact_id: string | null;
  } | null = null;
  if (supplierId) {
    const { data } = await ctx.supabase
      .from("show_suppliers")
      .select("id,name,legal_name,tax_id,email,invoice_address,island,holded_contact_id")
      .eq("id", supplierId)
      .eq("business_id", ctx.business.id)
      .maybeSingle();
    supplier = data ?? null;
  }
  if (supplier?.holded_contact_id) return supplier.holded_contact_id;

  const input = holdedContactFromSupplier({
    name: recipient.name || supplier?.name || fallbackName,
    legal_name: recipient.name || supplier?.legal_name,
    tax_id: recipient.taxId || supplier?.tax_id,
    email: supplier?.email,
    invoice_address: recipient.address || supplier?.invoice_address,
    island: supplier?.island,
  });
  const existing = input.code ? await client.findContactByCode(input.code) : null;
  const contact = existing ?? (await client.createContact(input));
  if (supplier) {
    // Catalogue writes are admin-only under RLS; remembering the Holded id is a backend concern, scoped to this business.
    const admin = createSupabaseServiceRoleClient();
    await admin.from("show_suppliers").update({ holded_contact_id: contact.id, updated_at: new Date().toISOString() }).eq("id", supplier.id).eq("business_id", ctx.business.id);
  }
  return contact.id;
}

type ClaimRow = { claim_status: string; external_id: string | null; claim_token: string | null };

async function completeClaim(
  businessId: string,
  invoiceId: string,
  claimToken: string,
  outcome: "created" | "failed" | "unknown",
  summary: HoldedDocumentSummary | null,
  message: string | null,
) {
  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin.rpc("show_ops_holded_complete_invoice", {
    p_business_id: businessId,
    p_invoice_id: invoiceId,
    p_claim_token: claimToken,
    p_outcome: outcome,
    p_external_id: summary?.id ?? null,
    p_external_status: summary?.status ?? null,
    p_actual_net: summary?.net ?? null,
    p_actual_tax: summary?.tax ?? null,
    p_actual_total: summary?.total ?? null,
    p_safe_message: message,
  });
  if (error) throw new Error(`Holded step finished but Solvio could not record it: ${error.message}`);
}

async function syncFromSummary(businessId: string, invoiceId: string, summary: HoldedDocumentSummary) {
  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin.rpc("show_ops_holded_sync_invoice", {
    p_business_id: businessId,
    p_invoice_id: invoiceId,
    p_external_id: summary.id,
    p_doc_number: summary.docNumber,
    p_external_status: summary.status,
    p_actual_net: summary.net,
    p_actual_tax: summary.tax,
    p_actual_total: summary.total,
    p_approved_at: summary.approvedAt,
    p_paid: summary.status === "paid",
  });
  if (error) throw new Error(error.message);
}

/** Issued pack → draft sales invoice in Holded, through the claim/complete lifecycle. */
export async function pushInvoiceToHoldedAction(formData: FormData): Promise<void> {
  const ctx = await requireShowOpsAction("finance", "invoices");
  const id = String(formData.get("invoice_id") ?? "").trim();
  const { data: inv } = await ctx.supabase.from("show_invoices").select("*").eq("id", id).eq("business_id", ctx.business.id).maybeSingle();
  if (!inv) throw new Error("Invoice not found.");
  if (inv.voided) throw new Error("Voided invoices are not sent to Holded.");
  if (inv.status !== "issued") throw new Error("Issue the invoice in Solvio first, then send it to Holded.");
  if (inv.holded_document_id) return refreshInvoiceFromHolded(ctx, inv.id, inv.holded_document_id);

  const { data: lines } = await ctx.supabase.from("show_invoice_lines").select("*").eq("invoice_id", inv.id).eq("business_id", ctx.business.id).order("guest_name");
  if (!lines?.length) throw new Error("This invoice has no lines.");

  // 1. Everything that can fail without touching Holded happens before the claim.
  let prepared: { client: HoldedClient; payload: ReturnType<typeof holdedInvoiceFromPack> };
  try {
    const { client, approvals } = await loadIntegration(ctx);
    const taxes = await client.listTaxes();
    const contactId = await ensureHoldedContact(ctx, client, inv.supplier_id, inv.supplier_name, {
      name: inv.recipient_name,
      taxId: inv.recipient_tax_id,
      address: inv.recipient_address,
    });
    const payload = holdedInvoiceFromPack(inv, lines, contactId, (rate) => approvalForRate(approvals, rate), taxes);
    prepared = { client, payload };
  } catch (err) {
    revalidate(inv.id);
    redirect(`/dashboard/show-ops/invoices/${inv.id}?holded=error&holded_msg=${encodeURIComponent(safeMessage(err))}`);
  }

  // 2. Claim: the database marks the pack "creating" and freezes the expected totals.
  const claimToken = randomUUID();
  const { data: claimRows, error: claimError } = await ctx.supabase.rpc("show_ops_holded_claim_invoice", {
    p_business_id: ctx.business.id,
    p_invoice_id: inv.id,
    p_claim_token: claimToken,
  });
  if (claimError) {
    revalidate(inv.id);
    redirect(`/dashboard/show-ops/invoices/${inv.id}?holded=error&holded_msg=${encodeURIComponent(claimMessage(claimError.message))}`);
  }
  const claim = (Array.isArray(claimRows) ? claimRows[0] : claimRows) as ClaimRow | undefined;
  if (!claim || claim.claim_status !== "claimed") {
    revalidate(inv.id);
    redirect(`/dashboard/show-ops/invoices/${inv.id}?holded=${claim?.claim_status === "existing" ? "refreshed" : "reconcile"}`);
  }

  // 3. External write, then record the outcome — created, failed, or unknown.
  let outcome: "sent" | "error" | "reconcile" = "sent";
  let message: string | null = null;
  try {
    const summary = await prepared.client.createInvoiceDraft(prepared.payload, { reference: operationReference(inv.id) });
    await completeClaim(ctx.business.id, inv.id, claimToken, "created", summary, null);
  } catch (err) {
    if (err instanceof HoldedWriteAmbiguousError || err instanceof HoldedReconciliationRequiredError) {
      outcome = "reconcile";
      message = safeMessage(err);
      await completeClaim(ctx.business.id, inv.id, claimToken, "unknown", null, message);
    } else {
      outcome = "error";
      message = safeMessage(err);
      await completeClaim(ctx.business.id, inv.id, claimToken, "failed", null, message);
    }
  }
  revalidate(inv.id);
  redirect(`/dashboard/show-ops/invoices/${inv.id}?holded=${outcome}${message ? `&holded_msg=${encodeURIComponent(message)}` : ""}`);
}

function claimMessage(raw: string): string {
  if (raw.includes("RECONCILIATION_REQUIRED")) return "This pack needs reconciling with Holded before it can be sent again.";
  if (raw.includes("CLAIM_ACTIVE")) return "Another send to Holded is in progress for this pack. Wait a minute and refresh.";
  if (raw.includes("STATE_INVALID")) return "This pack is not in a state that can be sent (it must be issued and not already in Holded).";
  if (raw.includes("NOT_ALLOWED")) return "Your login is not allowed to send invoices to Holded.";
  return raw;
}

async function refreshInvoiceFromHolded(ctx: ShowOpsContext, invoiceId: string, holdedId: string): Promise<void> {
  let message: string | null = null;
  try {
    const { client } = await loadIntegration(ctx);
    const summary = await client.getInvoice(holdedId);
    await syncFromSummary(ctx.business.id, invoiceId, summary);
  } catch (err) {
    message = safeMessage(err);
  }
  revalidate(invoiceId);
  redirect(`/dashboard/show-ops/invoices/${invoiceId}?holded=${message ? "error" : "refreshed"}${message ? `&holded_msg=${encodeURIComponent(message)}` : ""}`);
}

export async function refreshHoldedInvoiceAction(formData: FormData): Promise<void> {
  const ctx = await requireShowOpsAction("finance", "invoices");
  const id = String(formData.get("invoice_id") ?? "").trim();
  const { data: inv } = await ctx.supabase.from("show_invoices").select("id,holded_document_id").eq("id", id).eq("business_id", ctx.business.id).maybeSingle();
  if (!inv?.holded_document_id) throw new Error("This invoice has not been sent to Holded yet.");
  return refreshInvoiceFromHolded(ctx, inv.id, inv.holded_document_id);
}

/**
 * Recover a pack whose last Holded write was not confirmed: look the operation
 * up in Holded by its immutable reference, then record found / not found.
 */
export async function reconcileHoldedInvoiceAction(formData: FormData): Promise<void> {
  const ctx = await requireShowOpsAction("finance", "invoices");
  const id = String(formData.get("invoice_id") ?? "").trim();
  const { data: inv } = await ctx.supabase
    .from("show_invoices")
    .select("id,holded_document_id,holded_status,holded_reconciliation_status,holded_claim_token,holded_claimed_at")
    .eq("id", id)
    .eq("business_id", ctx.business.id)
    .maybeSingle();
  if (!inv) throw new Error("Invoice not found.");

  let message: string | null = null;
  let result: "refreshed" | "reconcile" | "error" | "not_found" = "refreshed";
  try {
    const { client } = await loadIntegration(ctx);
    if (inv.holded_document_id) {
      // Document known: a mismatch or stale flag — re-read it and let the sync settle the state.
      const summary = await client.getInvoice(inv.holded_document_id);
      await syncFromSummary(ctx.business.id, inv.id, summary);
    } else {
      if (inv.holded_reconciliation_status !== "required") {
        // A stalled claim (status still "creating") first has to be marked for reconciliation by the finance user.
        const { error } = await ctx.supabase.rpc("show_ops_holded_request_reconciliation", {
          p_business_id: ctx.business.id,
          p_invoice_id: inv.id,
          p_reason: "Send to Holded did not complete",
        });
        if (error) throw new Error(claimMessage(error.message));
      }
      const found = await client.reconcileInvoiceDraft({ reference: operationReference(inv.id) });
      const admin = createSupabaseServiceRoleClient();
      const { error } = await admin.rpc("show_ops_holded_resolve_invoice", {
        p_business_id: ctx.business.id,
        p_invoice_id: inv.id,
        p_external_id: found ? found.id : null,
        p_resolution: found ? "found" : "confirmed_not_found",
      });
      if (error) throw new Error(error.message);
      if (found) await syncFromSummary(ctx.business.id, inv.id, found);
      else result = "not_found";
    }
  } catch (err) {
    result = "error";
    message = safeMessage(err);
  }
  revalidate(inv.id);
  redirect(`/dashboard/show-ops/invoices/${inv.id}?holded=${result}${message ? `&holded_msg=${encodeURIComponent(message)}` : ""}`);
}

/** Pulls status for every pack that is in Holded but not yet paid — the "sync with accounts" button. */
export async function syncHoldedInvoicesAction(): Promise<void> {
  const ctx = await requireShowOpsAction("finance", "invoices");
  const { data: rows } = await ctx.supabase
    .from("show_invoices")
    .select("id,holded_document_id,holded_claim_token")
    .eq("business_id", ctx.business.id)
    .not("holded_document_id", "is", null)
    .is("holded_claim_token", null)
    .neq("holded_status", "paid")
    .eq("voided", false)
    .limit(200);
  let updated = 0;
  let failed = 0;
  try {
    const { client } = await loadIntegration(ctx);
    for (const row of rows ?? []) {
      try {
        const summary = await client.getInvoice(row.holded_document_id as string);
        await syncFromSummary(ctx.business.id, row.id, summary);
        updated += 1;
      } catch {
        failed += 1;
      }
    }
  } catch (err) {
    revalidate();
    redirect(`/dashboard/show-ops/invoices?view=list&holded_error=${encodeURIComponent(safeMessage(err))}`);
  }
  revalidate();
  redirect(`/dashboard/show-ops/invoices?view=list&holded_synced=${updated}&holded_failed=${failed}`);
}

function creditReference(invoiceId: string, claimToken: string): string {
  return `solvio-cn-${invoiceId}-${claimToken.replace(/-/g, "").slice(0, 12)}`;
}

async function completeCreditClaim(
  businessId: string,
  invoiceId: string,
  claimToken: string,
  outcome: "created" | "failed" | "unknown",
  summary: HoldedDocumentSummary | null,
  amount: number | null,
  message: string | null,
) {
  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin.rpc("show_ops_holded_complete_credit_note", {
    p_business_id: businessId,
    p_invoice_id: invoiceId,
    p_claim_token: claimToken,
    p_outcome: outcome,
    p_external_id: summary?.id ?? null,
    p_external_status: summary ? (summary.status === "draft" ? "draft" : "approved") : null,
    p_actual_amount: amount,
    p_safe_message: message,
  });
  if (error) throw new Error(`Holded step finished but Solvio could not record it: ${error.message}`);
}

/**
 * Correction after approval: a draft credit note in Holded for part or all of an
 * issued pack. Amount is the NET amount to credit; Holded adds the same IGIC as
 * the pack lines. The accountant links and approves it in Holded.
 */
export async function requestHoldedCreditNoteAction(formData: FormData): Promise<void> {
  const ctx = await requireShowOpsAction("finance", "invoices");
  const id = String(formData.get("invoice_id") ?? "").trim();
  const amount = Math.round(Number(formData.get("credit_amount")) * 100) / 100;
  const reason = String(formData.get("credit_reason") ?? "").trim().slice(0, 1000);
  const fail = (msg: string) => {
    revalidate(id);
    redirect(`/dashboard/show-ops/invoices/${id}?holded=error&holded_msg=${encodeURIComponent(msg)}`);
  };
  if (!Number.isFinite(amount) || amount <= 0) fail("Enter the net amount to credit.");
  if (!reason) fail("Give the reason for the credit note — it goes on the document.");

  const { data: inv } = await ctx.supabase.from("show_invoices").select("*").eq("id", id).eq("business_id", ctx.business.id).maybeSingle();
  if (!inv) throw new Error("Invoice not found.");
  if (!inv.holded_document_id || !["approved", "paid", "corrected"].includes(String(inv.holded_status))) {
    fail("Credit notes are for packs Holded has already issued. Before approval, fix the draft in Holded instead.");
  }

  const { data: lines } = await ctx.supabase.from("show_invoice_lines").select("vat_rate").eq("invoice_id", inv.id).eq("business_id", ctx.business.id);
  const rates = [...new Set((lines ?? []).map((l) => Math.round(Number(l.vat_rate || 0) * 100) / 100))];
  if (rates.length !== 1) fail("This pack mixes tax rates; raise the credit note directly in Holded.");
  const rate = rates[0];

  let prepared: { client: HoldedClient; contactId: string; items: ReturnType<typeof holdedItemsFromLines> };
  try {
    const { client, approvals } = await loadIntegration(ctx);
    const taxes = await client.listTaxes();
    const contactId = await ensureHoldedContact(ctx, client, inv.supplier_id, inv.supplier_name, {
      name: inv.recipient_name, taxId: inv.recipient_tax_id, address: inv.recipient_address,
    });
    const items = holdedItemsFromLines(
      [{ description: `Credit against ${inv.holded_doc_number || inv.invoice_number} — ${reason}`, quantity: 1, unit_price: amount, vat_rate: rate }],
      (r) => approvalForRate(approvals, r),
      taxes,
    );
    prepared = { client, contactId, items };
  } catch (err) {
    fail(safeMessage(err));
    return;
  }

  const claimToken = randomUUID();
  const { data: claimRows, error: claimError } = await ctx.supabase.rpc("show_ops_holded_claim_credit_note", {
    p_business_id: ctx.business.id, p_invoice_id: inv.id, p_claim_token: claimToken, p_amount: amount, p_reason: reason,
  });
  if (claimError) fail(claimMessage(claimError.message));
  const claim = (Array.isArray(claimRows) ? claimRows[0] : claimRows) as ClaimRow | undefined;
  if (!claim || claim.claim_status !== "claimed") {
    revalidate(inv.id);
    redirect(`/dashboard/show-ops/invoices/${inv.id}?holded=${claim?.claim_status === "existing" ? "refreshed" : "reconcile"}`);
  }

  let outcome: "credit_sent" | "error" | "reconcile" = "credit_sent";
  let message: string | null = null;
  try {
    const summary = await prepared.client.createCreditNoteDraft(
      {
        contactId: prepared.contactId,
        desc: `Credit note · ${inv.supplier_name} · ${inv.holded_doc_number || inv.invoice_number}`,
        date: unixDay(new Date().toISOString().slice(0, 10)),
        items: prepared.items,
        notes: `Credit against Holded invoice ${inv.holded_doc_number || "(draft)"} / Solvio ${inv.invoice_number}. ${reason}`,
        tags: ["solvio"],
        approveDoc: false,
        ...(inv.currency && inv.currency !== "eur" ? { currency: String(inv.currency) } : {}),
      },
      { reference: creditReference(inv.id, claimToken) },
    );
    // The DB checks the credited amount against what was claimed; net is what Solvio controls.
    if (Math.round(summary.net * 100) !== Math.round(amount * 100)) {
      message = `Holded built the credit note with net ${summary.net.toFixed(2)} instead of ${amount.toFixed(2)}. Check it in Holded.`;
      outcome = "reconcile";
      await completeCreditClaim(ctx.business.id, inv.id, claimToken, "unknown", null, null, message);
    } else {
      await completeCreditClaim(ctx.business.id, inv.id, claimToken, "created", summary, amount, null);
    }
  } catch (err) {
    if (err instanceof HoldedWriteAmbiguousError || err instanceof HoldedReconciliationRequiredError) {
      outcome = "reconcile";
      message = safeMessage(err);
      await completeCreditClaim(ctx.business.id, inv.id, claimToken, "unknown", null, null, message);
    } else {
      outcome = "error";
      message = safeMessage(err);
      await completeCreditClaim(ctx.business.id, inv.id, claimToken, "failed", null, null, message);
    }
  }
  revalidate(inv.id);
  redirect(`/dashboard/show-ops/invoices/${inv.id}?holded=${outcome}${message ? `&holded_msg=${encodeURIComponent(message)}` : ""}`);
}

/** Recover a credit note whose write was not confirmed: find it by reference in Holded, or confirm it never landed. */
export async function reconcileHoldedCreditNoteAction(formData: FormData): Promise<void> {
  const ctx = await requireShowOpsAction("finance", "invoices");
  const id = String(formData.get("invoice_id") ?? "").trim();
  const { data: inv } = await ctx.supabase
    .from("show_invoices")
    .select("id,holded_credit_claim_token,holded_credit_status,holded_reconciliation_status")
    .eq("id", id)
    .eq("business_id", ctx.business.id)
    .maybeSingle();
  if (!inv?.holded_credit_claim_token) throw new Error("No credit note is waiting to be reconciled.");
  let message: string | null = null;
  let result: "refreshed" | "not_found" | "error" = "refreshed";
  try {
    const { client } = await loadIntegration(ctx);
    if (inv.holded_reconciliation_status !== "required") {
      const { error } = await ctx.supabase.rpc("show_ops_holded_request_reconciliation", {
        p_business_id: ctx.business.id, p_invoice_id: inv.id, p_reason: "Credit note request did not complete",
      });
      if (error) throw new Error(claimMessage(error.message));
    }
    const found = await client.reconcileCreditNoteDraft({ reference: creditReference(inv.id, inv.holded_credit_claim_token) });
    const admin = createSupabaseServiceRoleClient();
    const { error } = await admin.rpc("show_ops_holded_resolve_credit_note", {
      p_business_id: ctx.business.id, p_invoice_id: inv.id,
      p_external_id: found ? found.id : null, p_resolution: found ? "found" : "confirmed_not_found",
    });
    if (error) throw new Error(error.message);
    if (!found) result = "not_found";
  } catch (err) {
    result = "error";
    message = safeMessage(err);
  }
  revalidate(inv.id);
  redirect(`/dashboard/show-ops/invoices/${inv.id}?holded=${result}${message ? `&holded_msg=${encodeURIComponent(message)}` : ""}`);
}
