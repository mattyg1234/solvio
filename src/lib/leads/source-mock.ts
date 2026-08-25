import type { LeadSearchInput, LeadSource, NormalizedPlace } from "./types";

/**
 * Mock data provider. Returns realistic Spanish-hospitality businesses so the
 * lead finder works end-to-end before any paid provider key is configured.
 * Deterministic (no randomness) so search runs are reproducible.
 */

const SAMPLE: Omit<NormalizedPlace, "raw">[] = [
  {
    placeId: "mock-1",
    name: "Bar La Esquina",
    category: "Tapas bar",
    phone: "+34 961 234 567",
    website: null, // no website -> strong Solvio prospect
    email: null,
    address: "Carrer de Russafa 12",
    city: "Valencia",
    postcode: "46004",
    country: "Spain",
    lat: 39.46,
    lng: -0.37,
    rating: 4.6,
    reviewCount: 318,
  },
  {
    placeId: "mock-2",
    name: "Hostal Marítimo",
    category: "Guest house",
    phone: "+34 952 887 110",
    website: "http://hostalmaritimo.es", // http, no booking -> medium prospect
    email: null,
    address: "Paseo Marítimo 4",
    city: "Málaga",
    postcode: "29016",
    country: "Spain",
    lat: 36.72,
    lng: -4.41,
    rating: 4.1,
    reviewCount: 92,
  },
  {
    placeId: "mock-3",
    name: "Restaurante El Faro",
    category: "Seafood restaurant",
    phone: "+34 956 210 333",
    website: "https://elfaro-cadiz.com",
    email: "reservas@elfaro-cadiz.com",
    address: "Calle San Félix 15",
    city: "Cádiz",
    postcode: "11002",
    country: "Spain",
    lat: 36.53,
    lng: -6.3,
    rating: 4.8,
    reviewCount: 1204,
  },
  {
    placeId: "mock-4",
    name: "Cafetería Sol y Sombra",
    category: "Cafe",
    phone: "+34 954 119 876",
    website: null,
    email: null,
    address: "Plaza de la Alfalfa 3",
    city: "Sevilla",
    postcode: "41004",
    country: "Spain",
    lat: 37.39,
    lng: -5.99,
    rating: 3.9,
    reviewCount: 47,
  },
  {
    placeId: "mock-5",
    name: "Pensión Casa Pepe",
    category: "Bed & breakfast",
    phone: null, // no phone -> not callable by Solvio outbound
    website: "http://casapepe-granada.com",
    email: null,
    address: "Cuesta de Gomérez 22",
    city: "Granada",
    postcode: "18009",
    country: "Spain",
    lat: 37.18,
    lng: -3.59,
    rating: 4.3,
    reviewCount: 156,
  },
  {
    placeId: "mock-6",
    name: "Taberna Los Olivos",
    category: "Spanish restaurant",
    phone: "+34 957 445 200",
    website: null,
    email: null,
    address: "Calle Romero 8",
    city: "Córdoba",
    postcode: "14003",
    country: "Spain",
    lat: 37.88,
    lng: -4.78,
    rating: 4.5,
    reviewCount: 540,
  },
];

export class MockLeadSource implements LeadSource {
  readonly name = "mock";

  async search(input: LeadSearchInput): Promise<NormalizedPlace[]> {
    const limit = input.filters.limit ?? SAMPLE.length;
    return SAMPLE.slice(0, limit).map((s) => ({
      ...s,
      // Echo the query into raw so the UI shows what was searched.
      raw: { source: "mock", query: input.query, location: input.location },
    }));
  }
}
