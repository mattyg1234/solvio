import { getVapiMarketingBootstrap } from "@/lib/vapi-marketing-bootstrap";
import type { MarketingLocale } from "@/lib/marketing-locale";
import {
  marketingVapiIsLive,
  type MarketingVapiConfig,
  resolveMarketingVapiAssistantId,
  resolveMarketingVapiPublicKey,
  resolveSalesVapiAssistantId,
} from "@/lib/marketing-vapi-config";

/** SSR: public key, assistant id, and optional firstMessage loaded from your Vapi assistant. */
export async function loadMarketingVapiConfig(locale?: MarketingLocale): Promise<MarketingVapiConfig> {
  const publicKey = resolveMarketingVapiPublicKey();
  const assistantId = resolveMarketingVapiAssistantId(locale);
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

/** SSR: sales agent config (separate assistant from the receptionist demo). */
export async function loadSalesVapiConfig(): Promise<MarketingVapiConfig> {
  const publicKey = resolveMarketingVapiPublicKey();
  const assistantId = resolveSalesVapiAssistantId();
  const live = marketingVapiIsLive(publicKey, assistantId);

  let firstMessage: string | null = null;
  if (live && assistantId) {
    const boot = await getVapiMarketingBootstrap(assistantId);
    firstMessage = boot?.firstMessage ?? null;
  }

  return { publicKey, assistantId, firstMessage, live };
}
