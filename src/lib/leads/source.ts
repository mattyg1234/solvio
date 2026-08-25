import { SolvioMapsLeadSource } from "./source-apify";
import { MockLeadSource } from "./source-mock";
import { OutscraperLeadSource } from "./source-outscraper";
import type { LeadSource } from "./types";

/**
 * Pick the data provider. Set LEAD_SOURCE_PROVIDER to force one; otherwise we
 * auto-select the best available real provider, falling back to the mock
 * provider so the tool always works (great for local dev + demos).
 *
 * Priority: Solvio Maps (our own Maps crawler) -> Outscraper -> mock.
 */
export function getLeadSource(): LeadSource {
  const forced = process.env.LEAD_SOURCE_PROVIDER?.trim().toLowerCase();
  const mapsToken = (process.env.SOLVIO_MAPS_API_TOKEN || process.env.APIFY_API_TOKEN)?.trim();
  const outscraperKey = process.env.OUTSCRAPER_API_KEY?.trim();

  if (forced === "mock") return new MockLeadSource();

  if (forced === "solvio-maps" || forced === "maps" || forced === "apify") {
    if (!mapsToken) throw new Error("Maps lead source forced but SOLVIO_MAPS_API_TOKEN is not set.");
    return new SolvioMapsLeadSource(mapsToken);
  }
  if (forced === "outscraper") {
    if (!outscraperKey) throw new Error("LEAD_SOURCE_PROVIDER=outscraper but OUTSCRAPER_API_KEY is not set.");
    return new OutscraperLeadSource(outscraperKey);
  }

  // Auto-select: prefer our own Maps crawler, then Outscraper, then mock.
  if (mapsToken) return new SolvioMapsLeadSource(mapsToken);
  if (outscraperKey) return new OutscraperLeadSource(outscraperKey);
  return new MockLeadSource();
}
