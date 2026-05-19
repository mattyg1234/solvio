/** Solvio-operated ElevenLabs + Vapi credentials (server-only). Never expose to the client. */

export function getSolvioElevenLabsApiKey(): string {
  return process.env.SOLVIO_ELEVENLABS_API_KEY?.trim() ?? "";
}

export function getSolvioVapiApiKey(): string {
  return process.env.SOLVIO_VAPI_API_KEY?.trim() ?? "";
}

/** OpenAI API key — optional; used for AI-drafted receptionist prompts in the dashboard only. Never expose client-side. */
export function getSolvioOpenAiApiKey(): string {
  return process.env.SOLVIO_OPENAI_API_KEY?.trim() ?? "";
}

/** OpenAI chat model handed to assistants we create in Vapi (must be enabled for your account). */
export function getVapiAgentOpenAiModel(): string {
  return process.env.SOLVIO_VAPI_AGENT_OPENAI_MODEL?.trim() || "gpt-4o-mini";
}

/** Anthropic model for merchant receptionist assistants (matches marketing stack when unset). */
export function getSolvioVapiAgentAnthropicModel(): string {
  return process.env.SOLVIO_VAPI_AGENT_ANTHROPIC_MODEL?.trim() || "claude-3-5-haiku-20241022";
}
