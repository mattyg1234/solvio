"use server";

import { randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireGlobalShowOpsAdmin } from "@/lib/show-ops/access";
import { parseTwilioMeta } from "@/lib/show-ops/inbox/connection";
import { normalisePhone } from "@/lib/show-ops/inbox/logic";
import { TEMPLATE_SPECS } from "@/lib/show-ops/inbox/templates";
import { checkTwilioAccount, isAccountSid, isContentSid } from "@/lib/show-ops/inbox/twilio";
import { decryptSecret, encryptSecret, secretHint, secretsKeyConfigured } from "@/lib/show-ops/secrets";

/*
 * Settings → WhatsApp & SMS. A Director or Superadmin with every island pastes
 * the company's own Twilio Account SID and Auth Token; the token is proven
 * against Twilio, then stored encrypted (SHOW_OPS_SECRETS_KEY) and never shown again.
 */

const BACK = "/dashboard/show-ops/settings";

function fail(message: string): never {
  redirect(`${BACK}?twilio_error=${encodeURIComponent(message)}#messaging`);
}

function numbersFrom(formData: FormData) {
  const raw = (k: string) => String(formData.get(k) ?? "").trim();
  const whatsapp = raw("whatsapp_from");
  const sms = raw("sms_from");
  const whatsappFrom = whatsapp ? normalisePhone(whatsapp) : "";
  const smsFrom = sms ? normalisePhone(sms) : "";
  if (whatsappFrom === null) fail("The WhatsApp sender must be a full number with country code, e.g. +34 928 000 000.");
  if (smsFrom === null) fail("The SMS number must be a full number with country code, e.g. +34 928 000 000.");
  if (!whatsappFrom && !smsFrom) fail("Add the WhatsApp sender, the SMS number, or both.");
  const templates = { reopen_content_sid: "", ticket_content_sid: "", pickup_content_sid: "" };
  for (const spec of TEMPLATE_SPECS) {
    const sid = raw(spec.metaKey);
    if (sid && !isContentSid(sid)) fail(`The "${spec.title}" template SID starts with HX and has 34 characters.`);
    templates[spec.metaKey] = sid;
  }
  return {
    whatsapp_from: whatsappFrom ?? "",
    sms_from: smsFrom ?? "",
    ...templates,
    reopen_uses_name: formData.get("reopen_uses_name") === "on",
  };
}

export async function connectTwilioAction(formData: FormData): Promise<void> {
  const ctx = await requireGlobalShowOpsAdmin();
  const accountSid = String(formData.get("account_sid") ?? "").trim();
  const authToken = String(formData.get("auth_token") ?? "").trim();
  if (!isAccountSid(accountSid)) fail("The Account SID starts with AC and has 34 characters.");
  if (!/^[0-9a-f]{32}$/i.test(authToken)) fail("Paste the Auth Token from the Twilio console (32 characters).");
  if (!secretsKeyConfigured()) fail("Server is missing SHOW_OPS_SECRETS_KEY. Add it to the environment first.");
  const numbers = numbersFrom(formData);

  const check = await checkTwilioAccount({ accountSid, authToken });
  if (!check.ok) fail(check.message);

  const { data: existing } = await ctx.supabase
    .from("show_ops_integrations")
    .select("meta")
    .eq("business_id", ctx.business.id)
    .eq("provider", "twilio")
    .maybeSingle();
  // Keep the webhook address when reconnecting, so Twilio's settings stay valid.
  const webhookToken = parseTwilioMeta(existing?.meta).webhook_token || randomBytes(20).toString("hex");
  const now = new Date().toISOString();
  const { error } = await ctx.supabase.from("show_ops_integrations").upsert(
    {
      business_id: ctx.business.id,
      provider: "twilio",
      secret_ciphertext: encryptSecret(authToken),
      status: "connected",
      meta: { account_sid: accountSid, webhook_token: webhookToken, hint: secretHint(authToken), account_name: check.name, ...numbers },
      last_checked_at: now,
      last_error: null,
      created_by: ctx.user.id,
      updated_at: now,
    },
    { onConflict: "business_id,provider" },
  );
  if (error) fail(/provider_check/.test(error.message) ? "The inbox database update has not been applied yet." : "Could not save the connection.");
  revalidatePath(BACK);
  redirect(`${BACK}?twilio=connected#messaging`);
}

/** Change the numbers or template without pasting the token again. */
export async function saveTwilioNumbersAction(formData: FormData): Promise<void> {
  const ctx = await requireGlobalShowOpsAdmin();
  const { data } = await ctx.supabase
    .from("show_ops_integrations")
    .select("meta")
    .eq("business_id", ctx.business.id)
    .eq("provider", "twilio")
    .maybeSingle();
  if (!data) fail("Connect Twilio first.");
  const numbers = numbersFrom(formData);
  const meta = { ...((data.meta ?? {}) as Record<string, unknown>), ...numbers };
  const { error } = await ctx.supabase
    .from("show_ops_integrations")
    .update({ meta, updated_at: new Date().toISOString() })
    .eq("business_id", ctx.business.id)
    .eq("provider", "twilio");
  if (error) fail("Could not save.");
  revalidatePath(BACK);
  redirect(`${BACK}?twilio=saved#messaging`);
}

export async function testTwilioAction(): Promise<void> {
  const ctx = await requireGlobalShowOpsAdmin();
  const { data } = await ctx.supabase
    .from("show_ops_integrations")
    .select("secret_ciphertext,meta")
    .eq("business_id", ctx.business.id)
    .eq("provider", "twilio")
    .maybeSingle();
  if (!data) fail("Connect Twilio first.");
  const meta = parseTwilioMeta(data.meta);
  let authToken = "";
  try {
    authToken = decryptSecret(data.secret_ciphertext);
  } catch {
    fail("The saved token cannot be read (the server key changed). Paste the Auth Token again.");
  }
  const check = await checkTwilioAccount({ accountSid: meta.account_sid, authToken });
  const now = new Date().toISOString();
  await ctx.supabase
    .from("show_ops_integrations")
    .update({ status: check.ok ? "connected" : "error", last_checked_at: now, last_error: check.ok ? null : check.message, updated_at: now })
    .eq("business_id", ctx.business.id)
    .eq("provider", "twilio");
  revalidatePath(BACK);
  if (!check.ok) fail(check.message);
  redirect(`${BACK}?twilio=ok#messaging`);
}

export async function disconnectTwilioAction(): Promise<void> {
  const ctx = await requireGlobalShowOpsAdmin();
  await ctx.supabase.from("show_ops_integrations").delete().eq("business_id", ctx.business.id).eq("provider", "twilio");
  revalidatePath(BACK);
  redirect(`${BACK}?twilio=disconnected#messaging`);
}
