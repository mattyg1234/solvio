import type { MailMessage } from "./extract";
import { gmailEstimate, gmailFromQuery, gmailMessage, gmailSearch, gmailSubject } from "./gmail";
import { hubspotEmailById, hubspotEmailsSince, hubspotMessage, type HubSpotEmail } from "./hubspot";
import { isReplyOrForward, looksLikeSupplierBooking, senderMatches, suggestionSender } from "./sellers";
import { mapLimit, parseFrom } from "./text";

/**
 * The questions the scan and sync ask of the bookings inbox (ported from Solvio Connect), answered
 * by Gmail search or, for a HubSpot inbox, by filtering the emails HubSpot lists for the window.
 */

export type SellerCount = { found: number; other: number; lastSeen: string | null; examples: string[] };
export type SuggestedSender = { sender: string; name: string; found: number; lastSeen: string | null; examples: string[] };
type Heading = { subject: string; date: string | null; from: string };

export type MailSource = {
  /** Emails from these senders in the last `days` days, sorted into bookings MHT received as the supplier versus everything else. */
  countFrom(senders: string[], days: number, cap: number): Promise<SellerCount>;
  /** Senders the Hub doesn't know whose subject lines look like bookings (the website shop, a hotel desk). */
  bookingLikeSenders(inbox: string, days: number, skip: string[], cap: number): Promise<SuggestedSender[]>;
  /** Everything that reached the inbox in the last `days` days, when it's cheap to find out; else 0. */
  inboxTotal(days: number): Promise<number>;
  /** Message ids (newest first) of emails from these senders since a time. */
  idsFrom(senders: string[], since: Date, max: number): Promise<string[]>;
  message(id: string): Promise<MailMessage>;
};

/** Newest first. When only the newest `items` of `total` emails were read, the counts are scaled up to match. */
function sortedCount(items: Heading[], total = items.length): SellerCount {
  const bookings = items.filter((i) => looksLikeSupplierBooking(i.subject));
  const scale = items.length ? total / items.length : 1;
  return {
    found: Math.round(bookings.length * scale),
    other: Math.round((items.length - bookings.length) * scale),
    lastSeen: bookings[0]?.date ?? null,
    examples: bookings.slice(0, 3).map((b) => b.subject.slice(0, 90)),
  };
}

/** Newest first. */
export function suggestSenders(items: Heading[], inbox: string): SuggestedSender[] {
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

/* ---------- Gmail ---------- */

/**
 * Subjects read per sender when counting. Each read costs Gmail quota (about 3,000 a minute per
 * inbox), so a scan of a couple of dozen senders samples the newest emails and scales the counts.
 */
const GMAIL_SUBJECT_SAMPLE = 25;

/** Gmail's adverts and social tabs never hold supplier bookings. */
const GMAIL_SKIP_TABS = "-category:promotions -category:social -category:forums";

/** Subject words that booking and order emails from a shop, hotel or agent tend to use. */
const BOOKING_WORDS = '(order OR booking OR reservation OR reserva OR pedido OR buchung OR "new order" OR "new booking")';

export function gmailSource(token: string): MailSource {
  return {
    async countFrom(senders, days, cap) {
      const { ids } = await gmailSearch(token, `${gmailFromQuery(senders)} newer_than:${days}d ${GMAIL_SKIP_TABS}`, cap);
      const sample = ids.slice(0, GMAIL_SUBJECT_SAMPLE);
      return sortedCount(await mapLimit(sample, 5, (id) => gmailSubject(token, id)), ids.length);
    },
    async bookingLikeSenders(inbox, days, skip, cap) {
      if (cap <= 0) return [];
      const minus = skip.length ? ` -from:(${skip.join(" OR ")})` : "";
      const { ids } = await gmailSearch(token, `subject:${BOOKING_WORDS} newer_than:${days}d ${GMAIL_SKIP_TABS}${minus}`, cap);
      return suggestSenders(await mapLimit(ids, 5, (id) => gmailSubject(token, id)), inbox);
    },
    async inboxTotal(days) {
      try {
        return await gmailEstimate(token, `in:inbox newer_than:${days}d`);
      } catch {
        return 0;
      }
    },
    async idsFrom(senders, since, max) {
      const { ids } = await gmailSearch(token, `${gmailFromQuery(senders)} after:${Math.floor(since.getTime() / 1000)}`, max);
      return ids;
    },
    message: (id) => gmailMessage(token, id),
  };
}

/* ---------- HubSpot ---------- */

/** The same subject words as the Gmail search above. */
const BOOKING_WORDS_RE = /\b(order|booking|reservation|reserva|pedido|buchung)\b/i;
/** Threads read per window; a quiet bookings inbox has far fewer in 90 days. */
const HUBSPOT_MAX_THREADS = 300;

const heading = (e: HubSpotEmail): Heading => ({ subject: e.subject, date: e.date, from: `${e.fromName} <${e.from}>` });

export function hubspotSource(token: string, maxThreads = HUBSPOT_MAX_THREADS): MailSource {
  // One listing per run, shared by the scan's parallel questions; a wider window lists again.
  let loaded: { since: number; emails: Promise<HubSpotEmail[]> } | null = null;
  const byId = new Map<string, HubSpotEmail>();
  function emailsSince(since: Date): Promise<HubSpotEmail[]> {
    if (!loaded || since.getTime() < loaded.since) {
      const emails = hubspotEmailsSince(token, since, maxThreads).then((list) => {
        for (const e of list) byId.set(e.id, e);
        return list;
      });
      loaded = { since: since.getTime(), emails };
    }
    const from = since.toISOString();
    return loaded.emails.then((list) => list.filter((e) => e.date >= from));
  }
  const daysAgo = (days: number) => new Date(Date.now() - days * 86400000);
  const fromAny = (senders: string[]) => (e: HubSpotEmail) => senders.some((s) => senderMatches(e.from, s));

  return {
    async countFrom(senders, days, cap) {
      const list = (await emailsSince(daysAgo(days))).filter(fromAny(senders)).slice(0, cap);
      return sortedCount(list.map(heading));
    },
    async bookingLikeSenders(inbox, days, skip, cap) {
      if (cap <= 0) return [];
      const skipped = fromAny(skip);
      const list = (await emailsSince(daysAgo(days))).filter((e) => BOOKING_WORDS_RE.test(e.subject) && !skipped(e)).slice(0, cap);
      return suggestSenders(list.map(heading), inbox);
    },
    async inboxTotal(days) {
      try {
        return (await emailsSince(daysAgo(days))).length;
      } catch {
        return 0;
      }
    },
    async idsFrom(senders, since, max) {
      return (await emailsSince(since)).filter(fromAny(senders)).slice(0, max).map((e) => e.id);
    },
    async message(id) {
      const email = byId.get(id) ?? (await hubspotEmailById(token, id));
      if (!email) throw new Error("That HubSpot email is no longer there.");
      return hubspotMessage(token, email);
    },
  };
}
