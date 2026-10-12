import assert from "node:assert/strict";
import { test } from "node:test";

import {
  bookingCardFor,
  canUseShowOpsChat,
  channelTitle,
  countUnread,
  directChatKey,
  directChatPair,
  formatUnreadBadge,
  messagePreview,
  parseBookingAttachment,
  parseMentions,
  sanitizeChatSearch,
  sortChannels,
  splitMentions,
  totalUnread,
  type ChatBookingCardRow,
} from "./logic";
import type { ChatBookingAttachment, ChatChannel } from "./types";

const ANA = { id: "a", name: "Ana", role: "office" };
const ANA_MARIA = { id: "am", name: "Ana Maria", role: "booker" };
const JOEL = { id: "j", name: "Joel Smith", role: "owner" };
const people = [ANA, ANA_MARIA, JOEL];

test("mentions: full names only, longest name wins", () => {
  assert.deepEqual(parseMentions("@Joel Smith can you check?", people), ["j"]);
  assert.deepEqual(parseMentions("hey @Ana Maria", people), ["am"]);
  assert.deepEqual(parseMentions("@Ana and @Ana Maria", people), ["a", "am"]);
  assert.deepEqual(parseMentions("@ana, lowercase counts", people), ["a"]);
});

test("mentions: no partial words, emails or bare @", () => {
  assert.deepEqual(parseMentions("@Joel is not the full name", people), []);
  assert.deepEqual(parseMentions("mail ana@Ana.com", people), []);
  assert.deepEqual(parseMentions("@Anabel is someone else", people), []);
  assert.deepEqual(parseMentions("nobody here @", people), []);
  assert.deepEqual(parseMentions("no at sign", people), []);
});

test("splitMentions highlights known names and keeps the text intact", () => {
  const parts = splitMentions("Hi @Ana Maria, ask @Joel Smith", people);
  assert.equal(parts.map((p) => p.text).join(""), "Hi @Ana Maria, ask @Joel Smith");
  assert.deepEqual(
    parts.filter((p) => p.personId).map((p) => p.personId),
    ["am", "j"],
  );
  assert.deepEqual(splitMentions("plain", people), [{ text: "plain" }]);
});

test("unread: only other people's messages after the read marker", () => {
  const msgs = [
    { authorId: "j", createdAt: "2026-09-30T10:00:00Z" },
    { authorId: "me", createdAt: "2026-09-30T10:05:00Z" },
    { authorId: "a", createdAt: "2026-09-30T10:06:00Z" },
    { authorId: null, createdAt: "2026-09-30T10:07:00Z" },
  ];
  assert.equal(countUnread(msgs, "me", "2026-09-30T10:01:00Z"), 2);
  assert.equal(countUnread(msgs, "me", "2026-09-30T10:07:00Z"), 0);
  assert.equal(countUnread(msgs, "me", null), 3);
});

test("total unread and the badge text", () => {
  assert.equal(totalUnread([{ unread: 2 }, { unread: 0 }, { unread: 5 }]), 7);
  assert.equal(totalUnread([{ unread: -1 }]), 0);
  assert.equal(formatUnreadBadge(7), "7");
  assert.equal(formatUnreadBadge(150), "99+");
});

test("partner logins never get chat; every staff role does", () => {
  for (const role of ["owner", "admin", "finance", "office", "booker"]) assert.equal(canUseShowOpsChat(role), true, role);
  assert.equal(canUseShowOpsChat("seller"), false);
  assert.equal(canUseShowOpsChat(""), false);
  assert.equal(canUseShowOpsChat(null), false);
});

test("direct chat key is the same whoever starts it", () => {
  assert.equal(directChatKey("b", "a"), directChatKey("a", "b"));
  assert.deepEqual(directChatPair(directChatKey("b", "a")), ["a", "b"]);
  assert.equal(directChatPair("a:b:c"), null);
});

const channel = (over: Partial<ChatChannel>): ChatChannel => ({
  id: "c",
  kind: "group",
  name: "Group",
  memberIds: [],
  unread: 0,
  unreadMentions: 0,
  lastMessageAt: null,
  lastMessage: null,
  ...over,
});

test("channel titles: direct chats are named after the other person", () => {
  assert.equal(channelTitle(channel({ kind: "direct", name: "", memberIds: ["me", "j"] }), people, "me"), "Joel Smith");
  assert.equal(channelTitle(channel({ kind: "team", name: "" }), people, "me"), "Team");
  assert.equal(channelTitle(channel({ kind: "group", name: "Pick-ups" }), people, "me"), "Pick-ups");
});

test("Team first, then most recent", () => {
  const out = sortChannels([
    channel({ id: "old", lastMessageAt: "2026-09-01T00:00:00Z" }),
    channel({ id: "team", kind: "team", lastMessageAt: null }),
    channel({ id: "new", lastMessageAt: "2026-09-29T00:00:00Z" }),
  ]);
  assert.deepEqual(out.map((c) => c.id), ["team", "new", "old"]);
});

const BOOKING_ID = "11111111-2222-4333-8444-555555555555";
const attachment: ChatBookingAttachment = { kind: "booking", booking_id: BOOKING_ID, ref: "MHT-1001" };
const row: ChatBookingCardRow & Record<string, unknown> = {
  id: BOOKING_ID,
  booking_ref: "MHT-1001",
  guest_name: "Jane Doe",
  show_name: "Tenerife Dinner Show",
  island: "Tenerife",
  show_date: "2026-10-02",
  adults: 2,
  children: 1,
  infants: 0,
  pickup_kind: "bus",
  hotel_name: "Hotel Sol",
  pickup_stop_name: "Stop 4",
  pickup_time: "18:15:00",
  cancelled_at: null,
  // Money that must never reach a card even if a row carries it.
  total_cost: 199,
  balance_remaining: 50,
  nett_total: 120,
};

test("booking card: full live details for someone with bookings access", () => {
  const card = bookingCardFor(attachment, { canSeeBookings: true }, row);
  assert.equal(card.access, "full");
  if (card.access !== "full") return;
  assert.equal(card.details.guestName, "Jane Doe");
  assert.equal(card.details.adults, 2);
  assert.equal(card.details.children, 1);
  assert.equal(card.details.pickup, "Hotel Sol · Bus · Stop 4 · 18:15");
  assert.equal(card.details.status, "Booked");
});

test("booking card never carries money", () => {
  const card = bookingCardFor(attachment, { canSeeBookings: true }, row);
  const json = JSON.stringify(card);
  for (const key of ["total_cost", "balance_remaining", "nett_total", "199", "120"]) {
    assert.equal(json.includes(key), false, key);
  }
});

test("booking card: reference only without bookings access or when RLS hides it", () => {
  assert.deepEqual(bookingCardFor(attachment, { canSeeBookings: false }, row), {
    access: "ref",
    bookingId: BOOKING_ID,
    ref: "MHT-1001",
  });
  // Other island / deleted: the viewer's query returned nothing.
  assert.equal(bookingCardFor(attachment, { canSeeBookings: true }, null).access, "ref");
  // A mismatched row is never shown against this attachment.
  assert.equal(bookingCardFor(attachment, { canSeeBookings: true }, { ...row, id: "other" }).access, "ref");
});

test("booking card status: cancelled, cancel requested, arrivals", () => {
  const status = (over: Partial<ChatBookingCardRow>) => {
    const card = bookingCardFor(attachment, { canSeeBookings: true }, { ...row, ...over });
    return card.access === "full" ? card.details.status : null;
  };
  assert.equal(status({ cancelled_at: "2026-09-30T00:00:00Z" }), "Cancelled");
  assert.equal(status({ cancel_request_status: "pending" }), "Cancel requested");
  assert.equal(status({ arrived_pax: 3 }), "Arrived");
  assert.equal(status({ arrived_pax: 0 }), "No-show");
  assert.equal(status({ arrived_pax: 1 }), "1 / 3 showed");
});

test("attachment parsing rejects anything that is not a booking", () => {
  assert.deepEqual(parseBookingAttachment(attachment), attachment);
  assert.equal(parseBookingAttachment({ kind: "invoice", booking_id: BOOKING_ID, ref: "x" }), null);
  assert.equal(parseBookingAttachment({ kind: "booking", booking_id: "nope", ref: "x" }), null);
  assert.equal(parseBookingAttachment({ kind: "booking", booking_id: BOOKING_ID, ref: " " }), null);
  assert.equal(parseBookingAttachment(null), null);
});

test("search text is safe for a PostgREST or() filter", () => {
  assert.equal(sanitizeChatSearch("  MHT-10,01 (x) % "), "MHT-10 01 x");
  assert.equal(sanitizeChatSearch("O'Brien"), "O'Brien");
  assert.equal(sanitizeChatSearch('say "hi"'), "say hi");
});

test("preview line", () => {
  assert.equal(messagePreview({ authorId: "me", text: "hi\nthere", bookingRef: null }, "me"), "You: hi there");
  assert.equal(messagePreview({ authorId: "j", text: "", bookingRef: "MHT-1" }, "me"), "Booking MHT-1");
  assert.equal(messagePreview(null, "me"), "");
});
