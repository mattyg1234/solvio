"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireShowOpsRole } from "@/lib/show-ops/access";
import { buildShowOpsDigestForBusiness, DIGEST_BUSINESS_SELECT, type DigestBusinessRow } from "@/lib/show-ops/daily-report";
import { filterShowOpsOutboundTo, SHOW_OPS_OUTBOUND_HELD } from "@/lib/show-ops/outbound";
import { sendShowOpsHtmlEmail } from "@/lib/notifications/show-ops-emails";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const SETTINGS = "/dashboard/show-ops/settings";

function settingsRedirect(params: Record<string, string>): never {
  const q = new URLSearchParams(params);
  redirect(`${SETTINGS}?${q.toString()}#daily-email`);
}

/**
 * "Send me a sample" — build this morning's digest exactly as the 07:00 cron
 * would and post it to the signed-in user only. Goes through the same outbound
 * gate as everything else: in test mode an address off the allowlist is held,
 * and we say so rather than pretending it went.
 */
export async function sendDigestSampleAction(): Promise<void> {
  const ctx = await requireShowOpsRole("office");
  const email = (ctx.user.email || "").trim().toLowerCase();
  if (!email.includes("@")) {
    settingsRedirect({ sample_error: "Your login has no email address to send to." });
  }

  if (!filterShowOpsOutboundTo(email).length) {
    settingsRedirect({ sample_error: `${SHOW_OPS_OUTBOUND_HELD} Your address (${email}) is not on the test allowlist.` });
  }

  const admin = createSupabaseServiceRoleClient();
  const { data: biz, error } = await admin
    .from("businesses")
    .select(DIGEST_BUSINESS_SELECT)
    .eq("id", ctx.business.id)
    .maybeSingle();
  if (error || !biz) {
    settingsRedirect({ sample_error: error?.message || "Could not load this workspace." });
  }

  let sent: { ok: true; id?: string } | { ok: false; message: string };
  try {
    const built = await buildShowOpsDigestForBusiness(admin, biz as DigestBusinessRow);
    sent = await sendShowOpsHtmlEmail({
      to: email,
      subject: `[Sample] ${built.digest.subject}`,
      html: built.digest.html,
      text: built.digest.text,
    });
  } catch (e) {
    sent = { ok: false, message: e instanceof Error ? e.message : String(e) };
  }

  revalidatePath(SETTINGS);
  if (!sent.ok) settingsRedirect({ sample_error: sent.message.slice(0, 200) });
  settingsRedirect({ sample_sent: email });
}
