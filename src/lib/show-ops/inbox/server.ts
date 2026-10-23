/**
 * Show Ops customer inbox — server side.
 *
 * Reads go through the signed-in user's client, so RLS (migration
 * 20261014120000) decides what comes back. Writes happen here only, after the
 * checks below, with the service role: staff can never write these tables from
 * the browser. The Twilio webhook has no user and uses the service role too,
 * after the request's signature has been checked with the workspace's token.
 */

import { randomUUID } from "node:crypto";

import { requireShowOpsEnabled, type ShowOpsContext } from "@/lib/show-ops/access";
import { chatViewerFromContext, loadChatPeople, openOrCreateChannel, postChatMessage } from "@/lib/show-ops/chat/server";
import type { ChatPerson } from "@/lib/show-ops/chat/types";
import {
  connectionSummary,
  loadTwilioConnection,
  phoneOutboundAllowed,
  statusWebhookUrl,
  type TwilioConnection,
} from "@/lib/show-ops/inbox/connection";
import {
  canUseShowOpsInbox,
  cleanText,
  firstName,
  formatPhone,
  INBOX_MAX_NOTE,
  inboxSeesAll,
  isUuid,
  mapTwilioStatus,
  normalisePhone,
  phoneTail,
  previewOf,
  replyBlock,
  shouldApplyStatus,
  twilioErrorText,
  type InboundTwilioMessage,
} from "@/lib/show-ops/inbox/logic";
import { templateSpec } from "@/lib/show-ops/inbox/templates";
import { sendTwilioMessage } from "@/lib/show-ops/inbox/twilio";
import type {
  InboxBookingSummary,
  InboxChannel,
  InboxConversation,
  InboxDirection,
  InboxMessage,
  InboxMessageStatus,
  InboxSyncResponse,
} from "@/lib/show-ops/inbox/types";
import { canSeeShowOpsPage } from "@/lib/show-ops/nav";
import { SHOW_OPS_OUTBOUND_HELD } from "@/lib/show-ops/outbound";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export class InboxAccessError extends Error {}

export type InboxViewer = {
  ctx: ShowOpsContext;
  meId: string;
  businessId: string;
  seesAll: boolean;
  canSeeBookings: boolean;
};

function isNextRedirect(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "digest" in e &&
    typeof (e as { digest?: unknown }).digest === "string" &&
    (e as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

function admin() {
  return createSupabaseServiceRoleClient();
}

/** Before the migration is applied the tables do not exist: the inbox just looks empty. */
function missingSchema(message: string | undefined): boolean {
  return /show_ops_inbox|inbox_all|does not exist|schema cache/i.test(message ?? "");
}

export async function inboxViewerFromContext(ctx: ShowOpsContext): Promise<InboxViewer | null> {
  if (!ctx.business.show_ops_enabled || !canUseShowOpsInbox(ctx.role)) return null;
  let flag = false;
  if (!ctx.isOwner && ctx.role !== "admin") {
    const { data, error } = await ctx.supabase
      .from("show_ops_members")
      .select("inbox_all")
      .eq("business_id", ctx.business.id)
      .eq("user_id", ctx.user.id)
      .maybeSingle();
    if (!error) flag = Boolean((data as { inbox_all?: boolean } | null)?.inbox_all);
  }
  return {
    ctx,
    meId: ctx.user.id,
    businessId: ctx.business.id,
    seesAll: inboxSeesAll(ctx.isOwner ? "owner" : ctx.role, flag),
    canSeeBookings: canSeeShowOpsPage(ctx.role, ctx.allowedPages, "bookings"),
  };
}

/** For API routes and server actions, which answer with an error instead of a redirect. */
export async function getInboxViewer(): Promise<InboxViewer | null> {
  let ctx: ShowOpsContext;
  try {
    ctx = await requireShowOpsEnabled();
  } catch (e) {
    if (isNextRedirect(e)) return null;
    throw e;
  }
  return inboxViewerFromContext(ctx);
}

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

type ConversationRow = {
  id: string;
  business_id: string;
  channel: InboxChannel;
  customer_phone: string;
  customer_name: string;
  booking_id: string | null;
  assigned_to: string | null;
  status: "open" | "closed";
  last_message_at: string | null;
  last_inbound_at: string | null;
  last_preview: string;
  last_direction: InboxDirection | null;
};

const CONVERSATION_COLUMNS =
  "id,business_id,channel,customer_phone,customer_name,booking_id,assigned_to,status,last_message_at,last_inbound_at,last_preview,last_direction";

type MessageRow = {
  id: string;
  conversation_id: string;
  direction: InboxDirection;
  body: string;
  author_id: string | null;
  source: InboxMessage["source"];
  status: InboxMessageStatus;
  error: string | null;
  media: unknown;
  created_at: string;
  updated_at: string;
};

const MESSAGE_COLUMNS = "id,conversation_id,direction,body,author_id,source,status,error,media,created_at,updated_at";

function toMessage(r: MessageRow): InboxMessage {
  const media = Array.isArray(r.media) ? (r.media as { type?: unknown }[]) : [];
  return {
    id: r.id,
    conversationId: r.conversation_id,
    direction: r.direction,
    body: r.body ?? "",
    authorId: r.author_id,
    source: r.source,
    status: r.status,
    error: r.error,
    mediaCount: media.length,
    mediaTypes: media.map((m) => String(m?.type ?? "")),
    createdAt: r.created_at,
    updatedAt: r.updated_at ?? r.created_at,
  };
}

export async function listInbox(viewer: InboxViewer): Promise<Omit<InboxSyncResponse, "meId" | "seesAll" | "connection">> {
  const { data, error } = await viewer.ctx.supabase.rpc("show_ops_inbox_list", { p_business_id: viewer.businessId });
  if (error) {
    if (missingSchema(error.message)) return { conversations: [], totalUnread: 0 };
    throw new Error("Could not load the inbox.");
  }
  const conversations: InboxConversation[] = ((data ?? []) as (ConversationRow & {
    unread: number;
    pending_handoff_id: string | null;
    pending_handoff_from: string | null;
    pending_handoff_note: string | null;
  })[]).map((r) => ({
    id: r.id,
    channel: r.channel,
    customerPhone: r.customer_phone,
    customerName: r.customer_name ?? "",
    bookingId: r.booking_id,
    assignedTo: r.assigned_to,
    status: r.status,
    lastMessageAt: r.last_message_at,
    lastInboundAt: r.last_inbound_at,
    lastPreview: r.last_preview ?? "",
    lastDirection: r.last_direction,
    unread: Math.max(0, Number(r.unread) || 0),
    pendingHandoff: r.pending_handoff_id
      ? { id: r.pending_handoff_id, fromUserId: r.pending_handoff_from, note: r.pending_handoff_note ?? "" }
      : null,
  }));
  // The nav badge counts what is mine to deal with: assigned to me, sent to me, or (whole-inbox people) nobody's yet.
  const totalUnread = conversations.reduce((sum, c) => {
    const mine = c.assignedTo === viewer.meId || c.pendingHandoff || (viewer.seesAll && !c.assignedTo);
    return sum + (mine ? c.unread : 0) + (c.pendingHandoff ? 1 : 0);
  }, 0);
  return { conversations, totalUnread };
}

export async function inboxSync(viewer: InboxViewer, conversationId?: string | null, after?: string | null): Promise<InboxSyncResponse> {
  const [list, conn] = await Promise.all([listInbox(viewer), loadTwilioConnection(viewer.businessId)]);
  const body: InboxSyncResponse = {
    meId: viewer.meId,
    seesAll: viewer.seesAll,
    connection: connectionSummary(conn),
    ...list,
  };
  if (conversationId) {
    const conv = await assertCanSee(viewer, conversationId);
    body.messages = await loadInboxMessages(viewer, conv.id, after);
    body.booking = conv.booking_id ? await bookingSummary(viewer, conv.booking_id) : null;
  }
  return body;
}

/** The conversation, if this person may read it (RLS decides). Throws otherwise. */
export async function assertCanSee(viewer: InboxViewer, conversationId: string): Promise<ConversationRow> {
  if (!isUuid(conversationId)) throw new InboxAccessError("That chat does not exist.");
  const { data } = await viewer.ctx.supabase
    .from("show_ops_inbox_conversations")
    .select(CONVERSATION_COLUMNS)
    .eq("id", conversationId)
    .eq("business_id", viewer.businessId)
    .maybeSingle();
  if (!data) throw new InboxAccessError("That chat does not exist, or it is not yours to open.");
  return data as ConversationRow;
}

export async function loadInboxMessages(viewer: InboxViewer, conversationId: string, after?: string | null): Promise<InboxMessage[]> {
  let q = viewer.ctx.supabase
    .from("show_ops_inbox_messages")
    .select(MESSAGE_COLUMNS)
    .eq("conversation_id", conversationId)
    .eq("business_id", viewer.businessId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (after && !Number.isNaN(Date.parse(after))) q = q.gt("updated_at", new Date(after).toISOString());
  const { data, error } = await q;
  if (error) throw new Error("Could not load messages.");
  return ((data ?? []) as MessageRow[]).reverse().map(toMessage);
}

async function bookingSummary(viewer: InboxViewer, bookingId: string): Promise<InboxBookingSummary | null> {
  if (!viewer.canSeeBookings) return null;
  const { data } = await viewer.ctx.supabase
    .from("show_bookings")
    .select("id,booking_ref,guest_name,show_name,show_date")
    .eq("id", bookingId)
    .eq("business_id", viewer.businessId)
    .maybeSingle();
  if (!data) return null;
  const b = data as { id: string; booking_ref: string; guest_name: string | null; show_name: string | null; show_date: string };
  return { id: b.id, ref: b.booking_ref, guestName: b.guest_name ?? "", showName: b.show_name ?? "", showDate: String(b.show_date).slice(0, 10) };
}

/** Raw media list for the media proxy (after an access check). */
export async function messageMedia(viewer: InboxViewer, messageId: string): Promise<{ url: string; type: string }[]> {
  if (!isUuid(messageId)) throw new InboxAccessError("Not found.");
  const { data } = await viewer.ctx.supabase
    .from("show_ops_inbox_messages")
    .select("media")
    .eq("id", messageId)
    .eq("business_id", viewer.businessId)
    .maybeSingle();
  if (!data) throw new InboxAccessError("Not found.");
  const media = (data as { media: unknown }).media;
  return Array.isArray(media) ? (media as { url: string; type: string }[]) : [];
}

export async function markInboxRead(viewer: InboxViewer, conversationId: string, upTo?: string | null): Promise<void> {
  const conv = await assertCanSee(viewer, conversationId);
  const now = Date.now();
  const at = upTo && !Number.isNaN(Date.parse(upTo)) ? Math.min(Date.parse(upTo), now + 5 * 60_000) : now;
  const stamp = new Date(at).toISOString();
  const db = admin();
  const { data: existing } = await db
    .from("show_ops_inbox_reads")
    .select("last_read_at")
    .eq("conversation_id", conv.id)
    .eq("user_id", viewer.meId)
    .maybeSingle();
  const prev = (existing as { last_read_at?: string } | null)?.last_read_at;
  if (prev && Date.parse(prev) >= at) return;
  await db
    .from("show_ops_inbox_reads")
    .upsert({ conversation_id: conv.id, business_id: viewer.businessId, user_id: viewer.meId, last_read_at: stamp }, { onConflict: "conversation_id,user_id" });
}

/* ------------------------------------------------------------------ *
 * Writing (service role, after the checks)
 * ------------------------------------------------------------------ */

async function insertMessage(row: {
  conversation: Pick<ConversationRow, "id" | "business_id">;
  direction: InboxDirection;
  body: string;
  authorId: string | null;
  source: InboxMessage["source"];
  status: InboxMessageStatus;
  providerSid?: string | null;
  error?: string | null;
  media?: { url: string; type: string }[];
}): Promise<MessageRow | null> {
  const { data, error } = await admin()
    .from("show_ops_inbox_messages")
    .insert({
      conversation_id: row.conversation.id,
      business_id: row.conversation.business_id,
      direction: row.direction,
      body: row.body,
      author_id: row.authorId,
      source: row.source,
      status: row.status,
      provider_sid: row.providerSid ?? null,
      error: row.error ?? null,
      media: row.media ?? [],
    })
    .select(MESSAGE_COLUMNS)
    .single();
  if (error) {
    // The same Twilio message twice (webhook retry): already stored.
    if (/duplicate key|show_ops_inbox_messages_provider_sid_uq/i.test(error.message)) return null;
    throw new Error("Could not save the message.");
  }
  return data as MessageRow;
}

async function touchConversation(
  conversationId: string,
  patch: { direction: InboxDirection; body: string; mediaCount?: number; inbound?: boolean; extra?: Record<string, unknown> },
) {
  const now = new Date().toISOString();
  const update: Record<string, unknown> = { updated_at: now, ...(patch.extra ?? {}) };
  if (patch.direction === "in" || patch.direction === "out") {
    update.last_message_at = now;
    update.last_preview = previewOf(patch.body, patch.direction, patch.mediaCount ?? 0);
    update.last_direction = patch.direction;
  }
  if (patch.inbound) update.last_inbound_at = now;
  await admin().from("show_ops_inbox_conversations").update(update).eq("id", conversationId);
}

async function logEvent(conversation: Pick<ConversationRow, "id" | "business_id">, text: string, authorId: string | null) {
  await insertMessage({ conversation, direction: "event", body: text.slice(0, 500), authorId, source: "system", status: "note" }).catch(() => undefined);
  await admin().from("show_ops_inbox_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversation.id);
}

async function peopleFor(viewer: InboxViewer): Promise<ChatPerson[]> {
  const chatViewer = chatViewerFromContext(viewer.ctx);
  return chatViewer ? loadChatPeople(chatViewer) : [];
}

function nameIn(people: ChatPerson[], id: string | null | undefined): string {
  return (id && people.find((p) => p.id === id)?.name) || "a teammate";
}

/**
 * Sends one message to the guest through the workspace's Twilio account and
 * records it in the conversation (also when Twilio refuses it, so the office
 * sees what failed and why).
 */
async function deliver(
  conn: TwilioConnection,
  conversation: ConversationRow,
  input: { body: string; authorId: string | null; source: "inbox" | "ticket" | "template"; template?: { sid: string; variables?: Record<string, string> } },
): Promise<MessageRow> {
  const from = conversation.channel === "whatsapp" ? conn.meta.whatsapp_from : conn.meta.sms_from;
  if (!from) throw new InboxAccessError(conversation.channel === "whatsapp" ? "No WhatsApp sender is set up." : "No SMS number is set up.");
  if (!phoneOutboundAllowed(conversation.customer_phone)) throw new InboxAccessError(SHOW_OPS_OUTBOUND_HELD);

  const saved = await insertMessage({
    conversation,
    direction: "out",
    body: input.body,
    authorId: input.authorId,
    source: input.source,
    status: "sending",
  });
  if (!saved) throw new Error("Could not save the message.");

  const res = await sendTwilioMessage(conn.creds, {
    channel: conversation.channel,
    from,
    to: conversation.customer_phone,
    body: input.template ? undefined : input.body,
    contentSid: input.template?.sid,
    contentVariables: input.template?.variables,
    statusCallback: conn.meta.webhook_token ? statusWebhookUrl(conn.meta.webhook_token) : undefined,
  });
  const db = admin();
  const now = new Date().toISOString();
  if (res.ok) {
    const status = mapTwilioStatus(res.status) ?? "queued";
    await db.from("show_ops_inbox_messages").update({ provider_sid: res.sid, status, updated_at: now }).eq("id", saved.id);
    saved.status = status;
  } else {
    await db.from("show_ops_inbox_messages").update({ status: "failed", error: res.message, updated_at: now }).eq("id", saved.id);
    saved.status = "failed";
    saved.error = res.message;
  }
  await touchConversation(conversation.id, { direction: "out", body: input.body });
  if (!res.ok) throw new InboxAccessError(res.message);
  return saved;
}

async function requireConnection(viewer: InboxViewer): Promise<TwilioConnection> {
  const conn = await loadTwilioConnection(viewer.businessId);
  if (!conn) throw new InboxAccessError("WhatsApp & SMS are not connected yet. A Director or Superadmin can connect Twilio in Settings.");
  return conn;
}

/** Answering an unassigned chat makes it yours. */
async function claimIfUnassigned(viewer: InboxViewer, conv: ConversationRow) {
  if (conv.assigned_to) return;
  await admin().from("show_ops_inbox_conversations").update({ assigned_to: viewer.meId }).eq("id", conv.id).is("assigned_to", null);
  conv.assigned_to = viewer.meId;
}

export async function sendInboxReply(viewer: InboxViewer, input: { conversationId: string; text: unknown }): Promise<InboxMessage> {
  const conv = await assertCanSee(viewer, input.conversationId);
  const text = cleanText(input.text);
  if (!text) throw new InboxAccessError("Write a message first.");
  const conn = await requireConnection(viewer);
  const block = replyBlock({
    seesAll: viewer.seesAll,
    meId: viewer.meId,
    assignedTo: conv.assigned_to,
    channel: conv.channel,
    lastInboundAt: conv.last_inbound_at,
    senderConfigured: Boolean(conv.channel === "whatsapp" ? conn.meta.whatsapp_from : conn.meta.sms_from),
  });
  if (!block.ok) throw new InboxAccessError(block.message);
  await claimIfUnassigned(viewer, conv);
  if (conv.status === "closed") await admin().from("show_ops_inbox_conversations").update({ status: "open" }).eq("id", conv.id);
  const saved = await deliver(conn, conv, { body: text, authorId: viewer.meId, source: "inbox" });
  await markInboxRead(viewer, conv.id).catch(() => undefined);
  return toMessage(saved);
}

/** Staff-only note in the conversation. The guest never sees it. */
export async function addInboxNote(viewer: InboxViewer, input: { conversationId: string; text: unknown }): Promise<InboxMessage> {
  const conv = await assertCanSee(viewer, input.conversationId);
  const text = cleanText(input.text, INBOX_MAX_NOTE);
  if (!text) throw new InboxAccessError("Write the note first.");
  const saved = await insertMessage({ conversation: conv, direction: "note", body: text, authorId: viewer.meId, source: "inbox", status: "note" });
  if (!saved) throw new Error("Could not save the note.");
  await admin().from("show_ops_inbox_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conv.id);
  return toMessage(saved);
}

function templateFor(conn: TwilioConnection, customerName: string) {
  if (!conn.meta.reopen_content_sid) return null;
  return {
    sid: conn.meta.reopen_content_sid,
    variables: conn.meta.reopen_uses_name ? { "1": firstName(customerName) } : undefined,
  };
}

/** WhatsApp after 24 hours: the approved template is the only thing allowed. */
export async function sendReopenTemplate(viewer: InboxViewer, input: { conversationId: string }): Promise<InboxMessage> {
  const conv = await assertCanSee(viewer, input.conversationId);
  if (conv.channel !== "whatsapp") throw new InboxAccessError("Templates are for WhatsApp chats only.");
  if (!viewer.seesAll && conv.assigned_to !== viewer.meId) throw new InboxAccessError("Accept this chat first, or ask whoever has it.");
  const conn = await requireConnection(viewer);
  const template = templateFor(conn, conv.customer_name);
  if (!template) throw new InboxAccessError("No WhatsApp template set up yet (Settings).");
  await claimIfUnassigned(viewer, conv);
  const saved = await deliver(conn, conv, {
    body: "WhatsApp template sent to re-open the chat. You can write freely once the guest replies.",
    authorId: viewer.meId,
    source: "template",
    template,
  });
  return toMessage(saved);
}

async function upsertConversation(input: {
  businessId: string;
  channel: InboxChannel;
  phone: string;
  name?: string;
  bookingId?: string | null;
  assignTo?: string | null;
}): Promise<ConversationRow> {
  const db = admin();
  const find = async () => {
    const { data } = await db
      .from("show_ops_inbox_conversations")
      .select(CONVERSATION_COLUMNS)
      .eq("business_id", input.businessId)
      .eq("channel", input.channel)
      .eq("customer_phone", input.phone)
      .maybeSingle();
    return data as ConversationRow | null;
  };
  const existing = await find();
  if (existing) {
    const patch: Record<string, unknown> = {};
    if (!existing.customer_name && input.name) patch.customer_name = input.name.slice(0, 120);
    if (!existing.booking_id && input.bookingId) patch.booking_id = input.bookingId;
    if (!existing.assigned_to && input.assignTo) patch.assigned_to = input.assignTo;
    if (Object.keys(patch).length) {
      await db.from("show_ops_inbox_conversations").update(patch).eq("id", existing.id);
      Object.assign(existing, patch);
    }
    return existing;
  }
  const { error } = await db.from("show_ops_inbox_conversations").insert({
    id: randomUUID(),
    business_id: input.businessId,
    channel: input.channel,
    customer_phone: input.phone,
    customer_name: (input.name ?? "").slice(0, 120),
    booking_id: input.bookingId ?? null,
    assigned_to: input.assignTo ?? null,
  });
  // A webhook and a send racing for the same number: the other one won, use it.
  const row = await find();
  if (!row) throw new Error(error ? "Could not start the chat." : "Could not load the chat.");
  return row;
}

/**
 * New message to a guest from the inbox (or a booking). SMS can start with any
 * text; WhatsApp has to start with the approved template.
 */
export async function startInboxConversation(
  viewer: InboxViewer,
  input: { phone: unknown; channel: unknown; name?: unknown; bookingId?: unknown; text?: unknown },
): Promise<string> {
  const channel: InboxChannel = input.channel === "sms" ? "sms" : "whatsapp";
  const conn = await requireConnection(viewer);

  let bookingId: string | null = null;
  let bookingMobile = "";
  let name = typeof input.name === "string" ? input.name.trim().slice(0, 120) : "";
  if (isUuid(input.bookingId)) {
    const summary = await bookingSummary(viewer, input.bookingId);
    if (!summary) throw new InboxAccessError("That booking does not exist or is not on your islands.");
    bookingId = summary.id;
    name = name || summary.guestName;
    // The viewer's own client: RLS already allowed this booking above.
    const { data } = await viewer.ctx.supabase.from("show_bookings").select("guest_mobile").eq("id", summary.id).maybeSingle();
    bookingMobile = String((data as { guest_mobile?: string | null } | null)?.guest_mobile ?? "");
  }
  const typed = String(input.phone ?? "").trim();
  const phone = normalisePhone(typed || bookingMobile);
  if (!phone) {
    throw new InboxAccessError(
      typed || !bookingMobile
        ? "Enter the guest's mobile with its country code, e.g. +34 612 345 678."
        : "The mobile on that booking is not a full number. Type it with its country code.",
    );
  }

  const conv = await upsertConversation({ businessId: viewer.businessId, channel, phone, name, bookingId, assignTo: viewer.meId });
  // It existed already and belongs to someone else: only whole-inbox people may write into it.
  if (conv.assigned_to && conv.assigned_to !== viewer.meId && !viewer.seesAll) {
    throw new InboxAccessError("Someone else on the team already has a chat with this number. Ask them to send it to you.");
  }
  if (conv.status === "closed") await admin().from("show_ops_inbox_conversations").update({ status: "open" }).eq("id", conv.id);

  if (channel === "sms") {
    const text = cleanText(input.text);
    if (!text) throw new InboxAccessError("Write the first message.");
    if (!conn.meta.sms_from) throw new InboxAccessError("No SMS number set up yet (Settings).");
    await deliver(conn, conv, { body: text, authorId: viewer.meId, source: "inbox" });
  } else {
    if (!conn.meta.whatsapp_from) throw new InboxAccessError("No WhatsApp number set up yet (Settings).");
    const text = cleanText(input.text);
    if (text && conv.last_inbound_at && Date.now() - Date.parse(conv.last_inbound_at) < 24 * 3600_000) {
      await deliver(conn, conv, { body: text, authorId: viewer.meId, source: "inbox" });
    } else {
      const template = templateFor(conn, name || conv.customer_name);
      if (!template) {
        throw new InboxAccessError(
          "WhatsApp needs an approved template to message a guest first. Add the re-open template in Settings, or start this one by SMS.",
        );
      }
      await deliver(conn, conv, {
        body: "WhatsApp template sent to start the chat. You can write freely once the guest replies.",
        authorId: viewer.meId,
        source: "template",
        template,
      });
    }
  }
  return conv.id;
}

/* ------------------------------------------------------------------ *
 * Ownership: take, release, send to a teammate, accept, decline, close
 * ------------------------------------------------------------------ */

export async function takeConversation(viewer: InboxViewer, conversationId: string): Promise<void> {
  const conv = await assertCanSee(viewer, conversationId);
  if (!viewer.seesAll) throw new InboxAccessError("Only people who see the whole inbox can take a chat. Ask for it to be sent to you.");
  if (conv.assigned_to === viewer.meId) return;
  await admin().from("show_ops_inbox_conversations").update({ assigned_to: viewer.meId, updated_at: new Date().toISOString() }).eq("id", conv.id);
  const people = await peopleFor(viewer);
  await logEvent(conv, conv.assigned_to ? `${nameIn(people, viewer.meId)} took this chat over from ${nameIn(people, conv.assigned_to)}.` : `${nameIn(people, viewer.meId)} took this chat.`, viewer.meId);
}

export async function releaseConversation(viewer: InboxViewer, conversationId: string): Promise<void> {
  const conv = await assertCanSee(viewer, conversationId);
  if (conv.assigned_to !== viewer.meId && !viewer.seesAll) throw new InboxAccessError("This chat is not yours.");
  if (!conv.assigned_to) return;
  await admin().from("show_ops_inbox_conversations").update({ assigned_to: null, updated_at: new Date().toISOString() }).eq("id", conv.id);
  const people = await peopleFor(viewer);
  await logEvent(conv, `${nameIn(people, viewer.meId)} put this chat back in the shared inbox.`, viewer.meId);
}

/**
 * Sends the whole conversation to a teammate: they get a card in their direct
 * chat, can open and read it straight away, and become its owner when they accept.
 */
export async function sendConversationToTeammate(
  viewer: InboxViewer,
  input: { conversationId: string; toUserId: unknown; note?: unknown },
): Promise<{ chatChannelId: string | null }> {
  const conv = await assertCanSee(viewer, input.conversationId);
  if (!viewer.seesAll && conv.assigned_to !== viewer.meId) {
    throw new InboxAccessError("Accept this chat before sending it on.");
  }
  const toUserId = String(input.toUserId ?? "");
  const people = await peopleFor(viewer);
  if (!isUuid(toUserId) || !people.some((p) => p.id === toUserId)) throw new InboxAccessError("Pick someone on the team.");
  if (toUserId === viewer.meId) throw new InboxAccessError("Pick someone else on the team.");
  if (toUserId === conv.assigned_to) throw new InboxAccessError(`${nameIn(people, toUserId)} already has this chat.`);
  const note = cleanText(input.note, INBOX_MAX_NOTE);

  const db = admin();
  const now = new Date().toISOString();
  // One open offer per chat: a new one replaces any earlier unanswered one.
  await db
    .from("show_ops_inbox_handoffs")
    .update({ status: "cancelled", responded_at: now })
    .eq("conversation_id", conv.id)
    .eq("status", "pending");
  const { error } = await db.from("show_ops_inbox_handoffs").insert({
    conversation_id: conv.id,
    business_id: conv.business_id,
    from_user: viewer.meId,
    to_user: toUserId,
    note,
  });
  if (error) throw new Error("Could not send the chat.");
  await logEvent(conv, `${nameIn(people, viewer.meId)} sent this chat to ${nameIn(people, toUserId)}${note ? `: “${note}”` : "."}`, viewer.meId);

  // The card in team chat. Best effort: the handoff stands even if chat is unavailable.
  let chatChannelId: string | null = null;
  const chatViewer = chatViewerFromContext(viewer.ctx);
  if (chatViewer) {
    try {
      chatChannelId = await openOrCreateChannel(chatViewer, { kind: "direct", userId: toUserId });
      const who = conv.customer_name || formatPhone(conv.customer_phone);
      await postChatMessage(chatViewer, {
        channelId: chatChannelId,
        text: note || `Can you take this ${conv.channel === "whatsapp" ? "WhatsApp" : "SMS"} chat with ${who}?`,
        inbox: { conversationId: conv.id, label: `${conv.channel === "whatsapp" ? "WhatsApp" : "SMS"} · ${who}`.slice(0, 120) },
      });
    } catch (e) {
      console.error("[show-ops inbox] chat card", e instanceof Error ? e.message : e);
    }
  }
  return { chatChannelId };
}

async function pendingHandoffForMe(viewer: InboxViewer, handoffId: string) {
  if (!isUuid(handoffId)) throw new InboxAccessError("That request does not exist.");
  const { data } = await viewer.ctx.supabase
    .from("show_ops_inbox_handoffs")
    .select("id,conversation_id,business_id,from_user,to_user,status")
    .eq("id", handoffId)
    .eq("business_id", viewer.businessId)
    .maybeSingle();
  const h = data as { id: string; conversation_id: string; business_id: string; from_user: string | null; to_user: string; status: string } | null;
  if (!h || h.to_user !== viewer.meId) throw new InboxAccessError("That request does not exist.");
  if (h.status !== "pending") throw new InboxAccessError(h.status === "cancelled" ? "This chat was sent to someone else instead." : "You already answered this one.");
  return h;
}

export async function acceptHandoff(viewer: InboxViewer, handoffId: string): Promise<string> {
  const h = await pendingHandoffForMe(viewer, handoffId);
  const db = admin();
  const now = new Date().toISOString();
  const { data: claimed } = await db
    .from("show_ops_inbox_handoffs")
    .update({ status: "accepted", responded_at: now })
    .eq("id", h.id)
    .eq("status", "pending")
    .select("id");
  if (!claimed?.length) throw new InboxAccessError("You already answered this one.");
  await db.from("show_ops_inbox_conversations").update({ assigned_to: viewer.meId, status: "open", updated_at: now }).eq("id", h.conversation_id);
  const people = await peopleFor(viewer);
  await logEvent({ id: h.conversation_id, business_id: h.business_id }, `${nameIn(people, viewer.meId)} accepted this chat from ${nameIn(people, h.from_user)}.`, viewer.meId);
  return h.conversation_id;
}

export async function declineHandoff(viewer: InboxViewer, handoffId: string): Promise<void> {
  const h = await pendingHandoffForMe(viewer, handoffId);
  const now = new Date().toISOString();
  await admin().from("show_ops_inbox_handoffs").update({ status: "declined", responded_at: now }).eq("id", h.id).eq("status", "pending");
  const people = await peopleFor(viewer);
  await logEvent({ id: h.conversation_id, business_id: h.business_id }, `${nameIn(people, viewer.meId)} passed on this chat (sent by ${nameIn(people, h.from_user)}).`, viewer.meId);
}

export async function setConversationStatus(viewer: InboxViewer, conversationId: string, status: "open" | "closed"): Promise<void> {
  const conv = await assertCanSee(viewer, conversationId);
  if (!viewer.seesAll && conv.assigned_to !== viewer.meId) throw new InboxAccessError("This chat is not yours.");
  if (conv.status === status) return;
  await admin().from("show_ops_inbox_conversations").update({ status, updated_at: new Date().toISOString() }).eq("id", conv.id);
  const people = await peopleFor(viewer);
  await logEvent(conv, `${nameIn(people, viewer.meId)} ${status === "closed" ? "closed" : "reopened"} this chat.`, viewer.meId);
}

export async function linkConversationBooking(viewer: InboxViewer, conversationId: string, bookingId: string | null): Promise<void> {
  const conv = await assertCanSee(viewer, conversationId);
  if (!viewer.seesAll && conv.assigned_to !== viewer.meId) throw new InboxAccessError("This chat is not yours.");
  let summary: InboxBookingSummary | null = null;
  if (bookingId) {
    summary = await bookingSummary(viewer, bookingId);
    if (!summary) throw new InboxAccessError("That booking does not exist or is not on your islands.");
  }
  const patch: Record<string, unknown> = { booking_id: summary?.id ?? null, updated_at: new Date().toISOString() };
  if (summary && !conv.customer_name) patch.customer_name = summary.guestName.slice(0, 120);
  await admin().from("show_ops_inbox_conversations").update(patch).eq("id", conv.id);
  const people = await peopleFor(viewer);
  await logEvent(conv, summary ? `${nameIn(people, viewer.meId)} linked booking ${summary.ref}.` : `${nameIn(people, viewer.meId)} unlinked the booking.`, viewer.meId);
}

/* ------------------------------------------------------------------ *
 * Twilio webhooks (no user; the signature was checked by the route)
 * ------------------------------------------------------------------ */

/** The most likely booking for a guest number: nearest upcoming show, else the latest. */
async function matchBooking(businessId: string, phone: string): Promise<{ id: string; guestName: string } | null> {
  const tail = phoneTail(phone);
  if (tail.length < 9) return null;
  const since = new Date(Date.now() - 45 * 86400_000).toISOString().slice(0, 10);
  const { data } = await admin()
    .from("show_bookings")
    .select("id,guest_name,guest_mobile,show_date,cancelled_at")
    .eq("business_id", businessId)
    .gte("show_date", since)
    .not("guest_mobile", "is", null)
    .ilike("guest_mobile", `%${tail.slice(-3)}%`)
    .order("show_date", { ascending: true })
    .limit(500);
  const rows = ((data ?? []) as { id: string; guest_name: string | null; guest_mobile: string | null; show_date: string; cancelled_at: string | null }[]).filter(
    (b) => phoneTail(String(b.guest_mobile ?? "")) === tail,
  );
  if (!rows.length) return null;
  const today = new Date().toISOString().slice(0, 10);
  const live = rows.filter((b) => !b.cancelled_at);
  const pick = live.find((b) => b.show_date >= today) ?? live.at(-1) ?? rows.at(-1)!;
  return { id: pick.id, guestName: pick.guest_name ?? "" };
}

export async function recordInboundMessage(conn: TwilioConnection, msg: InboundTwilioMessage): Promise<void> {
  // Only numbers this workspace owns: a misconfigured Twilio number must not leak into another inbox.
  const ours = [conn.meta.whatsapp_from, conn.meta.sms_from].filter(Boolean);
  if (ours.length && !ours.includes(msg.to)) {
    console.warn("[show-ops inbox] inbound to a number not set up in Settings; ignored");
    return;
  }
  const booking = await matchBooking(conn.businessId, msg.from).catch(() => null);
  const conv = await upsertConversation({
    businessId: conn.businessId,
    channel: msg.channel,
    phone: msg.from,
    name: booking?.guestName || msg.profileName,
    bookingId: booking?.id ?? null,
  });
  const saved = await insertMessage({
    conversation: conv,
    direction: "in",
    body: msg.body,
    authorId: null,
    source: "webhook",
    status: "received",
    providerSid: msg.sid,
    media: msg.media,
  });
  if (!saved) return; // retry of one we already have
  await touchConversation(conv.id, {
    direction: "in",
    body: msg.body,
    mediaCount: msg.media.length,
    inbound: true,
    extra: conv.status === "closed" ? { status: "open" } : undefined,
  });
}

export async function applyStatusCallback(conn: TwilioConnection, params: Record<string, string>): Promise<void> {
  const sid = String(params.MessageSid ?? params.SmsSid ?? "");
  if (!/^(SM|MM)[0-9a-f]{32}$/i.test(sid)) return;
  const next = mapTwilioStatus(params.MessageStatus ?? params.SmsStatus);
  if (!next) return;
  const db = admin();
  const { data } = await db
    .from("show_ops_inbox_messages")
    .select("id,status")
    .eq("business_id", conn.businessId)
    .eq("provider_sid", sid)
    .maybeSingle();
  const row = data as { id: string; status: string } | null;
  if (!row || !shouldApplyStatus(row.status, next)) return;
  const patch: Record<string, unknown> = { status: next, updated_at: new Date().toISOString() };
  if (next === "failed" || next === "undelivered") patch.error = twilioErrorText(params.ErrorCode, params.ErrorMessage);
  await db.from("show_ops_inbox_messages").update(patch).eq("id", row.id).eq("status", row.status);
}

/* ------------------------------------------------------------------ *
 * Messages the Hub sends on its own (pick-up tickets)
 * ------------------------------------------------------------------ */

export type BusinessTextResult = { ok: true } | { ok: false; reason: "not_configured" | "invalid_recipient" | "provider_error"; message: string };

/**
 * A ticket or pick-up text from the Hub, through the workspace's own Twilio and
 * logged in its inbox so replies land next to it. WhatsApp free text when the guest
 * wrote in the last 24 hours, else that kind's approved WhatsApp template, else SMS
 * (WhatsApp refuses free text after 24 hours).
 * Returns not_configured when the workspace has no Twilio, so the caller can fall back.
 */
export async function sendBusinessTextToGuest(
  businessId: string,
  input: {
    phone: string;
    body: string;
    bookingId?: string | null;
    guestName?: string | null;
    template?: { kind: "ticket" | "pickup"; variables: Record<string, string> } | null;
  },
): Promise<BusinessTextResult> {
  const conn = await loadTwilioConnection(businessId).catch(() => null);
  if (!conn || (!conn.meta.whatsapp_from && !conn.meta.sms_from)) {
    return { ok: false, reason: "not_configured", message: "This workspace has no Twilio connection." };
  }
  const phone = normalisePhone(input.phone);
  if (!phone) return { ok: false, reason: "invalid_recipient", message: "Guest mobile is missing or invalid." };

  const db = admin();
  let channel: InboxChannel | null = null;
  let template: { sid: string; variables: Record<string, string> } | undefined;
  if (conn.meta.whatsapp_from) {
    const { data } = await db
      .from("show_ops_inbox_conversations")
      .select("last_inbound_at")
      .eq("business_id", businessId)
      .eq("channel", "whatsapp")
      .eq("customer_phone", phone)
      .maybeSingle();
    const last = (data as { last_inbound_at?: string | null } | null)?.last_inbound_at;
    if (last && Date.now() - Date.parse(last) < 24 * 3600_000) channel = "whatsapp";
    else if (input.template) {
      const sid = conn.meta[templateSpec(input.template.kind).metaKey];
      if (sid) {
        channel = "whatsapp";
        template = { sid, variables: input.template.variables };
      }
    }
  }
  if (!channel) channel = conn.meta.sms_from ? "sms" : null;
  if (!channel) return { ok: false, reason: "not_configured", message: "No WhatsApp template or SMS number is set up for this message." };

  try {
    const conv = await upsertConversation({
      businessId,
      channel,
      phone,
      name: input.guestName ?? "",
      bookingId: input.bookingId && isUuid(input.bookingId) ? input.bookingId : null,
    });
    await deliver(conn, conv, { body: input.body.slice(0, 1600), authorId: null, source: "ticket", template });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: "provider_error", message: e instanceof Error ? e.message : "Send failed." };
  }
}
