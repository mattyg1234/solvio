import { getVapiMarketingBootstrap } from "@/lib/vapi-marketing-bootstrap";
import {
  marketingVapiIsLive,
  type MarketingVapiConfig,
  resolveMarketingVapiAssistantId,
  resolveMarketingVapiPublicKey,
} from "@/lib/marketing-vapi-config";

/** SSR: public key, assistant id, and optional firstMessage loaded from your Vapi assistant. */
export async function loadMarketingVapiConfig(): Promise<MarketingVapiConfig> {
  const publicKey = resolveMarketingVapiPublicKey();
  const assistantId = resolveMarketingVapiAssistantId();
  const live = marketingVapiIsLive(publicKey, assistantId);

  let firstMessage: string | null = null;
  if (live && assistantId) {
    const boot = await getVapiMarketingBootstrap(assistantId);
    firstMessage = boot?.firstMessage ?? null;
  }

  return {
    publicKey,
    assistantId,
    firstMessage,
    live,
  };
}
