"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireGlobalShowOpsAdmin, requireShowOpsRole, type ShowOpsContext } from "@/lib/show-ops/access";
import {
  HoldedClient,
  holdedContactFromSupplier,
  holdedErrorMessage,
  holdedInvoiceFromPack,
  pickHoldedTaxKey,
  type HoldedStatus,
} from "@/lib/show-ops/holded";
import { decryptSecret, encryptSecret, secretHint, secretsKeyConfigured } from "@/lib/show-ops/secrets";

function revalidate(invoiceId?: string) {
  revalidatePath("/dashboard/show-ops/settings");
  revalidatePath("/dashboard/show-ops/invoices");
  if (invoiceId) revalidatePath(`/dashboard/show-ops/invoices/${invoiceId}`);
}

async function loadHoldedClient(ctx: ShowOpsContext): Promise<HoldedClient> {
  const { data } = await ctx.supabase
    .from("show_ops_integrations")
    .select("secret_ciphertext,status")
    .eq("business_id", ctx.business.id)
    .eq("provider", "holded")
    .maybeSingle();
  if (!data) throw new Error("Holded is not connected. Add the API token in Settings.");
  if (data.status === "disabled") throw new Error("Holded is paused for this workspace. Re-enable it in Settings.");
  return new HoldedClient(decryptSecret(data.secret_ciphertext));
}

async function markIntegration(ctx: ShowOpsContext, patch: Record<string, unknown>) {
  await ctx.supabase
    .from("show_ops_integrations")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("business_id", ctx.business.id)
    .eq("provider", "holded");
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
    const taxes = await client.listTaxes();
    regime = taxes.some((t) => /igic/i.test(`${t.key} ${t.name}`)) ? "igic" : taxes.length ? "iva" : "unknown";
  } catch (err) {
    redirect("/dashboard/show-ops/settings?holded_error=" + encodeURIComponent(holdedErrorMessage(err)));
  }

  const now = new Date().toISOString();
  const { error } = await ctx.supabase.from("show_ops_integrations").upsert(
    {
      business_id: ctx.business.id,
      provider: "holded",
      secret_ciphertext: encryptSecret(token),
      status: "connected",
      meta: { hint: secretHint(token), regime },
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
    const client = await loadHoldedClient(ctx);
    const taxes = await client.listTaxes();
    const regime = taxes.some((t) => /igic/i.test(`${t.key} ${t.name}`)) ? "igic" : taxes.length ? "iva" : "unknown";
    const { data } = await ctx.supabase.from("show_ops_integrations").select("meta").eq("business_id", ctx.business.id).eq("provider", "holded").maybeSingle();
    await markIntegration(ctx, { status: "connected", last_checked_at: new Date().toISOString(), last_error: null, meta: { ...((data?.meta as object) ?? {}), regime } });
  } catch (err) {
    await markIntegration(ctx, { status: "error", last_checked_at: new Date().toISOString(), last_error: holdedErrorMessage(err) });
    revalidate();
    redirect("/dashboard/show-ops/settings?holded_error=" + encodeURIComponent(holdedErrorMessage(err)));
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
    await ctx.supabase.from("show_suppliers").update({ holded_contact_id: contact.id, updated_at: new Date().toISOString() }).eq("id", supplier.id).eq("business_id", ctx.business.id);
  }
  return contact.id;
}

/** Issued pack → draft sales invoice in Holded. Idempotent: a pack already pushed is refreshed, not duplicated. */
export async function pushInvoiceToHoldedAction(formData: FormData): Promise<void> {
  const ctx = await requireShowOpsRole("finance");
  const id = String(formData.get("invoice_id") ?? "").trim();
  const { data: inv } = await ctx.supabase.from("show_invoices").select("*").eq("id", id).eq("business_id", ctx.business.id).maybeSingle();
  if (!inv) throw new Error("Invoice not found.");
  if (inv.voided) throw new Error("Voided invoices are not sent to Holded.");
  if (inv.status !== "issued") throw new Error("Issue the invoice in Solvio first, then send it to Holded.");
  if (inv.holded_document_id) return refreshInvoiceFromHolded(ctx, inv.id, inv.holded_document_id);

  const { data: lines } = await ctx.supabase.from("show_invoice_lines").select("*").eq("invoice_id", inv.id).eq("business_id", ctx.business.id).order("guest_name");
  if (!lines?.length) throw new Error("This invoice has no lines.");

  const now = new Date().toISOString();
  try {
    const client = await loadHoldedClient(ctx);
    const taxes = await client.listTaxes();
    const contactId = await ensureHoldedContact(ctx, client, inv.supplier_id, inv.supplier_name, {
      name: inv.recipient_name,
      taxId: inv.recipient_tax_id,
      address: inv.recipient_address,
    });
    const payload = holdedInvoiceFromPack(inv, lines, contactId, (rate) => pickHoldedTaxKey(taxes, rate));
    const created = await client.createInvoice(payload);
    const summary = await client.getInvoice(created.id);
    await ctx.supabase
      .from("show_invoices")
      .update({
        holded_document_id: created.id,
        holded_doc_number: summary.docNumber,
        holded_status: summary.status satisfies HoldedStatus,
        holded_pushed_at: now,
        holded_synced_at: now,
        holded_error: null,
        updated_at: now,
      })
      .eq("id", inv.id)
      .eq("business_id", ctx.business.id);
  } catch (err) {
    const message = holdedErrorMessage(err);
    await ctx.supabase
      .from("show_invoices")
      .update({ holded_status: "error", holded_error: message, updated_at: now })
      .eq("id", inv.id)
      .eq("business_id", ctx.business.id);
    revalidate(inv.id);
    redirect(`/dashboard/show-ops/invoices/${inv.id}?holded=error`);
  }
  revalidate(inv.id);
  redirect(`/dashboard/show-ops/invoices/${inv.id}?holded=sent`);
}

async function refreshInvoiceFromHolded(ctx: ShowOpsContext, invoiceId: string, holdedId: string): Promise<void> {
  const now = new Date().toISOString();
  try {
    const client = await loadHoldedClient(ctx);
    const summary = await client.getInvoice(holdedId);
    const patch: Record<string, unknown> = {
      holded_doc_number: summary.docNumber,
      holded_status: summary.status,
      holded_synced_at: now,
      holded_error: null,
      updated_at: now,
    };
    // Holded is the ledger: a payment recorded there settles the pack in Solvio too.
    if (summary.status === "paid") {
      patch.paid = true;
      patch.paid_at = now.slice(0, 10);
    }
    // Once Holded has issued the legal number, that number is the invoice; the local one stays for internal reference.
    if (summary.docNumber) {
      patch.verifactu_number = summary.docNumber;
      patch.verifactu_status = "recorded";
      patch.verifactu_recorded_at = summary.approvedAt ?? now;
    }
    await ctx.supabase.from("show_invoices").update(patch).eq("id", invoiceId).eq("business_id", ctx.business.id);
  } catch (err) {
    await ctx.supabase
      .from("show_invoices")
      .update({ holded_status: "error", holded_error: holdedErrorMessage(err), updated_at: now })
      .eq("id", invoiceId)
      .eq("business_id", ctx.business.id);
    revalidate(invoiceId);
    redirect(`/dashboard/show-ops/invoices/${invoiceId}?holded=error`);
  }
  revalidate(invoiceId);
  redirect(`/dashboard/show-ops/invoices/${invoiceId}?holded=refreshed`);
}

export async function refreshHoldedInvoiceAction(formData: FormData): Promise<void> {
  const ctx = await requireShowOpsRole("finance");
  const id = String(formData.get("invoice_id") ?? "").trim();
  const { data: inv } = await ctx.supabase.from("show_invoices").select("id,holded_document_id").eq("id", id).eq("business_id", ctx.business.id).maybeSingle();
  if (!inv?.holded_document_id) throw new Error("This invoice has not been sent to Holded yet.");
  return refreshInvoiceFromHolded(ctx, inv.id, inv.holded_document_id);
}

/** Pulls status for every pack that is in Holded but not yet paid — the "sync with accounts" button. */
export async function syncHoldedInvoicesAction(): Promise<void> {
  const ctx = await requireShowOpsRole("finance");
  const { data: rows } = await ctx.supabase
    .from("show_invoices")
    .select("id,holded_document_id")
    .eq("business_id", ctx.business.id)
    .not("holded_document_id", "is", null)
    .neq("holded_status", "paid")
    .eq("voided", false)
    .limit(200);
  let updated = 0;
  let failed = 0;
  try {
    const client = await loadHoldedClient(ctx);
    for (const row of rows ?? []) {
      try {
        const summary = await client.getInvoice(row.holded_document_id as string);
        const now = new Date().toISOString();
        const patch: Record<string, unknown> = { holded_doc_number: summary.docNumber, holded_status: summary.status, holded_synced_at: now, holded_error: null, updated_at: now };
        if (summary.status === "paid") { patch.paid = true; patch.paid_at = now.slice(0, 10); }
        if (summary.docNumber) { patch.verifactu_number = summary.docNumber; patch.verifactu_status = "recorded"; patch.verifactu_recorded_at = summary.approvedAt ?? now; }
        await ctx.supabase.from("show_invoices").update(patch).eq("id", row.id).eq("business_id", ctx.business.id);
        updated += 1;
      } catch {
        failed += 1;
      }
    }
  } catch (err) {
    revalidate();
    redirect(`/dashboard/show-ops/invoices?view=list&holded_error=${encodeURIComponent(holdedErrorMessage(err))}`);
  }
  revalidate();
  redirect(`/dashboard/show-ops/invoices?view=list&holded_synced=${updated}&holded_failed=${failed}`);
}
