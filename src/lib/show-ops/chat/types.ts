/**
 * Show Ops team chat — shapes shared by the server, the API routes and the
 * browser. Nothing here touches the database.
 */

export type ChatChannelKind = "team" | "direct" | "group";

export type ChatPerson = {
  id: string;
  name: string;
  /** Show Ops role key (owner, admin, finance, office, booker). */
  role: string;
};

export type ChatChannel = {
  id: string;
  kind: ChatChannelKind;
  /** Stored name; direct chats are named after the other person when shown. */
  name: string;
  memberIds: string[];
  unread: number;
  unreadMentions: number;
  lastMessageAt: string | null;
  /** For the chat list preview line. */
  lastMessage: { authorId: string | null; text: string; bookingRef: string | null } | null;
};

/** What is stored in show_ops_chat_messages.attachment. */
export type ChatBookingAttachment = {
  kind: "booking";
  booking_id: string;
  ref: string;
};

/** A customer WhatsApp/SMS chat sent to a teammate from the inbox. */
export type ChatInboxAttachment = {
  kind: "inbox";
  conversation_id: string;
  label: string;
};

/** What a chat message shows for an inbox card: open it in the customer inbox. */
export type ChatInboxCard = { conversationId: string; label: string };

/**
 * A booking as it appears on a chat card. Built from live data on every read,
 * and deliberately without prices, paid amounts or balances.
 */
export type ChatBookingCardDetails = {
  id: string;
  ref: string;
  guestName: string;
  showName: string;
  island: string;
  showDate: string;
  adults: number;
  children: number;
  infants: number;
  pickup: string;
  status: string;
  statusTone: "neutral" | "good" | "warn" | "bad";
};

export type ChatBookingCard =
  | { access: "full"; bookingId: string; ref: string; details: ChatBookingCardDetails }
  /** The viewer cannot open this booking (no Bookings page, other island, or it is gone). */
  | { access: "ref"; bookingId: string; ref: string };

export type ChatMessage = {
  id: string;
  channelId: string;
  authorId: string | null;
  text: string;
  mentions: string[];
  createdAt: string;
  booking: ChatBookingCard | null;
  inbox: ChatInboxCard | null;
};

export type ChatSyncResponse = {
  meId: string;
  channels: ChatChannel[];
  totalUnread: number;
  /** Present when the request named a channel: its newest messages, oldest first. */
  messages?: ChatMessage[];
};

export type ChatBookingSearchHit = {
  id: string;
  ref: string;
  guestName: string;
  showName: string;
  showDate: string;
};

export type ChatActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T }))
  | { ok: false; error: string };
