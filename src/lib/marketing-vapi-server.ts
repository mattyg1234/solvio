import {
  marketingVapiIsLive,
  type MarketingVapiConfig,
  resolveMarketingVapiAssistantId,
  resolveMarketingVapiPublicKey,
} from "@/lib/marketing-vapi-config";
import { SOLVIO_MARKETING_FIRST_MESSAGE } from "@/lib/solvio-marketing-receptionist";

/** SSR: load marketing voice config + Solvio receptionist opening line. */
export async function loadMarketingVapiConfig(): Promise<MarketingVapiConfig> {
  const publicKey = resolveMarketingVapiPublicKey();
  const assistantId = resolveMarketingVapiAssistantId();
  const live = marketingVapiIsLive(publicKey, assistantId);

  return {
    publicKey,
    assistantId,
    firstMessage: live ? SOLVIO_MARKETING_FIRST_MESSAGE : null,
    live,
  };
}
