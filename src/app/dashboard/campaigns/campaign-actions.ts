"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { judgeCallAgainstCriteria, type JudgeVerdict } from "@/lib/call-success-judge";
import {
  buildCampaignFirstMessage,
  buildCampaignSystemPrompt,
  type CampaignIntakeFields,
} from "@/lib/campaign-prompt-builder";
import { resolvePlatformElevenLabsVoice } from "@/lib/platform-voice-config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createMerchantVapiAssistant,
  syncVapiAssistantConfig,
} from "@/lib/vapi-assistant-sync";
import { getSolvioOpenAiApiKey } from "@/lib/voice-platform-env";

export type CampaignSaveInput = {
  campaignId?: string;
  businessId: string;
  businessName: string;
  name: string;
  agentName?: string;
  greetingStyle?: "warm" | "casual" | "luxury";
  firstMessage?: string;
  systemPrompt?: string;
  successCriteria?: string;
  /** Which fields the agent should actively try to capture on each call. */
  intakeFields?: CampaignIntakeFields;
};

export type { CampaignIntakeFields };

export type CampaignSaveResult =
  | { ok: true; campaignId: string; assistantId: string; message: string }
  | { ok: false; message: string };

async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

async function assertOwnedBusiness(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, businessId: string, userId: string) {
  const { data: biz } = await supabase
    .from("businesses")
    .select("id,name,campaigns_enabled")
    .eq("id", businessId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (!biz) throw new Error("Business not found.");
  return biz;
}

function vapiCampaignLabel(businessName: string, campaignName: string, agentName?: string): string {
  const biz = businessName.trim() || "Venue";
  const camp = campaignName.trim() || "Outreach";
  const agent = agentName?.trim() || "";
  return agent ? `${biz} · ${camp} · ${agent}` : `${biz} · ${camp}`;
}

export async function upsertCampaignAction(input: CampaignSaveInput): Promise<CampaignSaveResult> {
  const { supabase, user } = await requireUser();

  try {
    const biz = await assertOwnedBusiness(supabase, input.businessId, user.id);
    if (!biz.campaigns_enabled) {
      return { ok: false, message: "Enable Campaigns first on the /dashboard/campaigns page." };
    }

    const name = input.name.trim();
    if (name.length < 2) {
      return { ok: false, message: "Campaign name must be at least 2 characters." };
    }

    const platformVoice = await resolvePlatformElevenLabsVoice();
    if (!platformVoice.voiceId) {
      return {
        ok: false,
        message: "Platform voice not configured (SOLVIO_PLATFORM_ELEVENLABS_VOICE_ID).",
      };
    }

    const basePrompt =
      input.systemPrompt?.trim() ||
      "You are a friendly outbound agent. Introduce yourself politely, state who you are calling on behalf of, ask the questions in the success criteria, and thank them for their time.";
    const systemPrompt = buildCampaignSystemPrompt({
      basePrompt,
      businessName: input.businessName,
      agentName: input.agentName,
      intakeFields: input.intakeFields,
    });
    const firstMessage =
      input.firstMessage?.trim() ||
      buildCampaignFirstMessage({
        agentName: input.agentName,
        businessName: input.businessName,
        goal: input.successCriteria,
      });
    const assistantLabel = vapiCampaignLabel(input.businessName, name, input.agentName);

    let campaignId = input.campaignId?.trim() || "";
    let assistantId = "";

    if (campaignId) {
      // Update path
      const { data: existing, error: fetchErr } = await supabase
        .from("voice_campaigns")
        .select("id, vapi_assistant_id")
        .eq("id", campaignId)
        .eq("business_id", input.businessId)
        .maybeSingle();
      if (fetchErr) return { ok: false, message: fetchErr.message };
      if (!existing) return { ok: false, message: "Campaign not found." };

      assistantId = existing.vapi_assistant_id ?? "";
      if (assistantId) {
        const syncRes = await syncVapiAssistantConfig(assistantId, {
          assistantName: assistantLabel,
          firstMessage,
          systemPrompt,
          elevenlabsVoiceId: platformVoice.voiceId,
        });
        if (!syncRes.ok) return { ok: false, message: syncRes.message };
      } else {
        const createRes = await createMerchantVapiAssistant({
          assistantName: assistantLabel,
          firstMessage,
          systemPrompt,
          elevenlabsVoiceId: platformVoice.voiceId,
        });
        if (!createRes.ok) return { ok: false, message: createRes.message };
        assistantId = createRes.assistantId;
      }

      const { error: updErr } = await supabase
        .from("voice_campaigns")
        .update({
          name,
          agent_name: input.agentName?.trim() || null,
          vapi_voice_id: platformVoice.voiceId,
          greeting_style: input.greetingStyle ?? null,
          first_message: firstMessage,
          system_prompt: systemPrompt,
          success_criteria: input.successCriteria?.trim() || null,
          vapi_assistant_id: assistantId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", campaignId)
        .eq("business_id", input.businessId);
      if (updErr) return { ok: false, message: updErr.message };
    } else {
      // Create path — Vapi first, then DB row
      const createRes = await createMerchantVapiAssistant({
        assistantName: assistantLabel,
        firstMessage,
        systemPrompt,
        elevenlabsVoiceId: platformVoice.voiceId,
      });
      if (!createRes.ok) return { ok: false, message: createRes.message };
      assistantId = createRes.assistantId;

      const { data: inserted, error: insErr } = await supabase
        .from("voice_campaigns")
        .insert({
          business_id: input.businessId,
          name,
          agent_name: input.agentName?.trim() || null,
          vapi_voice_id: platformVoice.voiceId,
          greeting_style: input.greetingStyle ?? null,
          first_message: firstMessage,
          system_prompt: systemPrompt,
          success_criteria: input.successCriteria?.trim() || null,
          vapi_assistant_id: assistantId,
          status: "draft",
        })
        .select("id")
        .single();
      if (insErr || !inserted) return { ok: false, message: insErr?.message ?? "Could not save campaign." };
      campaignId = inserted.id;
    }

    revalidatePath("/dashboard/campaigns");
    revalidatePath(`/dashboard/campaigns/${campaignId}`);

    return {
      ok: true,
      campaignId,
      assistantId,
      message: "Campaign saved. Test it below to make sure the agent sounds right.",
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not save campaign." };
  }
}

/** Score a test-call transcript against the campaign's success criteria — purely advisory, no credits touched. */
export async function judgeTestCallAction(input: {
  campaignId: string;
  transcript: string;
}): Promise<
  | { ok: true; verdict: JudgeVerdict; reasoning: string }
  | { ok: false; message: string }
> {
  const { supabase, user } = await requireUser();
  const { data: c } = await supabase
    .from("voice_campaigns")
    .select("id, business_id, success_criteria")
    .eq("id", input.campaignId)
    .maybeSingle();
  if (!c) return { ok: false, message: "Campaign not found." };
  await assertOwnedBusiness(supabase, c.business_id, user.id);

  const transcript = input.transcript.trim();
  if (transcript.length < 20) {
    return { ok: false, message: "Transcript too short to judge — speak with the agent for a bit, then end the call." };
  }

  const judge = await judgeCallAgainstCriteria({
    successCriteria: c.success_criteria ?? "",
    transcript,
  });
  if (!judge.ok) return { ok: false, message: judge.message };
  return { ok: true, verdict: judge.verdict, reasoning: judge.reasoning };
}

export async function deleteCampaignAction(businessId: string, campaignId: string) {
  const { supabase, user } = await requireUser();
  await assertOwnedBusiness(supabase, businessId, user.id);
  const { error } = await supabase
    .from("voice_campaigns")
    .delete()
    .eq("id", campaignId)
    .eq("business_id", businessId);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/campaigns");
}

/** Refine an existing campaign prompt with GPT — used by the in-form "Improve with ChatGPT" button. */
export async function improveCampaignPromptAction(input: {
  businessName: string;
  campaignName: string;
  agentName?: string;
  draftPrompt?: string;
  successCriteria?: string;
  goal?: string;
  intakeFields?: CampaignIntakeFields;
}): Promise<{ ok: true; text: string } | { ok: false; message: string }> {
  await requireUser();
  const apiKey = getSolvioOpenAiApiKey();
  if (!apiKey) {
    return {
      ok: false,
      message: "Add SOLVIO_OPENAI_API_KEY to the deployment env to enable prompt drafting.",
    };
  }

  const userMsg = [
    `Business: ${input.businessName}`,
    `Campaign name: ${input.campaignName}`,
    input.agentName?.trim() ? `Agent name: ${input.agentName.trim()}` : null,
    input.successCriteria?.trim() ? `Success criteria for each call: ${input.successCriteria.trim()}` : null,
    input.goal?.trim() ? `Bigger campaign goal: ${input.goal.trim()}` : null,
    input.draftPrompt?.trim() ? `\nCURRENT DRAFT (refine this):\n${input.draftPrompt.trim()}` : null,
    "",
    "Write the CORE system prompt for an outbound voice agent (Role, Personality & tone, Conversation flow, Closing). Do NOT include intake capture or boundary sections — those are appended automatically. Keep sentences short and conversational. Do not invent business specifics not given above.",
  ]
    .filter(Boolean)
    .join("\n");

  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.6,
        messages: [
          {
            role: "system",
            content:
              "You write production-ready system prompts for outbound AI phone agents. Output only the system prompt body, no preamble or commentary.",
          },
          { role: "user", content: userMsg },
        ],
      }),
    });
  } catch {
    return { ok: false, message: "Could not reach OpenAI — try again shortly." };
  }

  if (!res.ok) {
    return { ok: false, message: `OpenAI returned ${res.status}.` };
  }
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = body.choices?.[0]?.message?.content?.trim() ?? "";
  if (!raw) return { ok: false, message: "OpenAI returned an empty draft." };

  // Wrap the GPT-generated core with our standardised intake + boundary section
  const text = buildCampaignSystemPrompt({
    basePrompt: raw,
    businessName: input.businessName,
    agentName: input.agentName,
    intakeFields: input.intakeFields,
  });
  return { ok: true, text };
}
