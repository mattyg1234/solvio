export type VoiceReceptionistDetails = {
  greeting_style: "warm" | "casual" | "luxury";
  /** Merchant-facing display name, e.g. "Riley" or "Front desk". */
  receptionist_name?: string;
  languages_note?: string;
  escalation_phone?: string;
  /** First utterance when the call connects (Vapi `firstMessage`). */
  agent_first_message?: string;
  reception_identity?: string;
  reception_scope?: string;
  caller_intake_priorities?: string;
  /** North-star outcome for each conversation */
  agent_goal?: string;
  /** Subjective pacing / empathy cues */
  conversation_feel?: string;
  /** Which outbound identity / pooled numbers callers see */
  outbound_number_note?: string;
  /** Full override prompt operators can paste */
  agent_prompt_custom?: string;
  elevenlabs_voice_id?: string;
  elevenlabs_voice_name?: string;
  /** Existing assistant on Solvio’s Vapi workspace (merchant selects from list). */
  vapi_assistant_id?: string;
  /** Human-readable assistant name from list (informational only). */
  vapi_assistant_name?: string;
};

/** Same shape as stored/review payload — API keys are platform-level env vars only */
export type VoiceReceptionistClientDetails = VoiceReceptionistDetails;

export type VoiceReceptionistSaveInput = VoiceReceptionistDetails;

export function voiceDetailsToClient(full: VoiceReceptionistDetails): VoiceReceptionistClientDetails {
  return full;
}

export function mergeVoiceReceptionistDetails(
  prevRow: Record<string, unknown>,
  input: VoiceReceptionistSaveInput,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...prevRow };

  merged.greeting_style = input.greeting_style;

  const optionalScalars = [
    "receptionist_name",
    "languages_note",
    "escalation_phone",
    "agent_first_message",
    "reception_identity",
    "reception_scope",
    "caller_intake_priorities",
    "agent_goal",
    "conversation_feel",
    "outbound_number_note",
    "agent_prompt_custom",
    "elevenlabs_voice_id",
    "elevenlabs_voice_name",
    "vapi_assistant_id",
    "vapi_assistant_name",
  ] as const satisfies readonly (keyof VoiceReceptionistSaveInput)[];

  for (const key of optionalScalars) {
    const val = input[key];
    if (val === undefined) continue;
    if (typeof val === "string" && val.trim() === "") {
      delete merged[key];
    } else {
      merged[key] = val;
    }
  }

  // Merchant-supplied keys removed — Solvio uses SOLVIO_* env vars only.
  delete merged.vapi_private_key;
  delete merged.elevenlabs_api_key;

  return merged;
}
