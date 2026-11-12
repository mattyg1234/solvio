"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireGlobalShowOpsAdmin } from "@/lib/show-ops/access";
import { MAILERLITE_ISLANDS, MailerLiteClient, mailerLiteErrorMessage, parseMailerLiteGroups, runMailerLiteSync, type MailerLiteGroups } from "@/lib/show-ops/mailerlite";
import { decryptSecret, encryptSecret, secretHint, secretsKeyConfigured } from "@/lib/show-ops/secrets";

const BACK = "/dashboard/show-ops/settings";

function back(params: Record<string, string>): never {
  revalidatePath(BACK);
  redirect(`${BACK}?${new URLSearchParams(params).toString()}#mailerlite`);
}

function safe(err: unknown): string {
  return mailerLiteErrorMessage(err).replace(/eyJ[A-Za-z0-9._-]+/g, "[redacted]").slice(0, 500);
}

/** Owner/admin pastes MHT's MailerLite API token; we prove it works before storing it encrypted. */
export async function connectMailerLiteAction(formData: FormData): Promise<void> {
  const ctx = await requireGlobalShowOpsAdmin();
  const token = String(formData.get("mailerlite_token") ?? "").trim();
  if (!token) back({ mailerlite_error: "Paste the MailerLite API token first." });
  if (!secretsKeyConfigured()) back({ mailerlite_error: "Server is missing SHOW_OPS_SECRETS_KEY." });

  let groups: Awaited<ReturnType<MailerLiteClient["listGroups"]>> = [];
  try {
    groups = await new MailerLiteClient(token).listGroups();
  } catch (err) {
    back({ mailerlite_error: safe(err) });
  }

  const { data: existing } = await ctx.supabase.from("show_ops_integrations").select("meta").eq("business_id", ctx.business.id).eq("provider", "mailerlite").maybeSingle();
  const kept = parseMailerLiteGroups(existing?.meta);
  const now = new Date().toISOString();
  const { error } = await ctx.supabase.from("show_ops_integrations").upsert(
    {
      business_id: ctx.business.id,
      provider: "mailerlite",
      secret_ciphertext: encryptSecret(token),
      status: "connected",
      meta: { hint: secretHint(token), groups: kept, group_list: groups.map((g) => ({ id: g.id, name: g.name })) },
      last_checked_at: now,
      last_error: null,
      created_by: ctx.user.id,
      updated_at: now,
    },
    { onConflict: "business_id,provider" },
  );
  if (error) back({ mailerlite_error: error.message });
  back({ mailerlite: "connected" });
}

/** Which MailerLite group everyone goes into, and optionally one group per island. */
export async function saveMailerLiteGroupsAction(formData: FormData): Promise<void> {
  const ctx = await requireGlobalShowOpsAdmin();
  const { data } = await ctx.supabase.from("show_ops_integrations").select("meta").eq("business_id", ctx.business.id).eq("provider", "mailerlite").maybeSingle();
  if (!data) back({ mailerlite_error: "Connect MailerLite first." });
  const meta = (data!.meta ?? {}) as Record<string, unknown>;
  const known = new Set(((meta.group_list ?? []) as Array<{ id: string }>).map((g) => g.id));
  const pick = (key: string) => {
    const v = String(formData.get(key) ?? "").trim();
    return v && known.has(v) ? v : "";
  };
  const groups: MailerLiteGroups = { all: pick("group_all"), islands: {} };
  if (!groups.all) back({ mailerlite_error: "Choose the MailerLite group every guest goes into." });
  for (const island of MAILERLITE_ISLANDS) {
    const id = pick(`group_${island}`);
    if (id) groups.islands[island] = id;
  }
  await ctx.supabase
    .from("show_ops_integrations")
    .update({ meta: { ...meta, groups }, updated_at: new Date().toISOString() })
    .eq("business_id", ctx.business.id)
    .eq("provider", "mailerlite");
  back({ mailerlite: "groups_saved" });
}

/** Re-reads the group list (e.g. after making a new group in MailerLite) and proves the token still works. */
export async function refreshMailerLiteAction(): Promise<void> {
  const ctx = await requireGlobalShowOpsAdmin();
  const { data } = await ctx.supabase.from("show_ops_integrations").select("secret_ciphertext,meta").eq("business_id", ctx.business.id).eq("provider", "mailerlite").maybeSingle();
  if (!data) back({ mailerlite_error: "Connect MailerLite first." });
  try {
    const groups = await new MailerLiteClient(decryptSecret(data!.secret_ciphertext)).listGroups();
    await ctx.supabase
      .from("show_ops_integrations")
      .update({
        status: "connected",
        last_error: null,
        last_checked_at: new Date().toISOString(),
        meta: { ...((data!.meta ?? {}) as Record<string, unknown>), group_list: groups.map((g) => ({ id: g.id, name: g.name })) },
      })
      .eq("business_id", ctx.business.id)
      .eq("provider", "mailerlite");
  } catch (err) {
    await ctx.supabase
      .from("show_ops_integrations")
      .update({ status: "error", last_error: safe(err), last_checked_at: new Date().toISOString() })
      .eq("business_id", ctx.business.id)
      .eq("provider", "mailerlite");
    back({ mailerlite_error: safe(err) });
  }
  back({ mailerlite: "ok" });
}

/** Sends waiting opted-in guests now instead of waiting for the hourly run. */
export async function syncMailerLiteNowAction(): Promise<void> {
  const ctx = await requireGlobalShowOpsAdmin();
  const [r] = await runMailerLiteSync(ctx.business.id);
  if (!r) back({ mailerlite_error: "MailerLite is not connected." });
  if (r.error) back({ mailerlite_error: r.error });
  const parts = [`${r.added} added`, `${r.removed} taken out (replied STOP)`];
  if (r.failed) parts.push(`${r.failed} could not be added and will be tried again next run`);
  back({ mailerlite: "synced", mailerlite_msg: parts.join(", ") + "." });
}

export async function disconnectMailerLiteAction(): Promise<void> {
  const ctx = await requireGlobalShowOpsAdmin();
  await ctx.supabase.from("show_ops_integrations").delete().eq("business_id", ctx.business.id).eq("provider", "mailerlite");
  back({ mailerlite: "disconnected" });
}
