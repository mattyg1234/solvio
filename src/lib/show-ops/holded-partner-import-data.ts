import type { ShowOpsContext } from "@/lib/show-ops/access";
import { HoldedClient, holdedErrorMessage } from "@/lib/show-ops/holded";
import { holdedContactRecord, planPartnerImport, type HoldedContactRecord, type HubPartner, type ImportRow } from "@/lib/show-ops/holded-partner-import";
import { decryptSecret } from "@/lib/show-ops/secrets";

const PARTNER_COLUMNS =
  "id,name,island,legal_name,tax_id,email,invoice_address,invoice_postal_code,invoice_city,invoice_province,invoice_country_code,is_person,holded_contact_id";

/** Every active partner, paged past the 1,000-row API limit. */
async function loadPartners(ctx: ShowOpsContext): Promise<HubPartner[]> {
  const out: HubPartner[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await ctx.supabase
      .from("show_suppliers")
      .select(PARTNER_COLUMNS)
      .eq("business_id", ctx.business.id)
      .eq("active", true)
      .order("name")
      .range(from, from + 999);
    if (error) throw new Error(`Could not load partners: ${error.message}`);
    out.push(...((data ?? []) as HubPartner[]));
    if (!data || data.length < 1000) return out;
  }
}

async function loadHoldedContacts(ctx: ShowOpsContext): Promise<HoldedContactRecord[]> {
  const { data } = await ctx.supabase
    .from("show_ops_integrations")
    .select("secret_ciphertext,status")
    .eq("business_id", ctx.business.id)
    .eq("provider", "holded")
    .maybeSingle();
  if (!data || data.status === "disabled") throw new Error("Holded is not connected. Add the API token in Settings.");
  const client = new HoldedClient(decryptSecret(data.secret_ciphertext));
  return (await client.listContacts()).map(holdedContactRecord).filter((c): c is HoldedContactRecord => c !== null);
}

export type PartnerImportPlan = { rows: ImportRow[]; contacts: number; error: string | null };

/** Holded contacts matched to the Hub's partners. Reads Holded only; writes nothing. */
export async function loadPartnerImportPlan(ctx: ShowOpsContext): Promise<PartnerImportPlan> {
  try {
    const [partners, contacts] = await Promise.all([loadPartners(ctx), loadHoldedContacts(ctx)]);
    return { rows: planPartnerImport(partners, contacts), contacts: contacts.length, error: null };
  } catch (err) {
    const message = holdedErrorMessage(err).replace(/pat_[A-Za-z0-9_]+|[0-9a-f]{32}/g, "[redacted]").slice(0, 500);
    return { rows: [], contacts: 0, error: message };
  }
}
