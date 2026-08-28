/**
 * A partner's `island` field holds one location, several separated by commas, or
 * the wildcard ALL. Multi-location matters in the Canaries: the same ticket shop
 * chain sells Tenerife and Gran Canaria, and marking it as one island hides it
 * from the other island's booking desk.
 */
export function partnerIslands(partnerIsland: string | null | undefined): string[] {
  return (partnerIsland || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Partners with no location, or location ALL, sell every island. */
export function partnerSellsOnIsland(
  partnerIsland: string | null | undefined,
  showIsland: string | null | undefined,
): boolean {
  if (!showIsland) return true;
  const list = partnerIslands(partnerIsland);
  if (!list.length) return true;
  if (list.some((loc) => loc.toUpperCase() === "ALL")) return true;
  return list.includes(showIsland);
}

/** Canonical stored form: ALL on its own, otherwise a de-duplicated comma list. */
export function normalisePartnerIslands(values: string[]): string {
  const cleaned = values.map((v) => v.trim()).filter(Boolean);
  if (!cleaned.length) return "ALL";
  if (cleaned.some((v) => v.toUpperCase() === "ALL")) return "ALL";
  return [...new Set(cleaned)].join(", ");
}

export function partnerSearchHaystack(row: {
  name: string;
  partner_type?: string | null;
  island?: string | null;
  email?: string | null;
  legal_name?: string | null;
  tax_id?: string | null;
}): string {
  return [row.name, row.partner_type, row.island, row.email, row.legal_name, row.tax_id]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}
