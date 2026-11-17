/** Island codes MHT uses in show names ("MHT ACE"), as guests should read them. */
const ISLAND_NAMES: Record<string, string> = { ACE: "Lanzarote", TFS: "Tenerife", LPA: "Gran Canaria" };

/**
 * The show name as a guest should read it: "1 MHT ACE" → "MHT Lanzarote". Drops the
 * desk's leading sort number and spells the island codes out in full.
 */
export function guestShowName(showName: string): string {
  const out = String(showName ?? "")
    .trim()
    .replace(/^\d+\s+(?=\S)/, "")
    .replace(/\b(ACE|TFS|LPA)\b/g, (code) => ISLAND_NAMES[code] ?? code);
  return out || String(showName ?? "").trim();
}
