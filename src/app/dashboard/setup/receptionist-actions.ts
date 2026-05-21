"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { saveVoiceReceptionistSetup } from "@/app/dashboard/setup/actions";
import { judgeCallAgainstCriteria, type JudgeVerdict } from "@/lib/call-success-judge";
import { composeVoiceAgentPrompt } from "@/lib/compose-voice-agent-prompt";
import { resolvePlatformElevenLabsVoice } from "@/lib/platform-voice-config";
import {
  appendBookingContextToPrompt,
  bookingFlowKindLabel,
  type ReceptionistBookingContext,
} from "@/lib/receptionist-booking-context";
import type { VoiceReceptionistSaveInput } from "@/lib/voice-receptionist";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site-url";
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

function parseGuestBookingModes(raw: unknown): string[] {
  if (!raw || typeof raw !== "object") return [];
  const modes = (raw as Record<string, unknown>).guest_booking_modes;
  if (!Array.isArray(modes)) return [];
  return modes.filter((m): m is string => typeof m === "string");
}

async function loadBookingContext(businessId: string): Promise<ReceptionistBookingContext> {
  const supabase = await createSupabaseServerClient();
  const { data: biz } = await supabase
    .from("businesses")
    .select("booking_slug,booking_flow_kind,booking_flow_details")
    .eq("id", businessId)
    .maybeSingle();

  const slug = typeof biz?.booking_slug === "string" ? biz.booking_slug.trim() : "";
  const siteUrl = (await getSiteUrl()).replace(/\/$/, "");
  const publicBookingUrl = slug ? `${siteUrl}/book/${encodeURIComponent(slug)}` : null;

  return {
    publicBookingUrl,
    bookingFlowLabel: bookingFlowKindLabel(
      typeof biz?.booking_flow_kind === "string" ? biz.booking_flow_kind : null,
    ),
    guestBookingModes: parseGuestBookingModes(biz?.booking_flow_details),
  };
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

  const bookingContext = await loadBookingContext(businessId);

  const basePrompt =
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

  const systemPrompt = appendBookingContextToPrompt(basePrompt, bookingContext);

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
    message: bookingContext.publicBookingUrl
      ? "Saved — tap the purple mic and pretend to book a table. Real bookings land on your public page or in Dashboard → Bookings after guests submit."
      : "Saved — tap the purple mic to role-play a call. Publish a booking link under Bookings to connect voice with your live table page.",
  };
}

/** Score a receptionist test-call transcript against the merchant's "what they should do" config. */
export async function judgeReceptionistTestCallAction(input: {
  businessId: string;
  transcript: string;
}): Promise<
  | { ok: true; verdict: JudgeVerdict; reasoning: string }
  | { ok: false; message: string }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: biz } = await supabase
    .from("businesses")
    .select("id, voice_receptionist_details")
    .eq("id", input.businessId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!biz) return { ok: false, message: "Business not found." };

  const details =
    biz.voice_receptionist_details && typeof biz.voice_receptionist_details === "object"
      ? (biz.voice_receptionist_details as Record<string, unknown>)
      : {};

  const scope = typeof details.reception_scope === "string" ? details.reception_scope.trim() : "";
  const intake = typeof details.caller_intake_priorities === "string" ? details.caller_intake_priorities.trim() : "";
  const goal = typeof details.agent_goal === "string" ? details.agent_goal.trim() : "";

  const successCriteria = [
    scope ? `Receptionist should: ${scope}` : null,
    intake ? `Must capture: ${intake}` : null,
    goal ? `Goal each call: ${goal}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const transcript = input.transcript.trim();
  if (transcript.length < 20) {
    return { ok: false, message: "Transcript too short — chat with the agent a bit longer then end the call." };
  }

  const judge = await judgeCallAgainstCriteria({
    successCriteria: successCriteria || "(no explicit criteria — judge if the receptionist sounded professional, handled the request, and ended the call cleanly)",
    transcript,
  });
  if (!judge.ok) return { ok: false, message: judge.message };
  return { ok: true, verdict: judge.verdict, reasoning: judge.reasoning };
}
