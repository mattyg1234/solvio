/**
 * Partner ↔ Holded contact, one partner at a time. Holded issues the legal invoice,
 * so its contact must carry the same name, NIF and address as the Hub's partner.
 * "Send" makes Holded match the Hub; "update from Holded" makes the Hub match Holded.
 */

import type { ShowOpsContext } from "@/lib/show-ops/access";
import { HoldedClient, holdedContactFromSupplier, holdedErrorMessage, pickHoldedContact } from "@/lib/show-ops/holded";
import { holdedContactRecord, holdedDetailsFor } from "@/lib/show-ops/holded-partner-import";
import { checkTaxId, holdedReadiness, normaliseCountry, type PartnerBilling } from "@/lib/show-ops/partner-billing";
import { decryptSecret } from "@/lib/show-ops/secrets";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const COLUMNS =
  "id,name,legal_name,tax_id,email,invoice_address,invoice_postal_code,invoice_city,invoice_province,invoice_country_code,is_person,island,holded_contact_id";

type PartnerRow = PartnerBilling & { id: string; island: string | null; holded_contact_id: string | null };

export type PartnerHoldedResult = { ok: boolean; message: string };

/** The workspace's Holded client, or null when Holded isn't connected. */
export async function holdedClientFor(ctx: ShowOpsContext): Promise<HoldedClient | null> {
  const { data } = await ctx.supabase
    .from("show_ops_integrations")
    .select("secret_ciphertext,status")
    .eq("business_id", ctx.business.id)
    .eq("provider", "holded")
    .maybeSingle();
  if (!data || data.status !== "connected") return null;
  return new HoldedClient(decryptSecret(data.secret_ciphertext));
}

export function safeHoldedMessage(err: unknown): string {
  return holdedErrorMessage(err).replace(/pat_[A-Za-z0-9_]+|[0-9a-f]{32}/g, "[redacted]").slice(0, 300);
}

async function loadPartner(ctx: ShowOpsContext, partnerId: string): Promise<PartnerRow | null> {
  const { data } = await ctx.supabase.from("show_suppliers").select(COLUMNS).eq("id", partnerId).eq("business_id", ctx.business.id).maybeSingle();
  return (data as PartnerRow | null) ?? null;
}

/** Remembering the Holded id is a backend concern (finance users can't write the catalogue), scoped to this business. */
async function rememberContact(ctx: ShowOpsContext, partnerId: string, contactId: string | null) {
  await createSupabaseServiceRoleClient()
    .from("show_suppliers")
    .update({ holded_contact_id: contactId, updated_at: new Date().toISOString() })
    .eq("id", partnerId)
    .eq("business_id", ctx.business.id);
}

/**
 * Create or update the partner's Holded contact from the Hub's details. A linked
 * contact is updated in place (what the office added in Holded, like IBAN or phones,
 * stays). An unlinked partner is matched by NIF or exact name first (its own island's
 * contact when Holded has one per island), unless the caller already knows Holded has no such contact.
 */
export async function sendPartnerToHolded(
  ctx: ShowOpsContext,
  client: HoldedClient,
  partnerId: string,
  opts: { knownMissing?: boolean } = {},
): Promise<PartnerHoldedResult> {
  const partner = await loadPartner(ctx, partnerId);
  if (!partner) return { ok: false, message: "Partner not found." };
  const missing = holdedReadiness(partner);
  if (missing.length) return { ok: false, message: `${partner.name} is missing: ${missing.join(", ")}.` };
  const tax = checkTaxId(partner.tax_id, normaliseCountry(partner.invoice_country_code));
  const input = holdedContactFromSupplier({ ...partner, tax_id: tax.ok ? tax.value : partner.tax_id });

  if (partner.holded_contact_id) {
    if (await client.syncContact(partner.holded_contact_id, input)) return { ok: true, message: `${partner.name} updated in Holded.` };
    await rememberContact(ctx, partner.id, null);
  }
  if (!opts.knownMissing) {
    // One business can have a Holded contact per island (or per agent): pick the partner's own, or stop rather than guess.
    const existing =
      (input.code ? pickHoldedContact(await client.contactsByCode(input.code), partner) : null) ??
      pickHoldedContact(await client.contactsByName(input.name), partner);
    if (existing) {
      await client.syncContact(existing.id, input);
      await rememberContact(ctx, partner.id, existing.id);
      return { ok: true, message: `${partner.name} linked to its Holded contact and updated.` };
    }
  }
  const created = await client.createContact(input);
  await rememberContact(ctx, partner.id, created.id);
  return { ok: true, message: `${partner.name} created in Holded.` };
}

/** Replace the partner's invoicing details with its linked Holded contact's. */
export async function updatePartnerFromHolded(ctx: ShowOpsContext, client: HoldedClient, partnerId: string): Promise<PartnerHoldedResult> {
  const partner = await loadPartner(ctx, partnerId);
  if (!partner) return { ok: false, message: "Partner not found." };
  if (!partner.holded_contact_id) return { ok: false, message: `${partner.name} isn't linked to a Holded contact yet. Use Send to Holded first.` };
  const raw = await client.getContact(partner.holded_contact_id);
  const contact = raw ? holdedContactRecord(raw) : null;
  if (!contact) {
    await rememberContact(ctx, partner.id, null);
    return { ok: false, message: `${partner.name}'s Holded contact no longer exists, so the link was removed.` };
  }
  const { error } = await ctx.supabase
    .from("show_suppliers")
    .update({ ...holdedDetailsFor(contact), updated_at: new Date().toISOString() })
    .eq("id", partner.id)
    .eq("business_id", ctx.business.id);
  if (error) return { ok: false, message: `Could not save: ${error.message}` };
  return { ok: true, message: `${partner.name} now matches Holded (${contact.name}).` };
}
