/**
 * Email bookings (ported from Solvio Connect, 30 Sept 2026): booking emails from the partners the
 * office ticks are read into a review queue. Nothing here ever creates a booking on its own; Ruth
 * opens each one in the normal new-booking form, prefilled, and saves it herself.
 */

/** What was read from one booking email. Every field is optional: never guess. */
export type ExtractedBooking = {
  name?: string;
  /** YYYY-MM-DD */
  date?: string;
  /** HH:MM (Woo orders have none: the show's own time is used). */
  time?: string;
  quantity?: number;
  adults?: number;
  children?: number;
  infants?: number;
  /** Hotel, accommodation or pick-up point as written in the email. */
  location?: string;
  /** The seller (GetYourGuide, MHT website, …). */
  partner?: string;
  /** The booking's price as the email states it. */
  amount?: number;
  /** Already paid by the guest to MHT (a website order paid at checkout). */
  paid?: number;
  /** What MHT receives after the partner's commission, when the email says. */
  net?: number;
  /** What was booked, without date or ticket type. */
  service?: string;
  /** The partner's booking reference or the shop's order number (TFS/20957, GYGTEST12345). */
  reference?: string;
  email?: string;
  phone?: string;
  language?: string;
  /** Ticket mix, add-ons, the option bought, special requests. */
  requests?: string;
  /** How the guest paid, as the email says (Link, Card, PayPal…). */
  paymentMethod?: string;
};

export type EmailKind = "new" | "change" | "cancel" | "question" | "not-booking";
export type EmailStatus = "review" | "added" | "ignored";
export const EMAIL_KINDS: EmailKind[] = ["new", "change", "cancel", "question", "not-booking"];
export const EMAIL_STATUSES: EmailStatus[] = ["review", "added", "ignored"];

/** A reader's answer for one email. */
export type EmailRead = { kind: EmailKind; extracted: ExtractedBooking; confidence: number };

/** Which reader produced the fields (shown to the office so they know how much to trust it). */
export type EmailReader = "template" | "ai" | "pattern";

/** One tickable sender in the bookings inbox (catalog marketplace, one MHT added, or a suggestion). */
export type SellerFound = {
  /** Catalog key (getyourguide) or custom:<address or domain>. */
  key: string;
  name: string;
  /** The first domain (catalog) or the address / domain typed in. */
  domain: string;
  /** Booking-looking emails in the last scan. */
  found: number;
  lastSeen: string;
  track: boolean;
  /** When this sender's emails were last read; unset = read its last 30 days on the next sync. */
  syncedAt?: string;
  examples?: string[];
  /** Emails from it that didn't look like bookings (adverts, account mail). */
  other?: number;
  custom?: boolean;
  /** Found by the scan, not chosen yet. */
  suggested?: boolean;
};

/** A stored inbound email row (public.show_email_bookings), as the page reads it. */
export type InboundEmailRow = {
  id: string;
  provider: string;
  provider_message_id: string;
  from_name: string;
  from_email: string;
  subject: string;
  received_at: string;
  body: string;
  seller_key: string | null;
  seller_name: string | null;
  kind: EmailKind;
  extracted: ExtractedBooking;
  confidence: number;
  reader: EmailReader | null;
  status: EmailStatus;
  booking_id: string | null;
  system_note: string | null;
  notes: string | null;
  handled_at: string | null;
};

export const EMAIL_FIELD_LABELS: Record<keyof ExtractedBooking, string> = {
  reference: "Their reference",
  partner: "Sold by",
  service: "What they booked",
  date: "Date",
  time: "Time",
  name: "Customer",
  adults: "Adults",
  children: "Children",
  infants: "Infants",
  quantity: "Total people",
  location: "Hotel / pick-up",
  phone: "Phone",
  email: "Email",
  language: "Language",
  amount: "Price (€)",
  paid: "Paid online (€)",
  net: "MHT receives (€)",
  paymentMethod: "Paid by",
  requests: "Notes / tickets",
};

export const EMAIL_NUMBER_FIELDS: (keyof ExtractedBooking)[] = ["adults", "children", "infants", "quantity", "amount", "paid", "net"];
export const EMAIL_MONEY_FIELDS: (keyof ExtractedBooking)[] = ["amount", "paid", "net"];
