import { gmailEstimate, gmailFromQuery, gmailSearch, gmailSubject } from "./gmail";
import { isReplyOrForward, looksLikeSupplierBooking, suggestionSender } from "./sellers";
import { mapLimit, parseFrom } from "./text";

/** The questions the scan and sync ask of the Gmail bookings inbox (ported from Solvio Connect). */

/** Gmail's adverts and social tabs never hold supplier bookings. */
const GMAIL_SKIP_TABS = "-category:promotions -category:social -category:forums";

export type SellerCount = { found: number; other: number; lastSeen: string | null; examples: string[] };

/**
 * Emails from these senders in the last `days` days, sorted by subject line into bookings MHT
 * received as the supplier versus everything else (adverts, account emails).
 */
export async function countFrom(token: string, senders: string[], days: number, cap: number): Promise<SellerCount> {
  const { ids } = await gmailSearch(token, `${gmailFromQuery(senders)} newer_than:${days}d ${GMAIL_SKIP_TABS}`, cap);
  const items = await mapLimit(ids, 10, (id) => gmailSubject(token, id));
  const bookings = items.filter((i) => looksLikeSupplierBooking(i.subject));
  return {
    found: bookings.length,
    other: items.length - bookings.length,
    lastSeen: bookings[0]?.date ?? null,
    examples: bookings.slice(0, 3).map((b) => b.subject.slice(0, 90)),
  };
}

export type SuggestedSender = { sender: string; name: string; found: number; lastSeen: string | null; examples: string[] };

/** Subject words that booking and order emails from a shop, hotel or agent tend to use. */
const BOOKING_WORDS = '(order OR booking OR reservation OR reserva OR pedido OR buchung OR "new order" OR "new booking")';

/**
 * Senders the Hub doesn't know whose subject lines look like bookings: MHT's own website shop
 * ("[MHT- Music Hall Tavern]: New order #TFS/20957"), a hotel desk, a local agent.
 */
export async function bookingLikeSenders(token: string, inbox: string, days: number, skip: string[], cap: number): Promise<SuggestedSender[]> {
  if (cap <= 0) return [];
  const minus = skip.length ? ` -from:(${skip.join(" OR ")})` : "";
  const { ids } = await gmailSearch(token, `subject:${BOOKING_WORDS} newer_than:${days}d ${GMAIL_SKIP_TABS}${minus}`, cap);
  const items = await mapLimit(ids, 10, (id) => gmailSubject(token, id));
  const bySender = new Map<string, SuggestedSender>();
  for (const i of items) {
    if (isReplyOrForward(i.subject) || !looksLikeSupplierBooking(i.subject)) continue;
    const { name, email } = parseFrom(i.from);
    const sender = suggestionSender(email, inbox);
    if (!sender) continue;
    const s = bySender.get(sender) ?? { sender, name: name || sender, found: 0, lastSeen: null, examples: [] };
    s.found++;
    s.lastSeen ??= i.date;
    if (s.examples.length < 3) s.examples.push(i.subject.slice(0, 90));
    bySender.set(sender, s);
  }
  return [...bySender.values()].sort((a, b) => b.found - a.found);
}

/** Everything that reached the inbox in the last `days` days, when it's cheap to find out; else 0. */
export async function inboxTotal(token: string, days: number): Promise<number> {
  try {
    return await gmailEstimate(token, `in:inbox newer_than:${days}d`);
  } catch {
    return 0;
  }
}

/** Gmail ids (newest first) of emails from these senders since a time. */
export async function idsFrom(token: string, senders: string[], since: Date, max: number): Promise<string[]> {
  const { ids } = await gmailSearch(token, `${gmailFromQuery(senders)} after:${Math.floor(since.getTime() / 1000)}`, max);
  return ids;
}
