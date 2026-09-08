import type { ShowOpsContext } from "@/lib/show-ops/access";

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

