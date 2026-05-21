"use server";

import { redirect } from "next/navigation";

import {
  composeVoiceAgentPrompt,
  type VoicePromptComposeFields,
} from "@/lib/compose-voice-agent-prompt";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSolvioOpenAiApiKey } from "@/lib/voice-platform-env";

/** Deterministic starter prompt — replaces manual drafting when merchants click Generate from brief. */
export async function composeVoiceAgentPromptAction(fields: VoicePromptComposeFields): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  return composeVoiceAgentPrompt(fields);
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
    fields.receptionistName?.trim() ? `Receptionist name: ${fields.receptionistName.trim()}` : null,
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

export type ExtractedReceptionistFields = {
  receptionist_name?: string;
  agent_first_message?: string;
  reception_scope?: string;
  caller_intake_priorities?: string;
  agent_goal?: string;
  languages_note?: string;
  greeting_style?: "warm" | "casual" | "luxury";
};

/**
 * Brain-dump → structured fields. Merchant pastes (or dictates) a rough description
 * of their business and what they want the receptionist to do; GPT extracts the
 * structured fields the studio form expects, so the merchant can review and tweak
 * instead of starting from a blank form.
 */
export async function extractReceptionistFromBriefAction(input: {
  businessName: string;
  brief: string;
}): Promise<{ ok: true; fields: ExtractedReceptionistFields } | { ok: false; message: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const brief = input.brief.trim();
  if (brief.length < 10) {
    return { ok: false, message: "Add a bit more — tell us what your business does and what you'd like the receptionist to handle." };
  }

  const apiKey = getSolvioOpenAiApiKey();
  if (!apiKey) {
    return {
      ok: false,
      message: "AI generation isn't configured on this deployment. Contact Solvio support.",
    };
  }

  const systemPrompt = [
    "You translate a rough merchant brief into a structured config for a phone-receptionist AI.",
    "Read the brief carefully and return a JSON object with these fields (omit any you can't infer):",
    "- receptionist_name: a short first name for the AI agent (e.g. 'Riley', 'Sam'). Pick something neutral if not specified.",
    "- agent_first_message: 1–2 short sentences the receptionist says when picking up the call. Friendly and natural.",
    "- reception_scope: 1–3 sentences describing what the receptionist should handle on calls (bookings, hours, FAQs, etc).",
    "- caller_intake_priorities: comma-separated list of details the receptionist must capture from every caller (name, party size, date, etc).",
    "- agent_goal: one sentence — the north-star outcome of each call (e.g. 'Confirm a booking or capture a callback request').",
    "- languages_note: language(s) the receptionist should default to. Defaults to English if not mentioned.",
    "- greeting_style: one of 'warm', 'casual', 'luxury' based on the brief's tone. Default 'warm'.",
    "Be concise and practical — these go directly into a phone-call prompt, not marketing copy.",
    "Return strict JSON only — no commentary, no markdown fences.",
  ].join("\n");

  const userPayload = `Business name: ${input.businessName.trim() || "(unspecified)"}\n\nMerchant brief:\n${brief}`;

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
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPayload },
        ],
      }),
    });
  } catch {
    return { ok: false, message: "Couldn't reach the AI service — try again shortly." };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, message: "Unexpected response from the AI service." };
  }

  if (!res.ok) {
    const msg =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof (body as { error?: { message?: string } }).error?.message === "string"
        ? (body as { error: { message: string } }).error.message
        : `AI service returned ${res.status}.`;
    return { ok: false, message: msg };
  }

  const choices =
    typeof body === "object" && body !== null && "choices" in body && Array.isArray((body as { choices: unknown }).choices)
      ? (body as { choices: { message?: { content?: string } }[] }).choices
      : [];
  const content = typeof choices[0]?.message?.content === "string" ? choices[0].message.content.trim() : "";
  if (!content) return { ok: false, message: "AI returned an empty draft — add more detail and retry." };

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { ok: false, message: "AI returned malformed JSON. Try again — usually transient." };
  }

  if (!parsed || typeof parsed !== "object") {
    return { ok: false, message: "AI returned an unexpected shape." };
  }

  const raw = parsed as Record<string, unknown>;
  const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const greeting = str(raw.greeting_style);
  const fields: ExtractedReceptionistFields = {
    receptionist_name: str(raw.receptionist_name),
    agent_first_message: str(raw.agent_first_message),
    reception_scope: str(raw.reception_scope),
    caller_intake_priorities: str(raw.caller_intake_priorities),
    agent_goal: str(raw.agent_goal),
    languages_note: str(raw.languages_note),
    greeting_style:
      greeting === "warm" || greeting === "casual" || greeting === "luxury" ? greeting : undefined,
  };

  return { ok: true, fields };
}
