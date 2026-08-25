/**
 * Shared types for the lead-discovery (Maps lead finder) pipeline.
 *
 * Flow: LeadSource.search() -> NormalizedPlace[] -> qualify() -> ScoredPlace[]
 * -> stored in discovered_leads -> promoted into voice_outbound_leads.
 */

/** A business as returned by any data provider, normalised to one shape. */
export type NormalizedPlace = {
  placeId: string | null;
  name: string;
  category: string | null;
  phone: string | null;
  website: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  postcode: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  rating: number | null;
  reviewCount: number | null;
  /** Full untouched provider payload, kept for later re-processing. */
  raw: Record<string, unknown>;
};

/** Filters the operator sets on the search form. */
export type LeadSearchFilters = {
  /** Only keep businesses with no website at all. */
  onlyNoWebsite?: boolean;
  /** Drop anything below this Google rating. */
  minRating?: number;
  /** Require a phone number (needed for Solvio outbound calling). */
  requirePhone?: boolean;
  /** Hard cap on how many results to pull. */
  limit?: number;
};

export type LeadSearchInput = {
  query: string;
  location: string;
  filters: LeadSearchFilters;
};

/** One reason this business is (or isn't) a good Solvio prospect. */
export type FitSignal = {
  key: string;
  label: string;
  /** Points this signal contributes to the 0-100 fit score. */
  weight: number;
};

export type ScoredPlace = NormalizedPlace & {
  hasWebsite: boolean;
  fitScore: number;
  fitSignals: FitSignal[];
};

/** A pluggable data provider (mock, Outscraper, Google Places, ...). */
export interface LeadSource {
  readonly name: string;
  search(input: LeadSearchInput): Promise<NormalizedPlace[]>;
}
