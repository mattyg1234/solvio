import {
  BOOKING_GUEST_MODE_LABELS,
  type BookingGuestMode,
  isBookingGuestMode,
} from "@/lib/booking-guest-modes";
import { parseGuestModesFromRpc } from "@/lib/booking-public-context";

const MODE_ORDER: BookingGuestMode[] = ["appointment", "event", "table", "walk_in"];

export const BOOKING_MODE_QUERY_KEY = "mode";

export const PUBLIC_MODE_HEADINGS: Record<BookingGuestMode, string> = {
  appointment: "Book an appointment",
  event: "Book an event",
  table: "Reserve a table",
  walk_in: "Send an enquiry",
};

export const PUBLIC_MODE_HINTS: Record<BookingGuestMode, string> = {
  appointment: "Choose a service, team member, and time.",
  event: "Pick the show, then a date on the calendar.",
  table: "Tell us when you’d like to visit and how many guests.",
  walk_in: "Ask about availability — the team will reply soon.",
};

export function sortGuestModes(modes: BookingGuestMode[]): BookingGuestMode[] {
  return [...new Set(modes)].sort((a, b) => MODE_ORDER.indexOf(a) - MODE_ORDER.indexOf(b));
}

export function parseBookingModeQuery(raw: string | string[] | undefined): BookingGuestMode | null {
  const value = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
  const normalized = value?.trim().toLowerCase();
  if (!normalized || !isBookingGuestMode(normalized)) return null;
  return normalized;
}

export function guestModesFromFlowDetails(
  details: unknown,
  flowKind: string | null | undefined,
): BookingGuestMode[] {
  if (details && typeof details === "object" && !Array.isArray(details)) {
    const fromDetails = parseGuestModesFromRpc((details as Record<string, unknown>).guest_booking_modes);
    if (fromDetails.length) return sortGuestModes(fromDetails);
  }

  switch (flowKind) {
    case "restaurant_tables":
      return ["table"];
    case "hosted_events":
      return ["event"];
    case "salon_appointments":
      return ["appointment"];
    case "walk_in_waitlist":
      return ["walk_in"];
    case "mixed":
      return ["appointment", "table"];
    default:
      return ["appointment", "table", "walk_in"];
  }
}

export function publicBookingUrl(siteUrl: string, slug: string, mode?: BookingGuestMode): string {
  const base = `${siteUrl.replace(/\/$/, "")}/book/${encodeURIComponent(slug.trim())}`;
  if (!mode) return base;
  return `${base}?${BOOKING_MODE_QUERY_KEY}=${encodeURIComponent(mode)}`;
}

export function modeLinkLabel(mode: BookingGuestMode): string {
  return BOOKING_GUEST_MODE_LABELS[mode];
}
