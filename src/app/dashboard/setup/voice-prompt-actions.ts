"use server";

import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSolvioOpenAiApiKey } from "@/lib/voice-platform-env";

export type VoicePromptComposeFields = {
  businessName: string;
  receptionIdentity?: string;
  receptionScope?: string;
  callerIntakePriorities?: string;
  agentGoal?: string;
  conversationFeel?: string;
  outboundNumberNote?: string;
  greetingStyle?: string;
  languagesNote?: string;
  agentFirstMessage?: string;
};

/** Deterministic starter prompt — replaces manual drafting when merchants click Generate from brief. */
export async function composeVoiceAgentPromptAction(fields: VoicePromptComposeFields): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const tone = fields.greetingStyle ?? "warm";
  const lines = [
    `You are an AI voice assistant representing ${fields.businessName.trim() || "this business"} on phone calls.`,
    fields.agentFirstMessage?.trim()
      ? `Your scripted opening plays as structured audio first — stay aligned with its tone (concept): "${fields.agentFirstMessage.trim()}"`
      : null,
    fields.receptionIdentity?.trim() ? `Persona / introduction: ${fields.receptionIdentity.trim()}` : null,
    fields.agentGoal?.trim() ? `Primary goal on every call: ${fields.agentGoal.trim()}` : null,
    fields.receptionScope?.trim() ? `What you handle: ${fields.receptionScope.trim()}` : null,
    fields.callerIntakePriorities?.trim()
      ? `Information you must capture before transferring or ending: ${fields.callerIntakePriorities.trim()}`
      : null,
    fields.languagesNote?.trim() ? `Language policy: ${fields.languagesNote.trim()}` : null,
    fields.conversationFeel?.trim()
      ? `Conversation style: ${fields.conversationFeel.trim()}`
      : `Conversation style cues: ${tone} professional pacing; concise sentences; mirror caller energy.`,
    fields.outboundNumberNote?.trim()
      ? `Caller ID / outbound numbers policy: ${fields.outboundNumberNote.trim()}`
      : null,
    `Never invent discounts or bookings you cannot fulfil—offer to escalate if unsure.`,
    `Confirm spelling for names and repeat phone numbers digit-by-digit before hanging up.`,
  ];

  return lines.filter(Boolean).join("\n\n");
}

/** GPT-drafted receptionist prompt (requires SOLVIO_OPENAI_API_KEY on the deployment). */
export async function generateVoiceAgentPromptOpenAIAction(
  fields: VoicePromptComposeFields,
): Promise<{ ok: true; text: string } | { ok: false; message: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const apiKey = getSolvioOpenAiApiKey();
  if (!apiKey) {
    return {
      ok: false,
      message:
        "Add SOLVIO_OPENAI_API_KEY to Solvio server env (.env.local or host) — we keep merchant keys off the dashboard.",
    };
  }

  const userPayload = [
    `Business name: ${fields.businessName.trim() || "(unknown)"}`,
    fields.agentFirstMessage?.trim()
      ? `Desired first spoken line vibe (opening): ${fields.agentFirstMessage.trim()}`
      : null,
    fields.receptionIdentity?.trim() ? `Who they are: ${fields.receptionIdentity.trim()}` : null,
    fields.receptionScope?.trim() ? `What they do on calls: ${fields.receptionScope.trim()}` : null,
    fields.callerIntakePriorities?.trim()
      ? `Caller intake checklist: ${fields.callerIntakePriorities.trim()}`
      : null,
    fields.agentGoal?.trim() ? `Goal on each call: ${fields.agentGoal.trim()}` : null,
    fields.conversationFeel?.trim() ? `How conversations should feel: ${fields.conversationFeel.trim()}` : null,
    fields.languagesNote?.trim() ? `Languages: ${fields.languagesNote.trim()}` : null,
    fields.outboundNumberNote?.trim() ? `Outbound / caller-ID notes: ${fields.outboundNumberNote.trim()}` : null,
    `Greeting style tag: ${fields.greetingStyle ?? "warm"}`,
    "",
    "Produce a complete system prompt (plain text) for this voice AI phone receptionist.",
    "Structure with clear headings: Role, Personality & Tone, Conversation flow, Required information capture, Boundaries / escalation when unsure, Closing.",
    "Keep instructions practical for realtime phone calls — short sentences, no markdown tables.",
    "Do not invent business hours or policies not implied above.",
  ]
    .filter(Boolean)
    .join("\n");

  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.5,
        messages: [
          {
            role: "system",
            content:
              "You write production-ready system prompts for Vapi/OpenAIRealtime-style phone receptionists. Output only the system prompt body, no preamble.",
          },
          { role: "user", content: userPayload },
        ],
      }),
    });
  } catch {
    return { ok: false, message: "Could not reach OpenAI — try again shortly." };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, message: "Unexpected OpenAI response." };
  }

  if (!res.ok) {
    const msg =
      typeof body === "object" && body !== null && "error" in body && typeof (body as { error?: { message?: string } }).error?.message === "string"
        ? (body as { error: { message: string } }).error.message
        : `OpenAI returned ${res.status}.`;
    return { ok: false, message: msg };
  }

  const choices =
    typeof body === "object" && body !== null && "choices" in body && Array.isArray((body as { choices: unknown }).choices)
      ? (body as { choices: { message?: { content?: string } }[] }).choices
      : [];
  const content = typeof choices[0]?.message?.content === "string" ? choices[0].message.content.trim() : "";
  if (!content) {
    return { ok: false, message: "OpenAI returned an empty draft — tweak your brief and retry." };
  }
  return { ok: true, text: content };
}
