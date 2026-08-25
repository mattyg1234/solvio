import type { LeadSearchInput, LeadSource, NormalizedPlace } from "./types";

/**
 * Solvio Maps lead source — Solvio's own Google-Maps business discovery.
 *
 * Internally this runs a hosted Maps crawler (the same engine that powers
 * Solvio's CloseMate lead finder). The provider is deliberately unbranded:
 * nothing here is shown to the user, and the internal `name` is "solvio-maps"
 * so no third-party vendor ever appears in the UI or the database.
 *
 * Targets businesses with NO website by default (the strongest Solvio
 * prospect), and pulls phone, rating, reviews, category and address so the
 * qualifier can score each lead.
 *
 * Gated by SOLVIO_MAPS_API_TOKEN (falls back to APIFY_API_TOKEN for the
 * existing key). Runs synchronously and returns the dataset items directly.
 */

const ACTOR = "compass~crawler-google-places";
const ENDPOINT = `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items`;

type MapsPlace = {
  title?: string;
  name?: string;
  phone?: string;
  phoneUnformatted?: string;
  website?: string;
  categoryName?: string;
  categories?: string[];
  address?: string;
  city?: string;
  postalCode?: string;
  countryCode?: string;
  country?: string;
  location?: { lat?: number; lng?: number };
  totalScore?: number;
  reviewsCount?: number;
  reviews?: number;
  placeId?: string;
  url?: string;
  emails?: string[];
  [k: string]: unknown;
};

function pickEmail(p: MapsPlace): string | null {
  const list = Array.isArray(p.emails) ? p.emails : [];
  for (const v of list) {
    if (typeof v === "string" && v.includes("@")) return v;
  }
  return null;
}

export class SolvioMapsLeadSource implements LeadSource {
  readonly name = "solvio-maps";

  constructor(private readonly apiToken: string) {}

  async search(input: LeadSearchInput): Promise<NormalizedPlace[]> {
    const limit = Math.min(input.filters.limit ?? 50, 200);
    const query = /\bin\b/i.test(input.query)
      ? input.query
      : `${input.query} in ${input.location}`;

    const body: Record<string, unknown> = {
      searchStringsArray: [query],
      maxCrawledPlacesPerSearch: limit,
      language: "en",
      locationQuery: input.location,
      skipClosedPlaces: true,
      scrapePlaceDetailPage: true,
    };
    // Only narrow to no-website businesses when the operator asked for it,
    // so a general search still returns everything.
    if (input.filters.onlyNoWebsite) {
      body.website = "withoutWebsite";
    }

    const res = await fetch(`${ENDPOINT}?timeout=300`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiToken}`,
      },
      body: JSON.stringify(body),
      // Synchronous scrapes can take a while; give it room.
      signal: AbortSignal.timeout(290_000),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      // Never surface the provider name in the thrown message.
      throw new Error(`Lead search failed (${res.status}): ${detail.slice(0, 200)}`);
    }

    const places = (await res.json()) as MapsPlace[];
    if (!Array.isArray(places)) return [];

    return places
      .filter((p) => (p.title || p.name))
      .map((p) => ({
        placeId: p.placeId ?? null,
        name: (p.title || p.name) as string,
        category: p.categoryName ?? p.categories?.[0] ?? null,
        phone: p.phone ?? p.phoneUnformatted ?? null,
        website: p.website ?? null,
        email: pickEmail(p),
        address: p.address ?? null,
        city: p.city ?? null,
        postcode: p.postalCode ?? null,
        country: p.country ?? p.countryCode ?? null,
        lat: typeof p.location?.lat === "number" ? p.location.lat : null,
        lng: typeof p.location?.lng === "number" ? p.location.lng : null,
        rating: typeof p.totalScore === "number" ? p.totalScore : null,
        reviewCount:
          typeof p.reviewsCount === "number"
            ? p.reviewsCount
            : typeof p.reviews === "number"
              ? p.reviews
              : null,
        raw: p as Record<string, unknown>,
      }));
  }
}
