"use server";

import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type VoicePromptComposeFields = {
  businessName: string;
  receptionIdentity?: string;
  receptionScope?: string;
  callerIntakePriorities?: string;
  agentGoal?: string;
  conversationFeel?: string;
  outboundNumberNote?: string;
  greetingStyle?: string;
};

/** Deterministic starter prompt — replaces manual drafting when merchants click Generate. */
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
    fields.receptionIdentity?.trim() ? `Persona / introduction: ${fields.receptionIdentity.trim()}` : null,
    fields.agentGoal?.trim() ? `Primary goal on every call: ${fields.agentGoal.trim()}` : null,
    fields.receptionScope?.trim() ? `What you handle: ${fields.receptionScope.trim()}` : null,
    fields.callerIntakePriorities?.trim()
      ? `Information you must capture before transferring or ending: ${fields.callerIntakePriorities.trim()}`
      : null,
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
