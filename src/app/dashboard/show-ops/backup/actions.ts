"use server";

import { redirect } from "next/navigation";

import { requireGlobalShowOpsAdmin } from "@/lib/show-ops/access";
import { filterShowOpsOutboundTo, SHOW_OPS_OUTBOUND_HELD } from "@/lib/show-ops/outbound";
import { PLAN_B_BUSINESS_SELECT, type PlanBBusinessRow } from "@/lib/show-ops/plan-b-pack";
import { sendPlanBPack } from "@/lib/show-ops/plan-b-run";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const BACKUP = "/dashboard/show-ops/backup";

function backupRedirect(params: Record<string, string>): never {
  redirect(`${BACKUP}?${new URLSearchParams(params).toString()}#plan-b`);
}

/** "Email me the Plan B pack now": the same pack the cron sends, to the signed-in admin only. */
export async function sendPlanBPackToMeAction(): Promise<void> {
  const ctx = await requireGlobalShowOpsAdmin();
  const email = (ctx.user.email || "").trim().toLowerCase();
  if (!email.includes("@")) backupRedirect({ pack_error: "Your login has no email address to send to." });
  if (!filterShowOpsOutboundTo(email).length) {
    backupRedirect({ pack_error: `${SHOW_OPS_OUTBOUND_HELD} Your address (${email}) is not on the test allowlist.` });
  }

  const admin = createSupabaseServiceRoleClient();
  const { data: biz, error } = await admin.from("businesses").select(PLAN_B_BUSINESS_SELECT).eq("id", ctx.business.id).maybeSingle();
  if (error || !biz) backupRedirect({ pack_error: error?.message || "Could not load this workspace." });

  let sent: { ok: boolean; message?: string; errors?: string[] };
  try {
    sent = await sendPlanBPack(admin, biz as PlanBBusinessRow, { to: [email] });
  } catch (e) {
    sent = { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
  if (!sent.ok) backupRedirect({ pack_error: (sent.message || "Could not send.").slice(0, 200) });
  backupRedirect({ pack_sent: email });
}
