/**
 * URL primitives for `/dashboard/bookings`.
 * Lives outside `"use client"` modules so Server Components can import safely.
 */

export const BOOKING_HUB_PRIMARIES = ["guests", "offerings"] as const;
export type BookingHubPrimary = (typeof BOOKING_HUB_PRIMARIES)[number];

export const BOOKING_GUESTS_SUBS = ["inbox", "confirmed", "planner"] as const;
export type BookingGuestsSub = (typeof BOOKING_GUESTS_SUBS)[number];

export const BOOKING_OFFERINGS_SUBS = ["appointments", "staff", "events", "tables"] as const;
export type BookingOfferingsSub = (typeof BOOKING_OFFERINGS_SUBS)[number];

function normQs(s?: string | null): string {
  return typeof s === "string" ? s.trim().toLowerCase() : "";
}

function coerceGuestsSub(raw: string): BookingGuestsSub {
  if (raw === "confirmed" || raw === "scheduled" || raw === "calendar") return "confirmed";
  if (raw === "planner" || raw === "week" || raw === "schedule") return "planner";
  return "inbox";
}

function coerceOfferingsSub(raw: string): BookingOfferingsSub {
  if (raw === "events" || raw === "tables" || raw === "appointments" || raw === "staff") return raw;
  return "appointments";
}

export type ParsedBookingsHub = {
  primary: BookingHubPrimary;
  guestsSub: BookingGuestsSub;
  offeringsSub: BookingOfferingsSub;
  bookingHighlight: string | null;
};

/** Supports `?tab=guests|offerings&view=…` plus legacy `?tab=requests|confirmed|appointments…`. */
export function parseBookingsHubQuery(params: {
  tab?: string | null;
  view?: string | null;
  booking?: string | null;
}): ParsedBookingsHub {
  const ht = normQs(params.tab);
  const hv = normQs(params.view);
  const bookingRaw = typeof params.booking === "string" ? params.booking.trim() : "";

  /** UUID-ish highlight for threading */
  const bookingHighlight = /^[0-9a-f-]{36}$/i.test(bookingRaw) ? bookingRaw.toLowerCase() : null;

  const base: ParsedBookingsHub = {
    primary: "guests",
    guestsSub: "inbox",
    offeringsSub: "appointments",
    bookingHighlight,
  };

  if (!ht.length) {
    if (!hv.length) return base;
    if (hv === "appointments" || hv === "staff" || hv === "events" || hv === "tables") {
      return {
        primary: "offerings",
        guestsSub: "inbox",
        offeringsSub: coerceOfferingsSub(hv),
        bookingHighlight,
      };
    }
    return {
      primary: "guests",
      guestsSub: coerceGuestsSub(hv),
      offeringsSub: "appointments",
      bookingHighlight,
    };
  }

  /** Legacy shortcuts */
  if (ht === "requests" || ht === "pending" || ht === "inbox") {
    return {
      primary: "guests",
      guestsSub: coerceGuestsSub(hv || "inbox"),
      offeringsSub: coerceOfferingsSub("appointments"),
      bookingHighlight,
    };
  }

  if (ht === "confirmed" || ht === "scheduled") {
    return {
      primary: "guests",
      guestsSub: "confirmed",
      offeringsSub: coerceOfferingsSub("appointments"),
      bookingHighlight,
    };
  }

  if (ht === "appointments" || ht === "staff" || ht === "events" || ht === "tables") {
    return {
      primary: "offerings",
      guestsSub: "inbox",
      offeringsSub: coerceOfferingsSub(ht),
      bookingHighlight,
    };
  }

  if (ht === "guests") {
    return {
      primary: "guests",
      guestsSub: coerceGuestsSub(hv || "inbox"),
      offeringsSub: coerceOfferingsSub("appointments"),
      bookingHighlight,
    };
  }

  if (ht === "offerings" || ht === "create" || ht === "inventory") {
    return {
      primary: "offerings",
      guestsSub: "inbox",
      offeringsSub: coerceOfferingsSub(hv || "appointments"),
      bookingHighlight,
    };
  }

  /** Unknown tab keyword — safe default */
  return base;
}
