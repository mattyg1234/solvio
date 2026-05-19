"use server";

import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  SOLVIO_MARKETING_FIRST_MESSAGE,
  SOLVIO_MARKETING_SYSTEM_PROMPT,
} from "@/lib/solvio-marketing-receptionist";
import { syncVapiAssistantPrompt } from "@/lib/vapi-assistant-sync";
import { invalidateVapiMarketingBootstrapCache } from "@/lib/vapi-marketing-bootstrap";
import { resolveMarketingVapiAssistantId } from "@/lib/marketing-vapi-config";

async function assertAuthenticatedUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return user;
}

/** Push Solvio homepage receptionist script to the marketing Vapi assistant in Vapi Dashboard. */
export async function syncSolvioMarketingAssistantAction(
  assistantIdOverride?: string,
): Promise<{ ok: true; assistantId: string } | { ok: false; message: string }> {
  await assertAuthenticatedUser();

  const assistantId = (assistantIdOverride?.trim() || resolveMarketingVapiAssistantId()).trim();
  if (!assistantId) {
    return {
      ok: false,
      message: "Set NEXT_PUBLIC_VAPI_ASSISTANT_ID (or pick an assistant) before syncing the homepage receptionist.",
    };
  }

  const result = await syncVapiAssistantPrompt(assistantId, {
    firstMessage: SOLVIO_MARKETING_FIRST_MESSAGE,
    systemPrompt: SOLVIO_MARKETING_SYSTEM_PROMPT,
  });

  if (!result.ok) return result;

  invalidateVapiMarketingBootstrapCache();
  return { ok: true, assistantId };
}

/** Push a merchant's saved briefing to their selected Vapi assistant. */
export async function syncMerchantVapiAssistantAction(
  businessId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: biz } = await supabase
    .from("businesses")
    .select("voice_receptionist_details")
    .eq("id", businessId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!biz) return { ok: false, message: "Business not found." };

  const details =
    biz.voice_receptionist_details && typeof biz.voice_receptionist_details === "object"
      ? (biz.voice_receptionist_details as Record<string, unknown>)
      : {};

  const assistantId = typeof details.vapi_assistant_id === "string" ? details.vapi_assistant_id.trim() : "";
  const systemPrompt =
    typeof details.agent_prompt_custom === "string" ? details.agent_prompt_custom.trim() : "";
  const firstMessage =
    typeof details.agent_first_message === "string" ? details.agent_first_message.trim() : "";

  if (!assistantId) return { ok: false, message: "Choose a Vapi assistant before syncing." };
  if (!systemPrompt && !firstMessage) {
    return { ok: false, message: "Add a receptionist brief or first spoken line before syncing to Vapi." };
  }

  const result = await syncVapiAssistantPrompt(assistantId, {
    ...(firstMessage ? { firstMessage } : {}),
    ...(systemPrompt ? { systemPrompt } : {}),
  });

  if (!result.ok) return result;
  return { ok: true };
}
