/** Partners with no location, or location ALL, sell every island. */
export function partnerSellsOnIsland(
  partnerIsland: string | null | undefined,
  showIsland: string | null | undefined,
): boolean {
  if (!showIsland) return true;
  const loc = (partnerIsland || "").trim();
  if (!loc || loc.toUpperCase() === "ALL") return true;
  return loc === showIsland;
}

export function partnerSearchHaystack(row: {
  name: string;
  partner_type?: string | null;
  island?: string | null;
}): string {
  return [row.name, row.partner_type, row.island].filter(Boolean).join(" ").toLowerCase();
}
