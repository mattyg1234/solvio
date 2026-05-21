import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

/**
 * OpenAI cost rates (USD per 1M tokens). Keep this in sync with OpenAI's
 * pricing page — defaults to gpt-4o-mini if we see an unknown model.
 */
const MODEL_RATES_PER_1M_USD: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4-turbo": { input: 10, output: 30 },
  "o1-mini": { input: 1.1, output: 4.4 },
};

export type LlmUsageInput = {
  feature: string;
  model: string;
  businessId?: string | null;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null;
};

function estimateCostCents(model: string, promptTokens: number, completionTokens: number): number {
  const rate = MODEL_RATES_PER_1M_USD[model] ?? MODEL_RATES_PER_1M_USD["gpt-4o-mini"]!;
  const usd = (promptTokens / 1_000_000) * rate.input + (completionTokens / 1_000_000) * rate.output;
  return Math.max(0, Math.round(usd * 100));
}

/**
 * Fire-and-forget logger. We never want LLM-usage logging to fail a user
 * request, so all errors are swallowed; cost reporting will simply miss
 * those rows.
 */
export function logLlmUsage(input: LlmUsageInput): void {
  const u = input.usage;
  if (!u) return;
  const promptTokens = Number(u.prompt_tokens ?? 0);
  const completionTokens = Number(u.completion_tokens ?? 0);
  const totalTokens = Number(u.total_tokens ?? promptTokens + completionTokens);
  if (totalTokens === 0) return;

  const costCents = estimateCostCents(input.model, promptTokens, completionTokens);

  try {
    const admin = createSupabaseServiceRoleClient();
    void admin
      .from("solvio_llm_usage")
      .insert({
        business_id: input.businessId ?? null,
        feature: input.feature.slice(0, 60),
        model: input.model.slice(0, 60),
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
        cost_cents_estimated: costCents,
      })
      .then(() => {})
      .then(undefined, () => {});
  } catch {
    /* never throw from logging */
  }
}
