"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { saveVoiceReceptionistSetup } from "@/app/dashboard/setup/actions";
import { composeVoiceAgentPrompt } from "@/lib/compose-voice-agent-prompt";
import { resolvePlatformElevenLabsVoice } from "@/lib/platform-voice-config";
import type { VoiceReceptionistSaveInput } from "@/lib/voice-receptionist";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createMerchantVapiAssistant, syncVapiAssistantConfig } from "@/lib/vapi-assistant-sync";

export type ReceptionistStudioSaveInput = VoiceReceptionistSaveInput & {
  businessId: string;
  businessName: string;
};

export type ReceptionistStudioSaveResult =
  | { ok: true; assistantId: string; message: string }
  | { ok: false; message: string };

function vapiAssistantLabel(businessName: string, receptionistName: string): string {
  const biz = businessName.trim() || "Venue";
  const name = receptionistName.trim();
  return name ? `${biz} — ${name}` : `${biz} receptionist`;
}

/** Save merchant receptionist to Supabase and create or update their Vapi assistant. */
export async function saveReceptionistStudioAction(
  input: ReceptionistStudioSaveInput,
): Promise<ReceptionistStudioSaveResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { businessId, businessName, ...details } = input;

  const receptionistName = details.receptionist_name?.trim() ?? "";
  const firstMessage = details.agent_first_message?.trim() ?? "";

  const platformVoice = await resolvePlatformElevenLabsVoice();
  if (!platformVoice.voiceId) {
    return {
      ok: false,
      message:
        "Platform voice is not configured. Set SOLVIO_PLATFORM_ELEVENLABS_VOICE_ID to the same ElevenLabs voice as your homepage agent, then redeploy.",
    };
  }

  if (!receptionistName) {
    return { ok: false, message: "Give your receptionist a name before saving." };
  }
  if (!firstMessage) {
    return { ok: false, message: "Add a first spoken line — what callers hear when they connect." };
  }
  if (!details.reception_scope?.trim() && !details.agent_prompt_custom?.trim()) {
    return {
      ok: false,
      message: "Describe what your receptionist should do, or paste a custom system prompt.",
    };
  }

  const systemPrompt =
    details.agent_prompt_custom?.trim() ||
    composeVoiceAgentPrompt({
      businessName,
      receptionistName,
      receptionIdentity: details.reception_identity,
      receptionScope: details.reception_scope,
      callerIntakePriorities: details.caller_intake_priorities,
      agentGoal: details.agent_goal,
      conversationFeel: details.conversation_feel,
      outboundNumberNote: details.outbound_number_note,
      greetingStyle: details.greeting_style,
      languagesNote: details.languages_note,
      agentFirstMessage: firstMessage,
    });

  const assistantLabel = vapiAssistantLabel(businessName, receptionistName);
  let assistantId = details.vapi_assistant_id?.trim() ?? "";

  const voicePatch = {
    elevenlabsVoiceId: platformVoice.voiceId,
    elevenlabsVoiceModel: platformVoice.model,
  };

  if (!assistantId) {
    const created = await createMerchantVapiAssistant({
      assistantName: assistantLabel,
      firstMessage,
      systemPrompt,
      ...voicePatch,
    });
    if (!created.ok) return { ok: false, message: created.message };
    assistantId = created.assistantId;
  } else {
    const synced = await syncVapiAssistantConfig(assistantId, {
      assistantName: assistantLabel,
      firstMessage,
      systemPrompt,
      ...voicePatch,
    });
    if (!synced.ok) return { ok: false, message: synced.message };
  }

  const payload: VoiceReceptionistSaveInput = {
    ...details,
    agent_prompt_custom: systemPrompt,
    vapi_assistant_id: assistantId,
    vapi_assistant_name: assistantLabel,
    elevenlabs_voice_id: platformVoice.voiceId,
    elevenlabs_voice_name: "Solvio platform voice",
  };

  await saveVoiceReceptionistSetup(businessId, payload);

  revalidatePath("/dashboard/setup/voice");
  revalidatePath("/dashboard");

  return {
    ok: true,
    assistantId,
    message: "Your AI receptionist is saved and live in Vapi.",
  };
}
