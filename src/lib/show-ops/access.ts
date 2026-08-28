import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { brandingFromBusiness, parseShowOpsConfig } from "@/lib/show-ops/config";
import type {
  ShowOpsBillingTier,
  ShowOpsBranding,
  ShowOpsConfig,
  ShowOpsMemberRole,
  ShowOpsWorkspace,
  ShowSupplier,
} from "@/lib/show-ops/types";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import {
  canSeeShowOpsPage,
  showOpsAllowedPages,
  SHOW_OPS_SIDEBAR_LINKS,
  type ShowOpsPageKey,
} from "@/lib/show-ops/nav";

export const SHOW_OPS_WORKSPACE_COOKIE = "solvio_show_ops_workspace";

const BIZ_SELECT =
  "id,name,owner_id,show_ops_enabled,show_ops_config,show_ops_billing_tier,show_ops_display_name,show_ops_logo_url,show_ops_primary_color,show_ops_accent_color,show_ops_custom_domain,logo_url,stripe_connect_account_id,stripe_connect_charges_enabled";

export type ShowOpsBusiness = {
  id: string;
  name: string;
  owner_id: string;
  show_ops_enabled: boolean;
  show_ops_config: unknown;
  show_ops_billing_tier: ShowOpsBillingTier;
  show_ops_display_name: string | null;
  show_ops_logo_url: string | null;
  show_ops_primary_color: string | null;
  show_ops_accent_color: string | null;
  show_ops_custom_domain: string | null;
  logo_url: string | null;
  stripe_connect_account_id: string | null;
  stripe_connect_charges_enabled: boolean | null;
};

export type ShowOpsContext = {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  user: { id: string; email?: string };
  business: ShowOpsBusiness;
  config: ShowOpsConfig;
  branding: ShowOpsBranding;
  tier: ShowOpsBillingTier;
  role: ShowOpsMemberRole | "owner";
  isOwner: boolean;
  /** Explicit page allow-list for this member; null means use the role default. */
  allowedPages: string[] | null;
  /**
   * The partner this staff member books for by default — the desk pre-selects it
   * so whoever answers the phone is not re-picking their own outlet every time.
   * Null for owners and anyone not tied to one.
   */
  defaultSupplierId: string | null;
  workspaces: ShowOpsWorkspace[];
};

const ROLE_RANK: Record<ShowOpsMemberRole | "owner", number> = {
  seller: 0,
  booker: 1,
  office: 2,
  finance: 3,
  admin: 4,
  owner: 5,
};

export function roleAtLeast(role: ShowOpsMemberRole | "owner", needed: ShowOpsMemberRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[needed];
}

async function loadWorkspaces(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
): Promise<ShowOpsWorkspace[]> {
  const workspaces: ShowOpsWorkspace[] = [];
  const seen = new Set<string>();

  const ownedSelect = "id,name,show_ops_display_name,show_ops_enabled";
  let { data: ownedList } = await supabase
    .from("businesses")
    .select(ownedSelect)
    .eq("owner_id", userId)
    .order("created_at", { ascending: true });
  if (!ownedList?.length) {
    const admin = createSupabaseServiceRoleClient();
    const adminOwned = await admin
      .from("businesses")
      .select(ownedSelect)
      .eq("owner_id", userId)
      .order("created_at", { ascending: true });
    ownedList = adminOwned.data;
  }

  for (const b of ownedList ?? []) {
    seen.add(b.id);
    workspaces.push({
      businessId: b.id,
      name: b.name,
      displayName: (b.show_ops_display_name || b.name || "My business").trim(),
      role: "owner",
      allowedPages: null,
      isOwner: true,
      showOpsEnabled: Boolean(b.show_ops_enabled),
      supplierId: null,
    });
  }

  const { data: memberships } = await supabase
    .from("show_ops_members")
    .select("business_id,role,supplier_id,allowed_pages")
    .eq("user_id", userId);

  const memberBizIds = (memberships ?? []).map((m) => m.business_id).filter((id) => !seen.has(id));
  if (memberBizIds.length) {
    const { data: memberBiz } = await supabase
      .from("businesses")
      .select("id,name,show_ops_display_name,show_ops_enabled")
      .in("id", memberBizIds);
    const byId = new Map((memberBiz ?? []).map((b) => [b.id, b]));
    for (const m of memberships ?? []) {
      if (seen.has(m.business_id)) continue;
      const b = byId.get(m.business_id);
      if (!b) continue;
      const role = (m.role as ShowOpsMemberRole) || "booker";
      if (role === "seller") continue;
      seen.add(b.id);
      workspaces.push({
        businessId: b.id,
        name: b.name,
        displayName: (b.show_ops_display_name || b.name || "Team").trim(),
        role,
        isOwner: false,
        showOpsEnabled: Boolean(b.show_ops_enabled),
        supplierId: m.supplier_id ?? null,
        allowedPages: (m.allowed_pages as string[] | null) ?? null,
      });
    }
  }

  return workspaces;
}

export type ShowOpsSellerContext = ShowOpsContext & {
  supplier: Pick<
    ShowSupplier,
    "id" | "name" | "partner_type" | "billing_mode" | "deposit_percent" | "invoice_nett_percent"
  >;
};

async function loadSellerMembership(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
) {
  const { data } = await supabase
    .from("show_ops_members")
    .select("business_id,supplier_id")
    .eq("user_id", userId)
    .eq("role", "seller")
    .not("supplier_id", "is", null)
    .limit(1)
    .maybeSingle();
  return data;
}

export async function requireShowOpsSellerContext(): Promise<ShowOpsSellerContext> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/partner");

  const mem = await loadSellerMembership(supabase, user.id);
  if (!mem?.supplier_id) redirect("/login?next=/partner");

  const [{ data: businessRow }, { data: supplier }] = await Promise.all([
    supabase.from("businesses").select(BIZ_SELECT).eq("id", mem.business_id).maybeSingle(),
    supabase
      .from("show_suppliers")
      .select("id,name,partner_type,billing_mode,deposit_percent,invoice_nett_percent")
      .eq("id", mem.supplier_id)
      .eq("business_id", mem.business_id)
      .maybeSingle(),
  ]);
  if (!businessRow || !supplier) redirect("/login?next=/partner");

  const business = businessRow as ShowOpsBusiness;
  return {
    supabase,
    user: { id: user.id, email: user.email ?? undefined },
    business,
    config: parseShowOpsConfig(business.show_ops_config),
    branding: brandingFromBusiness(business),
    tier: (business.show_ops_billing_tier || "starter") as ShowOpsBillingTier,
    role: "seller",
    isOwner: false,
    // Sellers never reach the Show Ops staff nav; their portal is separate.
    allowedPages: [],
    defaultSupplierId: supplier.id,
    workspaces: [],
    supplier,
  };
}

export async function requireShowOpsContext(): Promise<ShowOpsContext> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const workspaces = await loadWorkspaces(supabase, user.id);
  if (!workspaces.length) {
    const seller = await loadSellerMembership(supabase, user.id);
    if (seller) redirect("/partner");
    redirect("/dashboard");
  }

  const cookieStore = await cookies();
  const preferred = cookieStore.get(SHOW_OPS_WORKSPACE_COOKIE)?.value?.trim() || "";
  const picked =
    workspaces.find((w) => w.businessId === preferred) ||
    workspaces.find((w) => w.showOpsEnabled) ||
    workspaces[0];

  let { data: businessRow } = await supabase
    .from("businesses")
    .select(BIZ_SELECT)
    .eq("id", picked.businessId)
    .maybeSingle();
  if (!businessRow && picked.isOwner) {
    const admin = createSupabaseServiceRoleClient();
    const adminBiz = await admin.from("businesses").select(BIZ_SELECT).eq("id", picked.businessId).maybeSingle();
    businessRow = adminBiz.data;
  }

  if (!businessRow) {
    redirect("/dashboard");
  }

  const business = businessRow as ShowOpsBusiness;
  const role = picked.role;
  const isOwner = picked.isOwner;
  const tier = (business.show_ops_billing_tier || "starter") as ShowOpsBillingTier;

  return {
    supabase,
    user: { id: user.id, email: user.email ?? undefined },
    business,
    config: parseShowOpsConfig(business.show_ops_config),
    branding: brandingFromBusiness(business),
    tier,
    role,
    isOwner,
    allowedPages: picked.allowedPages ?? null,
    defaultSupplierId: picked.supplierId ?? null,
    workspaces,
  };
}

export async function requireShowOpsEnabled(): Promise<ShowOpsContext> {
  const ctx = await requireShowOpsContext();
  if (!ctx.business.show_ops_enabled) {
    redirect("/dashboard/show-ops/setup");
  }
  return ctx;
}

/** Office desk or a seller portal — used for live night load while booking. */
export async function requireShowOpsStaffOrSeller(): Promise<ShowOpsContext | ShowOpsSellerContext> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const mem = await loadSellerMembership(supabase, user.id);
  if (mem?.supplier_id) return requireShowOpsSellerContext();
  return requireShowOpsEnabled();
}

/** Throws if the signed-in role is below the required floor. */
export async function requireShowOpsRole(needed: ShowOpsMemberRole): Promise<ShowOpsContext> {
  const ctx = await requireShowOpsEnabled();
  if (!roleAtLeast(ctx.role, needed)) {
    throw new Error(`This action needs ${needed} access or higher.`);
  }
  return ctx;
}

/**
 * Server-side page guard.
 *
 * Hiding a link in the sidebar is cosmetic — anyone can type the URL. Every
 * Show Ops page calls this so a check-in-only login genuinely cannot open
 * Invoicing by guessing the path.
 */
export async function requireShowOpsPage(key: ShowOpsPageKey): Promise<ShowOpsContext> {
  const ctx = await requireShowOpsEnabled();
  if (!canSeeShowOpsPage(ctx.role, ctx.allowedPages, key)) {
    const fallback = showOpsAllowedPages(ctx.role, ctx.allowedPages)[0];
    const target = SHOW_OPS_SIDEBAR_LINKS.find((l) => l.key === fallback);
    redirect(target?.href ?? "/dashboard");
  }
  return ctx;
}
