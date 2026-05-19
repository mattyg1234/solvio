/** Server + client resolution for the marketing homepage live Vapi agent. */

export type MarketingVapiConfig = {
  publicKey: string;
  assistantId: string;
  /** From Vapi assistant profile when SOLVIO_VAPI_API_KEY is set. */
  firstMessage?: string | null;
  live: boolean;
};

function trimEnv(name: string): string {
  const v = process.env[name];
  return typeof v === "string" ? v.trim() : "";
}

/** Public key — must be in NEXT_PUBLIC_* for browser SDK. */
export function resolveMarketingVapiPublicKey(): string {
  return trimEnv("NEXT_PUBLIC_VAPI_PUBLIC_KEY");
}

/**
 * Assistant id — NEXT_PUBLIC for client bundle, or server-only fallback
 * (homepage passes id from server component as props).
 */
export function resolveMarketingVapiAssistantId(): string {
  return trimEnv("NEXT_PUBLIC_VAPI_ASSISTANT_ID") || trimEnv("SOLVIO_MARKETING_VAPI_ASSISTANT_ID");
}

export function marketingVapiIsLive(publicKey?: string, assistantId?: string): boolean {
  const pk = (publicKey ?? resolveMarketingVapiPublicKey()).trim();
  const aid = (assistantId ?? resolveMarketingVapiAssistantId()).trim();
  return Boolean(pk && aid);
}
