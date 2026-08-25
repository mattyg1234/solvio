import type { LeadSearchInput, LeadSource, NormalizedPlace } from "./types";

/**
 * Outscraper "Google Maps Search" provider.
 * Docs: https://app.outscraper.com/api-docs#tag/Google-Maps
 *
 * Returns business data INCLUDING emails (Outscraper visits the site for you),
 * so it's the fastest path to parity with off-the-shelf maps lead extractors —
 * no proxy/block maintenance on our side.
 *
 * Requires OUTSCRAPER_API_KEY. The async API can take a while for large pulls;
 * we request synchronous results with `async=false` and a modest limit.
 */

const ENDPOINT = "https://api.app.outscraper.com/maps/search-v3";

type OutscraperPlace = {
  place_id?: string;
  name?: string;
  type?: string;
  category?: string;
  phone?: string;
  site?: string;
  email_1?: string;
  full_address?: string;
  city?: string;
  postal_code?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  rating?: number;
  reviews?: number;
  [k: string]: unknown;
};

function pickEmail(p: OutscraperPlace): string | null {
  for (const key of ["email_1", "email_2", "email_3"]) {
    const v = p[key];
    if (typeof v === "string" && v.includes("@")) return v;
  }
  return null;
}

export class OutscraperLeadSource implements LeadSource {
  readonly name = "outscraper";

  constructor(private readonly apiKey: string) {}

  async search(input: LeadSearchInput): Promise<NormalizedPlace[]> {
    const limit = Math.min(input.filters.limit ?? 50, 200);
    const url = new URL(ENDPOINT);
    url.searchParams.set("query", `${input.query} in ${input.location}`);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("async", "false");
    // Ask Outscraper to also resolve contact emails from each site.
    url.searchParams.set("enrichment", "domains_service");

    const res = await fetch(url, {
      headers: { "X-API-KEY": this.apiKey },
      // Synchronous pulls can be slow; give it room.
      signal: AbortSignal.timeout(110_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Outscraper ${res.status}: ${body.slice(0, 300)}`);
    }

    const json = (await res.json()) as { data?: OutscraperPlace[][] | OutscraperPlace[] };
    // search-v3 returns data as an array of result-sets (one per query).
    const flat: OutscraperPlace[] = Array.isArray(json.data?.[0])
      ? (json.data as OutscraperPlace[][]).flat()
      : ((json.data as OutscraperPlace[]) ?? []);

    return flat.map((p) => ({
      placeId: p.place_id ?? null,
      name: p.name ?? "Unknown",
      category: p.category ?? p.type ?? null,
      phone: p.phone ?? null,
      website: p.site ?? null,
      email: pickEmail(p),
      address: p.full_address ?? null,
      city: p.city ?? null,
      postcode: p.postal_code ?? null,
      country: p.country ?? null,
      lat: typeof p.latitude === "number" ? p.latitude : null,
      lng: typeof p.longitude === "number" ? p.longitude : null,
      rating: typeof p.rating === "number" ? p.rating : null,
      reviewCount: typeof p.reviews === "number" ? p.reviews : null,
      raw: p as Record<string, unknown>,
    }));
  }
}
