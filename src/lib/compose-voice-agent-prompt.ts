export type VoicePromptComposeFields = {
  businessName: string;
  receptionistName?: string;
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

/** Deterministic system prompt from merchant brief fields. */
export function composeVoiceAgentPrompt(fields: VoicePromptComposeFields): string {
  const tone = fields.greetingStyle ?? "warm";
  const displayName = fields.receptionistName?.trim() || fields.receptionIdentity?.trim();

  const lines = [
    displayName
      ? `You are ${displayName}, an AI voice receptionist representing ${fields.businessName.trim() || "this business"} on phone and web calls.`
      : `You are an AI voice receptionist representing ${fields.businessName.trim() || "this business"} on phone and web calls.`,
    fields.agentFirstMessage?.trim()
      ? `Your scripted opening plays first — stay aligned with its tone: "${fields.agentFirstMessage.trim()}"`
      : null,
    fields.receptionIdentity?.trim() && fields.receptionIdentity.trim() !== displayName
      ? `Persona: ${fields.receptionIdentity.trim()}`
      : null,
    fields.agentGoal?.trim() ? `Primary goal on every call: ${fields.agentGoal.trim()}` : null,
    fields.receptionScope?.trim() ? `What you handle: ${fields.receptionScope.trim()}` : null,
    fields.callerIntakePriorities?.trim()
      ? `Information you must capture before transferring or ending: ${fields.callerIntakePriorities.trim()}`
      : null,
    fields.languagesNote?.trim()
      ? `Language policy: ${fields.languagesNote.trim()}`
      : `Language policy: You are fluent in English and Spanish (including Canarian and peninsular accents). Detect the caller's language from their first words and respond in that same language. If they switch mid-call, switch with them — never force a language on the caller.`,
    fields.conversationFeel?.trim()
      ? `Conversation style: ${fields.conversationFeel.trim()}`
      : `Conversation style: ${tone} professional pacing; concise sentences; mirror caller energy.`,
    fields.outboundNumberNote?.trim()
      ? `Caller ID / outbound numbers policy: ${fields.outboundNumberNote.trim()}`
      : null,
    `Never invent discounts, availability, or bookings you cannot fulfil — offer to escalate if unsure.`,
    `The caller's number is already on record from caller ID — you do NOT need them to dictate it. If the caller says "ring me on this number", "use this one", "the number I'm calling from", or similar, accept that and silently save their caller-ID number as the contact. Only ask for a different number if they explicitly want to be reached on a separate line.`,
    `Confirm spelling for names. Only repeat a phone number digit-by-digit when the caller dictated a different number from the one they're calling from — never make them recite their own number back to you.`,
  ];

  return lines.filter(Boolean).join("\n\n");
}
