/** Solvio-operated ElevenLabs + Vapi credentials (server-only). Never expose to the client. */

export function getSolvioElevenLabsApiKey(): string {
  return process.env.SOLVIO_ELEVENLABS_API_KEY?.trim() ?? "";
}

export function getSolvioVapiApiKey(): string {
  return process.env.SOLVIO_VAPI_API_KEY?.trim() ?? "";
}
