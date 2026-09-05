export function normaliseDirectorySearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
export function matchesDirectorySearch(
  query: string,
  ...fields: (string | null | undefined)[]
): boolean {
  const words = normaliseDirectorySearch(query).split(/\s+/).filter(Boolean);
  const haystack = normaliseDirectorySearch(fields.filter(Boolean).join(" "));
  return words.every((word) => haystack.includes(word));
}
export function hotelNamesForStops(
  hotels: { name: string; bus_stop_id: string | null }[],
): Record<string, string[]> {
  const names: Record<string, string[]> = {};
  for (const hotel of hotels) {
    if (hotel.bus_stop_id) (names[hotel.bus_stop_id] ??= []).push(hotel.name);
  }
  return names;
}
