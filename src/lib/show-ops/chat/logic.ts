/**
 * Pure chat rules: mentions, unread counts, direct-chat keys, and what a viewer
 * may see on a booking card. No I/O so it can be unit tested.
 */

import { showOpsArrivalMark } from "@/lib/show-ops/calc";
import { pickupKindFromBooking } from "@/lib/show-ops/private-pickup";
import type {
  ChatBookingAttachment,
  ChatBookingCard,
  ChatBookingCardDetails,
  ChatChannel,
  ChatPerson,
} from "@/lib/show-ops/chat/types";

export const CHAT_MAX_TEXT = 4000;
export const CHAT_MAX_GROUP_NAME = 80;
export const CHAT_POLL_MS = 5000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/** Roles that get chat. Partner logins (seller) never do. */
export function canUseShowOpsChat(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin" || role === "finance" || role === "office" || role === "booker";
}

/** One direct chat per pair of people, whoever starts it. */
export function directChatKey(a: string, b: string): string {
  return [a, b].sort().join(":");
}

/** The people a direct-chat key names. */
export function directChatPair(key: string): [string, string] | null {
  const [a, b, extra] = key.split(":");
  return a && b && extra === undefined ? [a, b] : null;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Everyone named with "@Full Name" in the text. Longest names win, so "@Ana Maria"
 * does not also mention "@Ana". A mention must end at a word boundary.
 */
export function parseMentions(text: string, people: readonly Pick<ChatPerson, "id" | "name">[]): string[] {
  if (!text.includes("@")) return [];
  const byLength = [...people].filter((p) => p.name.trim()).sort((a, b) => b.name.length - a.name.length);
  const found = new Set<string>();
  let rest = text;
  for (const p of byLength) {
    const re = new RegExp(`(^|[^\\p{L}\\p{N}_])@${escapeRegExp(p.name.trim())}(?![\\p{L}\\p{N}_])`, "giu");
    if (re.test(rest)) {
      found.add(p.id);
      // Blank the match so a shorter name inside it does not count too.
      rest = rest.replace(re, (m, lead: string) => lead + " ".repeat(m.length - lead.length));
    }
  }
  return people.filter((p) => found.has(p.id)).map((p) => p.id);
}

/** Split text into plain runs and @mentions of known people, for highlighting. */
export function splitMentions(
  text: string,
  people: readonly Pick<ChatPerson, "id" | "name">[],
): { text: string; personId?: string }[] {
  const named = [...people].filter((p) => p.name.trim()).sort((a, b) => b.name.length - a.name.length);
  if (!named.length || !text.includes("@")) return [{ text }];
  const re = new RegExp(
    `@(${named.map((p) => escapeRegExp(p.name.trim())).join("|")})(?![\\p{L}\\p{N}_])`,
    "giu",
  );
  const out: { text: string; personId?: string }[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0;
    const before = at > 0 ? text[at - 1] : "";
    if (before && /[\p{L}\p{N}_]/u.test(before)) continue;
    if (at > last) out.push({ text: text.slice(last, at) });
    const person = named.find((p) => p.name.trim().toLowerCase() === m[1].toLowerCase());
    out.push({ text: m[0], personId: person?.id });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/** Messages from someone else newer than the read marker. */
export function countUnread(
  messages: readonly { authorId: string | null; createdAt: string }[],
  meId: string,
  lastReadAt: string | null,
): number {
  const since = lastReadAt ? Date.parse(lastReadAt) : Number.NEGATIVE_INFINITY;
  return messages.filter((m) => m.authorId !== meId && Date.parse(m.createdAt) > since).length;
}

/** Nav badge number: every unread message across the chats someone is in. */
export function totalUnread(channels: readonly Pick<ChatChannel, "unread">[]): number {
  return channels.reduce((sum, c) => sum + Math.max(0, c.unread || 0), 0);
}

export function formatUnreadBadge(n: number): string {
  return n > 99 ? "99+" : String(n);
}

/** Team first, then whatever spoke last. */
export function sortChannels<T extends Pick<ChatChannel, "kind" | "lastMessageAt" | "name">>(channels: readonly T[]): T[] {
  return [...channels].sort((a, b) => {
    if (a.kind === "team" && b.kind !== "team") return -1;
    if (b.kind === "team" && a.kind !== "team") return 1;
    const t = (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? "");
    return t || a.name.localeCompare(b.name);
  });
}

/** A direct chat is named after the other person, whoever looks at it. */
export function channelTitle(
  channel: Pick<ChatChannel, "kind" | "name" | "memberIds">,
  people: readonly ChatPerson[],
  meId: string,
): string {
  if (channel.kind === "team") return channel.name || "Team";
  if (channel.kind === "direct") {
    const other = channel.memberIds.find((id) => id !== meId);
    return (other && people.find((p) => p.id === other)?.name) || "Direct message";
  }
  return channel.name || "Group";
}

/** The attachment column, validated. Anything else is ignored rather than trusted. */
export function parseBookingAttachment(raw: unknown): ChatBookingAttachment | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.kind !== "booking" || !isUuid(o.booking_id)) return null;
  const ref = typeof o.ref === "string" ? o.ref.trim().slice(0, 60) : "";
  if (!ref) return null;
  return { kind: "booking", booking_id: o.booking_id, ref };
}

/** Booking columns the card reads. No money columns on purpose. */
export const CHAT_BOOKING_CARD_COLUMNS =
  "id,booking_ref,guest_name,show_name,island,show_date,adults,children,infants,pickup_kind,transport_required,hotel_name,pickup_stop_name,pickup_time,private_zone,cancelled_at,cancel_request_status,no_show,arrived_pax,arrived_at";

export type ChatBookingCardRow = {
  id: string;
  booking_ref: string;
  guest_name: string | null;
  show_name: string | null;
  island: string | null;
  show_date: string;
  adults: number | null;
  children: number | null;
  infants: number | null;
  pickup_kind?: string | null;
  transport_required?: boolean | null;
  hotel_name?: string | null;
  pickup_stop_name?: string | null;
  pickup_time?: string | null;
  private_zone?: string | null;
  cancelled_at?: string | null;
  cancel_request_status?: string | null;
  no_show?: boolean | null;
  arrived_pax?: number | null;
  arrived_at?: string | null;
};

function pickupLine(row: ChatBookingCardRow): string {
  const kind = pickupKindFromBooking(row);
  const hotel = row.hotel_name?.trim();
  if (kind === "bus") {
    const stop = row.pickup_stop_name?.trim();
    const time = row.pickup_time ? String(row.pickup_time).slice(0, 5) : "";
    return [hotel, stop ? `Bus · ${stop}` : "Bus · stop not set", time].filter(Boolean).join(" · ");
  }
  if (kind === "private") {
    return [hotel, `Private transfer${row.private_zone ? ` from ${row.private_zone}` : ""}`].filter(Boolean).join(" · ");
  }
  return [hotel, "Own way"].filter(Boolean).join(" · ");
}

function statusOf(row: ChatBookingCardRow): Pick<ChatBookingCardDetails, "status" | "statusTone"> {
  if (row.cancelled_at) return { status: "Cancelled", statusTone: "bad" };
  if (row.cancel_request_status === "pending") return { status: "Cancel requested", statusTone: "warn" };
  const arrival = showOpsArrivalMark({
    adults: Number(row.adults ?? 0),
    children: Number(row.children ?? 0),
    infants: Number(row.infants ?? 0),
    arrivedPax: row.arrived_pax ?? null,
    arrivedAt: row.arrived_at ?? null,
    noShow: row.no_show ?? null,
  });
  if (arrival.status === "absent") return { status: "No-show", statusTone: "bad" };
  if (arrival.status === "partial") return { status: arrival.shortLabel || "Part arrived", statusTone: "warn" };
  if (arrival.status === "all_in") return { status: "Arrived", statusTone: "good" };
  return { status: "Booked", statusTone: "neutral" };
}

export function bookingCardDetails(row: ChatBookingCardRow): ChatBookingCardDetails {
  return {
    id: row.id,
    ref: row.booking_ref,
    guestName: row.guest_name?.trim() || "—",
    showName: row.show_name?.trim() || "—",
    island: row.island?.trim() || "",
    showDate: String(row.show_date).slice(0, 10),
    adults: Number(row.adults ?? 0),
    children: Number(row.children ?? 0),
    infants: Number(row.infants ?? 0),
    pickup: pickupLine(row),
    ...statusOf(row),
  };
}

/**
 * What a viewer sees for a booking in chat. Full details only when they may
 * open bookings at all AND the live row came back for them (RLS already hides
 * other businesses and islands). Otherwise just "Booking <ref>".
 */
export function bookingCardFor(
  attachment: ChatBookingAttachment,
  viewer: { canSeeBookings: boolean },
  liveRow: ChatBookingCardRow | null | undefined,
): ChatBookingCard {
  if (!viewer.canSeeBookings || !liveRow || liveRow.id !== attachment.booking_id) {
    return { access: "ref", bookingId: attachment.booking_id, ref: attachment.ref };
  }
  return {
    access: "full",
    bookingId: attachment.booking_id,
    ref: liveRow.booking_ref || attachment.ref,
    details: bookingCardDetails(liveRow),
  };
}

/** Clean a booking search for a PostgREST or() filter. */
export function sanitizeChatSearch(q: string): string {
  return q.replace(/[%_,()*\\"]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

/** Message text as stored: trimmed, capped. */
export function cleanMessageText(text: unknown): string {
  return typeof text === "string" ? text.replace(/\r\n/g, "\n").trim().slice(0, CHAT_MAX_TEXT) : "";
}

/** A short line for the channel list. */
export function messagePreview(
  m: { authorId: string | null; text: string; bookingRef: string | null } | null | undefined,
  meId: string,
): string {
  if (!m) return "";
  const who = m.authorId === meId ? "You: " : "";
  if (m.text) return who + m.text.replace(/\s+/g, " ");
  if (m.bookingRef) return `${who}Booking ${m.bookingRef}`;
  return who.trim();
}
