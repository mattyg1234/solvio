/**
 * Pick-up kind on a booking: on our coach, a private transfer from a resort
 * zone, or the guest makes their own way. Pure helpers — the label that lands
 * in show_bookings.pickup_stop_name for private guests is built here so the
 * Office list, Door and desk (which all print that column) need no change.
 */

export type PickupKind = "bus" | "private" | "own_way";

export type PrivateAccommodation = "hotel" | "villa" | "airbnb" | "friends_family";

export const PICKUP_KINDS: PickupKind[] = ["bus", "private", "own_way"];

export const PICKUP_KIND_LABELS: Record<PickupKind, string> = {
  bus: "Bus",
  private: "Private",
  own_way: "Own way",
};

export const PRIVATE_ACCOMMODATIONS: PrivateAccommodation[] = ["hotel", "villa", "airbnb", "friends_family"];

export const PRIVATE_ACCOMMODATION_LABELS: Record<PrivateAccommodation, string> = {
  hotel: "Hotel",
  villa: "Villa",
  airbnb: "AirBnB",
  friends_family: "Friends & Family",
};

/**
 * Resort names for the zone codes MHT already uses on show_bus_stops.zone.
 * The booking form prefers the resort name found on that island's stops; this
 * is the fallback for the guest ticket, which only has the code to hand.
 */
export const KNOWN_ZONE_RESORTS: Record<string, string> = {
  CT: "Costa Teguise",
  PB: "Playa Blanca",
  PDC: "Puerto del Carmen",
  PDI: "Playa del Inglés",
  PR: "Puerto Rico",
  MAS: "Maspalomas",
  LPA: "Las Palmas",
  TFS: "Las Américas / Los Cristianos",
  TFCA: "Costa Adeje / La Caleta",
  TFGOLF: "Golf del Sur",
  TFW: "Los Gigantes",
  CRZ: "Puerto de la Cruz",
};

const PRIVATE_PREFIX = "Private";

/** Form value → kind. Old forms only send transport_required; honour that. */
export function parsePickupKind(raw: unknown, transportRequired = false): PickupKind {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "bus" || v === "private" || v === "own_way") return v;
  return transportRequired ? "bus" : "own_way";
}

export function parsePrivateAccommodation(raw: unknown): PrivateAccommodation | null {
  const v = String(raw ?? "").trim().toLowerCase();
  return (PRIVATE_ACCOMMODATIONS as string[]).includes(v) ? (v as PrivateAccommodation) : null;
}

/** Zone codes are short upper-case tokens (PDC, TFW). Blank → null. */
export function normaliseZone(raw: unknown): string | null {
  const v = String(raw ?? "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();
  return v ? v.slice(0, 12) : null;
}

/**
 * What the Office list prints for a private guest: "Private PDC · Villa".
 * Degrades to "Private PDC", "Private · Villa" or plain "Private".
 */
export function privatePickupLabel(zone: string | null | undefined, accommodation: PrivateAccommodation | null | undefined): string {
  const z = normaliseZone(zone);
  const acc = accommodation ? PRIVATE_ACCOMMODATION_LABELS[accommodation] : null;
  const head = z ? `${PRIVATE_PREFIX} ${z}` : PRIVATE_PREFIX;
  return acc ? `${head} · ${acc}` : head;
}

/** True when a stored pickup_stop_name was written by privatePickupLabel. */
export function isPrivatePickupLabel(label: string | null | undefined): boolean {
  const s = String(label ?? "").trim();
  return s === PRIVATE_PREFIX || s.startsWith(`${PRIVATE_PREFIX} `) || s.startsWith(`${PRIVATE_PREFIX} ·`);
}

/** Reverse of privatePickupLabel for legacy call sites that only carry the label. */
export function parsePrivatePickupLabel(label: string | null | undefined): {
  zone: string | null;
  accommodation: PrivateAccommodation | null;
} | null {
  if (!isPrivatePickupLabel(label)) return null;
  const rest = String(label).trim().slice(PRIVATE_PREFIX.length).trim();
  const [zonePart, accPart] = rest.split("·").map((s) => s.trim());
  const zone = normaliseZone(zonePart);
  const accEntry = accPart
    ? (Object.entries(PRIVATE_ACCOMMODATION_LABELS).find(([, l]) => l.toLowerCase() === accPart.toLowerCase()) ?? null)
    : null;
  return { zone, accommodation: accEntry ? (accEntry[0] as PrivateAccommodation) : null };
}

/** Resort name for a zone code — from the stop list if given, else the known map, else the code. */
export function zoneResortName(zone: string | null | undefined, resortByZone?: Record<string, string>): string | null {
  const z = normaliseZone(zone);
  if (!z) return null;
  return resortByZone?.[z] || KNOWN_ZONE_RESORTS[z] || z;
}

/** Guest-facing line for a private guest: "Private transfer from Puerto del Carmen". */
export function privateTransferLine(zone: string | null | undefined, resortByZone?: Record<string, string>): string {
  const name = zoneResortName(zone, resortByZone);
  return name ? `Private transfer from ${name}` : "Private transfer";
}

/**
 * Pick-up wording for tickets and the desk from what a booking row carries.
 * Falls back to the stored label when the row predates pickup_kind.
 */
export function pickupKindFromBooking(b: {
  pickup_kind?: string | null;
  transport_required?: boolean | null;
  pickup_stop_name?: string | null;
}): PickupKind {
  const k = String(b.pickup_kind ?? "").trim();
  if (k === "bus" || k === "private" || k === "own_way") return k;
  if (b.transport_required) return "bus";
  return isPrivatePickupLabel(b.pickup_stop_name) ? "private" : "own_way";
}

export type ZoneOption = { code: string; label: string; resort: string | null };

/**
 * Distinct zone codes on one island's stops, labelled with the resort most
 * stops in that zone use. Sorted by code so the select is stable.
 */
export function zoneOptionsFromStops(
  stops: Array<{ island?: string | null; zone?: string | null; resort?: string | null }>,
  island: string | null | undefined,
): ZoneOption[] {
  const counts = new Map<string, Map<string, number>>();
  for (const s of stops) {
    if (island && s.island !== island) continue;
    const z = normaliseZone(s.zone);
    if (!z) continue;
    const byResort = counts.get(z) ?? new Map<string, number>();
    const r = String(s.resort ?? "").trim();
    if (r) byResort.set(r, (byResort.get(r) ?? 0) + 1);
    counts.set(z, byResort);
  }
  return [...counts.entries()]
    .map(([code, byResort]) => {
      const resort =
        [...byResort.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ??
        KNOWN_ZONE_RESORTS[code] ??
        null;
      return { code, resort, label: resort ? `${code} · ${resort}` : code };
    })
    .sort((a, b) => a.code.localeCompare(b.code));
}
