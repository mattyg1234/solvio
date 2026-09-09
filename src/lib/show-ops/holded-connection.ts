import type { ShowOpsContext } from "@/lib/show-ops/access";
import { HoldedClient, parseIgicApprovals, rateKey } from "@/lib/show-ops/holded";
import { decryptSecret } from "@/lib/show-ops/secrets";

export type HoldedConnection = {
  connected: boolean;
  status: "connected" | "error" | "disabled" | "none";
  hint: string | null;
  lastCheckedAt: string | null;
  lastError: string | null;
  companyRegime: "igic" | "iva" | "unknown";
};

/** Read-only view for the settings page — never returns the token. */
export async function loadHoldedConnection(ctx: ShowOpsContext): Promise<HoldedConnection> {
  const { data } = await ctx.supabase
    .from("show_ops_integrations")
    .select("status,meta,last_checked_at,last_error")
    .eq("business_id", ctx.business.id)
    .eq("provider", "holded")
    .maybeSingle();
  if (!data) return { connected: false, status: "none", hint: null, lastCheckedAt: null, lastError: null, companyRegime: "unknown" };
  const meta = (data.meta ?? {}) as Record<string, unknown>;
  return {
    connected: data.status === "connected",
    status: data.status as HoldedConnection["status"],
    hint: typeof meta.hint === "string" ? meta.hint : null,
    lastCheckedAt: data.last_checked_at,
    lastError: data.last_error,
    companyRegime: meta.regime === "igic" || meta.regime === "iva" ? meta.regime : "unknown",
  };
}


export type HoldedIgicTaxOption = { id: string; key: string; name: string; rate: number; approved: boolean };

/** For the settings page: Holded's IGIC sales taxes and which are approved. Never returns the token. */
export async function listHoldedIgicTaxes(ctx: ShowOpsContext): Promise<{ taxes: HoldedIgicTaxOption[]; error: string | null }> {
  const { data } = await ctx.supabase
    .from("show_ops_integrations")
    .select("secret_ciphertext,status,meta")
    .eq("business_id", ctx.business.id)
    .eq("provider", "holded")
    .maybeSingle();
  if (!data || data.status !== "connected") return { taxes: [], error: null };
  try {
    const client = new HoldedClient(decryptSecret(data.secret_ciphertext));
    const approvals = parseIgicApprovals(data.meta);
    const taxes = (await client.listTaxes())
      .filter((t) => Boolean(t.id) && t.legalTreatment === "igic" && (t.scope ?? "sales") === "sales")
      .map((t) => ({ id: t.id as string, key: t.key, name: t.name, rate: Math.round(t.amount * 100) / 100, approved: approvals[rateKey(t.amount)]?.id === t.id }))
      .sort((a, b) => a.rate - b.rate);
    return { taxes, error: null };
  } catch (err) {
    return { taxes: [], error: err instanceof Error ? err.message : "Could not read Holded taxes." };
  }
}
