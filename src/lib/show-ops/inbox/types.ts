/**
 * Show Ops customer inbox — shapes shared by the server, the API routes and the
 * browser. Nothing here touches the database.
 */

export type InboxChannel = "whatsapp" | "sms";
export type InboxDirection = "in" | "out" | "note" | "event";
export type InboxMessageStatus =
  | "received"
  | "sending"
  | "queued"
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "undelivered"
  | "note";

export type InboxConversation = {
  id: string;
  channel: InboxChannel;
  customerPhone: string;
  customerName: string;
  bookingId: string | null;
  assignedTo: string | null;
  status: "open" | "closed";
  lastMessageAt: string | null;
  lastInboundAt: string | null;
  lastPreview: string;
  lastDirection: InboxDirection | null;
  unread: number;
  /** A teammate sent this chat to me and I have not answered yet. */
  pendingHandoff: { id: string; fromUserId: string | null; note: string } | null;
};

export type InboxMedia = { url: string; type: string };

export type InboxMessage = {
  id: string;
  conversationId: string;
  direction: InboxDirection;
  body: string;
  authorId: string | null;
  source: "inbox" | "ticket" | "template" | "webhook" | "system";
  status: InboxMessageStatus;
  error: string | null;
  /** Count only: files are fetched through /api/show-ops/inbox/media, never linked. */
  mediaCount: number;
  mediaTypes: string[];
  createdAt: string;
  /** Moves when the delivery status changes; the poll asks for anything changed since. */
  updatedAt: string;
};

export type InboxBookingSummary = {
  id: string;
  ref: string;
  guestName: string;
  showName: string;
  showDate: string;
};

export type InboxSyncResponse = {
  meId: string;
  seesAll: boolean;
  /** Twilio connected for this workspace (WhatsApp sender, SMS number). */
  connection: InboxConnectionSummary;
  conversations: InboxConversation[];
  totalUnread: number;
  /** Present when the request named a conversation. */
  messages?: InboxMessage[];
  booking?: InboxBookingSummary | null;
};

export type InboxConnectionSummary = {
  connected: boolean;
  whatsapp: boolean;
  sms: boolean;
  /** A WhatsApp template is set up to start or re-open a chat after 24 hours. */
  reopenTemplate: boolean;
  /** Outbound to guests is switched on (or this number is on the test list). */
  live: boolean;
};

export type InboxActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T }))
  | { ok: false; error: string };

/** A venue's full Google address and its Google Maps link. */
export type TwilioVenue = { address: string; maps_url: string };

/** Stored in show_ops_integrations.meta for provider 'twilio'. The auth token is the encrypted secret. */
export type TwilioIntegrationMeta = {
  account_sid: string;
  whatsapp_from: string;
  sms_from: string;
  webhook_token: string;
  reopen_content_sid: string;
  /** The re-open template has {{1}} for the guest's first name. */
  reopen_uses_name: boolean;
  /** WhatsApp templates for the Hub's own messages (see inbox/templates.ts). */
  booking_content_sid: string;
  booking_transport_content_sid: string;
  pickup_content_sid: string;
  /** Per island: the venue the no-transport booking template points guests to. */
  venues: Record<string, TwilioVenue>;
  /** WhatsApp goes through Twilio (default) or Meta's own Cloud API. SMS is always Twilio. */
  whatsapp_provider: "twilio" | "meta";
  /** Meta Cloud API: the number's phone number ID and the WhatsApp Business Account ID. Token + app secret are encrypted in meta_token_ct / meta_app_secret_ct. */
  meta_phone_number_id: string;
  meta_waba_id: string;
  /** Last four characters of the Meta token, to show which one is saved. */
  meta_token_hint: string;
  /** Meta's approved templates, name → language, as last read from Meta. */
  meta_templates: Record<string, string>;
  hint: string;
};
