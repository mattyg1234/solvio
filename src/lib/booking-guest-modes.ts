export type BookingGuestMode = "appointment" | "event" | "table" | "walk_in";

export const BOOKING_GUEST_MODE_LABELS: Record<BookingGuestMode, string> = {
  appointment: "Appointments",
  event: "Events",
  table: "Tables",
  walk_in: "Walk-in enquiries",
};

export function isBookingGuestMode(v: string): v is BookingGuestMode {
  return v === "appointment" || v === "event" || v === "table" || v === "walk_in";
}

export function parseGuestModesJson(raw: string | null | undefined): BookingGuestMode[] {
  if (!raw?.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out = parsed.filter((x): x is BookingGuestMode => typeof x === "string" && isBookingGuestMode(x));
    return [...new Set(out)];
  } catch {
    return [];
  }
}
