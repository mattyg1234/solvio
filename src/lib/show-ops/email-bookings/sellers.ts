import type { SellerFound } from "./types";

/**
 * Booking senders the Hub recognises (ported from Solvio Connect's sellers.ts).
 * matchOnly: the rep phones the booking in first and the confirmation email follows (Ruth, 28 Sept),
 * so an email from them is matched to the phoned-in booking, never added as a new one by default.
 */
export const SELLERS: { key: string; name: string; domains: string[]; matchOnly?: boolean }[] = [
  { key: "getyourguide", name: "GetYourGuide", domains: ["getyourguide.com"] },
  { key: "viator", name: "Viator", domains: ["viator.com", "tripadvisor.com"] },
  { key: "booking", name: "Booking.com", domains: ["booking.com"] },
  { key: "civitatis", name: "Civitatis", domains: ["civitatis.com"] },
  { key: "tiqets", name: "Tiqets", domains: ["tiqets.com"] },
  { key: "klook", name: "Klook", domains: ["klook.com"] },
  { key: "musement", name: "Musement", domains: ["musement.com"] },
  { key: "headout", name: "Headout", domains: ["headout.com"] },
  { key: "expedia", name: "Expedia", domains: ["expedia.com"] },
  { key: "airbnb", name: "Airbnb Experiences", domains: ["airbnb.com"] },
  { key: "tui", name: "TUI", domains: ["tui.co.uk", "tui.com", "tuigroup.com"], matchOnly: true },
  { key: "jet2", name: "Jet2", domains: ["jet2.com", "jet2holidays.com"], matchOnly: true },
];

export function sellerForEmail(fromEmail: string): { key: string; name: string; domain: string; matchOnly: boolean } | undefined {
  const domain = fromEmail.split("@")[1]?.toLowerCase() ?? "";
  const known = SELLERS.find((s) => s.domains.some((d) => domain === d || domain.endsWith(`.${d}`)));
  if (known) return { key: known.key, name: known.name, domain, matchOnly: Boolean(known.matchOnly) };
  return undefined;
}

export function isMatchOnlySeller(key: string | null | undefined): boolean {
  return Boolean(key && SELLERS.find((s) => s.key === key)?.matchOnly);
}

/* ---------- Senders the office adds itself ---------- */

/**
 * Cleans what someone typed as a booking sender: "orders@shop.com", "@shop.com", "shop.com" or
 * "https://www.shop.com/…". Returns a lower-case address or domain, or null if it isn't one.
 */
export function cleanSender(input: string): string | null {
  let v = input.trim().toLowerCase().replace(/^mailto:/, "");
  if (!v) return null;
  if (v.includes("@") && !v.startsWith("@")) return /^[^\s@]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v) ? v : null;
  v = v.replace(/^@/, "").replace(/^[a-z]+:\/\//, "").replace(/^www\./, "").split(/[/?#:]/)[0];
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v) ? v : null;
}

export const customSenderKey = (sender: string) => `custom:${sender}`;

/** A tickable entry for a sender the office typed in. */
export function customSeller(name: string, sender: string, track = true): SellerFound {
  return { key: customSenderKey(sender), name: name.trim().slice(0, 60) || sender, domain: sender, found: 0, lastSeen: new Date().toISOString(), track, custom: true };
}

/** The addresses or domains to search for one tracked sender. */
export function sendersFor(seller: Pick<SellerFound, "key" | "domain">): string[] {
  return SELLERS.find((s) => s.key === seller.key)?.domains ?? [seller.domain];
}

/** Whether an email address is covered by an address-or-domain sender. */
export function senderMatches(fromEmail: string, sender: string): boolean {
  const from = fromEmail.trim().toLowerCase();
  if (sender.includes("@")) return from === sender;
  const domain = from.split("@")[1] ?? "";
  return domain === sender || domain.endsWith(`.${sender}`);
}

/** Adds a sender to the list, or ticks it if it's already there. */
export function withSender(all: SellerFound[], s: SellerFound): SellerFound[] {
  return all.some((x) => x.key === s.key) ? all.map((x) => (x.key === s.key ? { ...x, track: true, suggested: undefined } : x)) : [...all, s];
}

/** A typed sender as a list entry: exactly the address (or domain) typed, named after the site if it's a known one. */
export function senderEntry(name: string, cleaned: string): SellerFound {
  const catalog = sellerForEmail(cleaned.includes("@") ? cleaned : `x@${cleaned}`);
  return customSeller(name || catalog?.name || cleaned, cleaned);
}

/* ---------- Is this email a booking MHT received as the supplier? ---------- */

/** Words partners use when telling a supplier about a booking, a change or a cancellation. */
const SUPPLIER_SIGNS = [
  /\bnew booking\b/i,
  /^booking\s*[-–:]/i,
  /\bbooking (received|request|confirmed for|details)\b/i,
  /\byou have (a|received a) new\b/i,
  /\bnew (reservation|order)\b/i,
  /\breservation (for|request)\b/i,
  /\b(booking|reservation|order) (cancel+ed|amended|changed|modified|updated)\b/i,
  /\bcancel+ation\b.*\b(booking|reservation|ref)/i,
  /\bbooking ref(erence)?\b|\bbr-\d+|\bgyg[a-z0-9-]*\d/i,
  /\bnueva reserva\b|\breserva (confirmada|cancelada|modificada)\b|\blocalizador\b/i,
  /\bneue buchung\b|\bnouvelle r[ée]servation\b/i,
  /\bsupplier\b|\boperator\b|\bparticipants?\b|\btravel+ers?:\s*\d/i,
  /\bbooked your (experience|tour|activity)\b|\bis coming\b|\bguests? (arrive|are coming)\b/i,
];

/** Words in emails to a traveller, and in adverts, which should never count as bookings. */
const NOT_A_BOOKING = [
  /\byour (trip|booking|reservation|stay|order|receipt|itinerary|tickets?)\b/i,
  /\bthanks? for (booking|your (booking|order|purchase))\b/i,
  /\bhow was\b|\breview (your|us)\b|\brate your\b|\bleave a review\b/i,
  /\b(deal|deals|offer|offers|sale|% off|discount|save|inspiration|ideas|newsletter|recommended|last chance|don.?t miss)\b/i,
  /\b(password|sign.?in|verify|verification|security|account|privacy|terms)\b/i,
];

/** Sorts one email by its subject line, before anything is downloaded. */
export function looksLikeSupplierBooking(subject: string): boolean {
  const s = subject.trim();
  if (!s) return false;
  if (NOT_A_BOOKING.some((re) => re.test(s)) && !/\bnew booking\b|\bnueva reserva\b|\bnew order\b/i.test(s)) return false;
  return SUPPLIER_SIGNS.some((re) => re.test(s));
}

/** Replies and forwards are people talking about a booking, not the booking itself. */
export function isReplyOrForward(subject: string): boolean {
  return /^\s*(re|fwd?|rv|tr|aw|wg)\s*:/i.test(subject);
}

/**
 * The bookings inbox's scan suggests unknown senders whose subjects look like bookings, always by
 * the exact address they send from: partners' order emails often come from one mailbox that isn't
 * on their website's domain (TUI's come from a Gmail address), so a whole domain would be a guess.
 */
export function suggestionSender(fromEmail: string, inboxAddress: string): string | null {
  const address = fromEmail.trim().toLowerCase();
  const domain = address.split("@")[1] ?? "";
  const own = inboxAddress.trim().toLowerCase();
  if (!domain || address === own) return null;
  return address;
}
