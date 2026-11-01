"use server";

import { randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireGlobalShowOpsAdmin } from "@/lib/show-ops/access";
import { parseTwilioMeta } from "@/lib/show-ops/inbox/connection";
import { normalisePhone } from "@/lib/show-ops/inbox/logic";
import { TEMPLATE_SPECS } from "@/lib/show-ops/inbox/templates";
import { checkMetaNumber, isMetaId, listApprovedTemplates, subscribeMetaApp } from "@/lib/show-ops/inbox/meta";
import { checkTwilioAccount, isAccountSid, isContentSid } from "@/lib/show-ops/inbox/twilio";
import type { TwilioVenue } from "@/lib/show-ops/inbox/types";
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
  const templates = { reopen_content_sid: "", booking_content_sid: "", booking_transport_content_sid: "", pickup_content_sid: "" };
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
    venues: venuesFrom(formData),
  };
}

/** venue_address:<island> / venue_maps:<island> → { island: { address, maps_url } }. */
function venuesFrom(formData: FormData): Record<string, TwilioVenue> {
  const out: Record<string, TwilioVenue> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("venue_address:")) continue;
    const island = key.slice("venue_address:".length);
    const address = String(value).trim().replace(/\s+/g, " ");
    const maps = String(formData.get(`venue_maps:${island}`) ?? "").trim();
    if (maps && !/^https:\/\/\S+$/.test(maps)) fail(`The Google Maps link for ${island} must start with https://`);
    if (address || maps) out[island] = { address, maps_url: maps };
  }
  return out;
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
  // Keep the webhook address (and any Meta settings) when reconnecting, so Twilio's and Meta's settings stay valid.
  const webhookToken = parseTwilioMeta(existing?.meta).webhook_token || randomBytes(20).toString("hex");
  const kept = (existing?.meta ?? {}) as Record<string, unknown>;
  const now = new Date().toISOString();
  const { error } = await ctx.supabase.from("show_ops_integrations").upsert(
    {
      business_id: ctx.business.id,
      provider: "twilio",
      secret_ciphertext: encryptSecret(authToken),
      status: "connected",
      meta: { ...kept, account_sid: accountSid, webhook_token: webhookToken, hint: secretHint(authToken), account_name: check.name, ...numbers },
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

/* ------------------------------------------------------------------ *
 * WhatsApp through Meta's own Cloud API (saved on the same row as Twilio)
 * ------------------------------------------------------------------ */

async function loadRow(ctx: Awaited<ReturnType<typeof requireGlobalShowOpsAdmin>>) {
  const { data } = await ctx.supabase
    .from("show_ops_integrations")
    .select("meta")
    .eq("business_id", ctx.business.id)
    .eq("provider", "twilio")
    .maybeSingle();
  if (!data) fail("Connect Twilio first (it keeps SMS and the inbox address), then add Meta.");
  return (data.meta ?? {}) as Record<string, unknown>;
}

async function saveRow(ctx: Awaited<ReturnType<typeof requireGlobalShowOpsAdmin>>, meta: Record<string, unknown>) {
  const { error } = await ctx.supabase
    .from("show_ops_integrations")
    .update({ meta, updated_at: new Date().toISOString() })
    .eq("business_id", ctx.business.id)
    .eq("provider", "twilio");
  if (error) fail("Could not save.");
}

/**
 * Meta's phone number ID, WhatsApp Business Account ID, a permanent system-user
 * token and the app secret. The token is proven against Meta and the approved
 * templates are read straight away. Token and secret are stored encrypted.
 */
export async function saveMetaAction(formData: FormData): Promise<void> {
  const ctx = await requireGlobalShowOpsAdmin();
  const raw = (k: string) => String(formData.get(k) ?? "").trim();
  const phoneNumberId = raw("meta_phone_number_id");
  const wabaId = raw("meta_waba_id");
  if (!isMetaId(phoneNumberId)) fail("The phone number ID is the long number Meta shows under WhatsApp → API Setup.");
  if (!isMetaId(wabaId)) fail("The WhatsApp Business Account ID is the long number Meta shows under WhatsApp → API Setup.");
  if (!secretsKeyConfigured()) fail("Server is missing SHOW_OPS_SECRETS_KEY. Add it to the environment first.");
  const existing = await loadRow(ctx);

  // Leave the token or secret empty to keep the saved one.
  let accessToken = raw("meta_access_token");
  let appSecret = raw("meta_app_secret");
  try {
    if (!accessToken && typeof existing.meta_token_ct === "string") accessToken = decryptSecret(existing.meta_token_ct);
    if (!appSecret && typeof existing.meta_app_secret_ct === "string") appSecret = decryptSecret(existing.meta_app_secret_ct);
  } catch {
    fail("The saved Meta token cannot be read (the server key changed). Paste it again.");
  }
  if (!/^[A-Za-z0-9]{40,1000}$/.test(accessToken)) fail("Paste the permanent access token from the Meta system user.");
  if (!/^[0-9a-f]{32}$/i.test(appSecret)) fail("Paste the App secret from the Meta app (App settings → Basic, 32 characters).");

  const creds = { accessToken, appSecret, phoneNumberId, wabaId };
  const number = await checkMetaNumber(creds);
  if (!number.ok) fail(number.message);
  const templates = await listApprovedTemplates(creds);
  if (!templates.ok) fail(templates.message);
  const subscribed = await subscribeMetaApp(creds);
  if (!subscribed.ok) fail(`Meta would not send guest messages to the Hub: ${subscribed.message}`);

  const meta: Record<string, unknown> = {
    ...existing,
    meta_phone_number_id: phoneNumberId,
    meta_waba_id: wabaId,
    meta_token_ct: encryptSecret(accessToken),
    meta_app_secret_ct: encryptSecret(appSecret),
    meta_token_hint: secretHint(accessToken),
    meta_number_name: number.name,
    meta_templates: templates.templates,
    meta_template_bodies: templates.bodies,
    whatsapp_provider: formData.get("whatsapp_provider") === "meta" ? "meta" : "twilio",
  };
  if (number.phone) meta.whatsapp_from = number.phone;
  await saveRow(ctx, meta);
  revalidatePath(BACK);
  redirect(`${BACK}?twilio=meta_saved#messaging`);
}

/** Re-read Meta's approved templates (after Meta approves a new one) and switch the sender. */
export async function refreshMetaAction(formData: FormData): Promise<void> {
  const ctx = await requireGlobalShowOpsAdmin();
  const existing = await loadRow(ctx);
  const meta = parseTwilioMeta(existing);
  if (typeof existing.meta_token_ct !== "string" || typeof existing.meta_app_secret_ct !== "string") fail("Save the Meta details first.");
  let creds;
  try {
    creds = {
      accessToken: decryptSecret(existing.meta_token_ct),
      appSecret: decryptSecret(existing.meta_app_secret_ct),
      phoneNumberId: meta.meta_phone_number_id,
      wabaId: meta.meta_waba_id,
    };
  } catch {
    fail("The saved Meta token cannot be read (the server key changed). Paste it again.");
  }
  const templates = await listApprovedTemplates(creds);
  if (!templates.ok) fail(templates.message);
  await saveRow(ctx, {
    ...existing,
    meta_templates: templates.templates,
    meta_template_bodies: templates.bodies,
    whatsapp_provider: formData.get("whatsapp_provider") === "meta" ? "meta" : "twilio",
  });
  revalidatePath(BACK);
  redirect(`${BACK}?twilio=meta_saved#messaging`);
}

export async function disconnectMetaAction(): Promise<void> {
  const ctx = await requireGlobalShowOpsAdmin();
  const existing = await loadRow(ctx);
  const meta: Record<string, unknown> = { ...existing, whatsapp_provider: "twilio" };
  for (const k of ["meta_phone_number_id", "meta_waba_id", "meta_token_ct", "meta_app_secret_ct", "meta_token_hint", "meta_number_name", "meta_templates", "meta_template_bodies"]) {
    delete meta[k];
  }
  await saveRow(ctx, meta);
  revalidatePath(BACK);
  redirect(`${BACK}?twilio=meta_removed#messaging`);
}
