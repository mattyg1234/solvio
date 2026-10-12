/**
 * Show Ops team chat — server side. Every function takes a ChatViewer, which is
 * only ever built from the signed-in session, and checks channel membership
 * itself before touching messages; RLS (migration 20260930020000) is the
 * second lock, not the only one.
 */

import { randomUUID } from "node:crypto";

import { requireShowOpsEnabled, type ShowOpsContext } from "@/lib/show-ops/access";
import {
  bookingCardFor,
  canUseShowOpsChat,
  CHAT_BOOKING_CARD_COLUMNS,
  CHAT_MAX_GROUP_NAME,
  cleanMessageText,
  directChatKey,
  isUuid,
  parseBookingAttachment,
  parseMentions,
  sanitizeChatSearch,
  totalUnread,
  type ChatBookingCardRow,
} from "@/lib/show-ops/chat/logic";
import type {
  ChatBookingAttachment,
  ChatBookingSearchHit,
  ChatChannel,
  ChatChannelKind,
  ChatMessage,
  ChatPerson,
} from "@/lib/show-ops/chat/types";
import { canSeeShowOpsPage } from "@/lib/show-ops/nav";

export type ChatViewer = {
  ctx: ShowOpsContext;
  meId: string;
  businessId: string;
  /** Bookings page access; the card shows details only with it (and RLS agreeing). */
  canSeeBookings: boolean;
};

export class ChatAccessError extends Error {}

function isNextRedirect(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "digest" in e &&
    typeof (e as { digest?: unknown }).digest === "string" &&
    (e as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

export function chatViewerFromContext(ctx: ShowOpsContext): ChatViewer | null {
  if (!ctx.business.show_ops_enabled || !canUseShowOpsChat(ctx.role)) return null;
  return {
    ctx,
    meId: ctx.user.id,
    businessId: ctx.business.id,
    canSeeBookings: canSeeShowOpsPage(ctx.role, ctx.allowedPages, "bookings"),
  };
}

/**
 * The signed-in staff member, or null (signed out, partner login, Show Ops off).
 * For API routes and server actions, which answer with an error instead of a redirect.
 */
export async function getChatViewer(): Promise<ChatViewer | null> {
  let ctx: ShowOpsContext;
  try {
    ctx = await requireShowOpsEnabled();
  } catch (e) {
    if (isNextRedirect(e)) return null;
    throw e;
  }
  return chatViewerFromContext(ctx);
}

type ChannelRow = { id: string; kind: ChatChannelKind; name: string; created_by: string | null };

export async function loadChatPeople(viewer: ChatViewer): Promise<ChatPerson[]> {
  const { data, error } = await viewer.ctx.supabase.rpc("show_ops_chat_people", {
    p_business_id: viewer.businessId,
  });
  if (error) throw new Error("Could not load the team for chat.");
  return ((data ?? []) as { user_id: string; name: string; role: string }[]).map((r) => ({
    id: r.user_id,
    name: r.name,
    role: r.role,
  }));
}

/** Nav badge numbers only: one RPC, no channel or member lookups. */
export async function chatUnreadSummary(viewer: ChatViewer): Promise<{ total: number; mentions: number }> {
  const { data, error } = await viewer.ctx.supabase.rpc("show_ops_chat_sync", { p_business_id: viewer.businessId });
  if (error) throw new Error("Could not load chats.");
  let total = 0;
  let mentions = 0;
  for (const r of (data ?? []) as { unread: number; unread_mentions: number }[]) {
    total += Math.max(0, Number(r.unread) || 0);
    mentions += Math.max(0, Number(r.unread_mentions) || 0);
  }
  return { total, mentions };
}

/**
 * Makes sure the Team channel exists and this person is in it, then lists every
 * chat they can read with unread counts.
 */
export async function syncChatChannels(
  viewer: ChatViewer,
  people?: ChatPerson[],
): Promise<{ channels: ChatChannel[]; totalUnread: number }> {
  const sb = viewer.ctx.supabase;
  const { data: summary, error } = await sb.rpc("show_ops_chat_sync", { p_business_id: viewer.businessId });
  if (error) throw new Error("Could not load chats.");
  const rows = (summary ?? []) as {
    channel_id: string;
    unread: number;
    unread_mentions: number;
    last_message_at: string | null;
    last_author_id: string | null;
    last_text: string | null;
    last_booking_ref: string | null;
  }[];
  if (!rows.length) return { channels: [], totalUnread: 0 };

  const ids = rows.map((r) => r.channel_id);
  const [{ data: channelRows, error: chErr }, { data: memberRows, error: memErr }] = await Promise.all([
    sb.from("show_ops_chat_channels").select("id,kind,name,created_by").eq("business_id", viewer.businessId).in("id", ids),
    sb.from("show_ops_chat_members").select("channel_id,user_id").eq("business_id", viewer.businessId).in("channel_id", ids),
  ]);
  if (chErr || memErr) throw new Error("Could not load chats.");

  const byId = new Map(((channelRows ?? []) as ChannelRow[]).map((c) => [c.id, c]));
  const membersBy = new Map<string, string[]>();
  for (const m of (memberRows ?? []) as { channel_id: string; user_id: string }[]) {
    const list = membersBy.get(m.channel_id) ?? [];
    list.push(m.user_id);
    membersBy.set(m.channel_id, list);
  }
  const everyone = people?.map((p) => p.id) ?? [];

  const channels: ChatChannel[] = [];
  for (const r of rows) {
    const c = byId.get(r.channel_id);
    if (!c) continue;
    channels.push({
      id: c.id,
      kind: c.kind,
      name: c.kind === "team" ? c.name || "Team" : c.name,
      // The Team channel is everyone on staff, whether or not they have opened chat yet.
      memberIds: c.kind === "team" && everyone.length ? everyone : membersBy.get(c.id) ?? [],
      unread: Number(r.unread) || 0,
      unreadMentions: Number(r.unread_mentions) || 0,
      lastMessageAt: r.last_message_at,
      lastMessage: r.last_message_at
        ? { authorId: r.last_author_id, text: r.last_text ?? "", bookingRef: r.last_booking_ref }
        : null,
    });
  }
  return { channels, totalUnread: totalUnread(channels) };
}

/** The channel, if this person may read and post in it. Throws otherwise. */
export async function assertChannelAccess(viewer: ChatViewer, channelId: string): Promise<ChannelRow> {
  if (!isUuid(channelId)) throw new ChatAccessError("That chat does not exist.");
  const sb = viewer.ctx.supabase;
  const { data: channel } = await sb
    .from("show_ops_chat_channels")
    .select("id,kind,name,created_by")
    .eq("id", channelId)
    .eq("business_id", viewer.businessId)
    .maybeSingle();
  if (!channel) throw new ChatAccessError("That chat does not exist.");
  if ((channel as ChannelRow).kind !== "team") {
    const { data: member } = await sb
      .from("show_ops_chat_members")
      .select("user_id")
      .eq("channel_id", channelId)
      .eq("user_id", viewer.meId)
      .maybeSingle();
    if (!member) throw new ChatAccessError("You are not in that chat.");
  }
  return channel as ChannelRow;
}

async function channelReaderIds(viewer: ChatViewer, channel: ChannelRow, people: ChatPerson[]): Promise<string[]> {
  if (channel.kind === "team") return people.map((p) => p.id);
  const { data } = await viewer.ctx.supabase
    .from("show_ops_chat_members")
    .select("user_id")
    .eq("channel_id", channel.id);
  return ((data ?? []) as { user_id: string }[]).map((m) => m.user_id);
}

type MessageRow = {
  id: string;
  channel_id: string;
  author_id: string | null;
  text: string;
  mentions: string[] | null;
  attachment: unknown;
  created_at: string;
};

/** Live card data for the bookings in these messages, as far as this viewer may see. */
async function hydrateMessages(viewer: ChatViewer, rows: MessageRow[]): Promise<ChatMessage[]> {
  const attachments = new Map<string, ChatBookingAttachment>();
  for (const r of rows) {
    const a = parseBookingAttachment(r.attachment);
    if (a) attachments.set(r.id, a);
  }
  const bookingIds = [...new Set([...attachments.values()].map((a) => a.booking_id))];
  const live = new Map<string, ChatBookingCardRow>();
  if (viewer.canSeeBookings && bookingIds.length) {
    // The viewer's own client: show_bookings RLS drops other islands and businesses.
    const { data } = await viewer.ctx.supabase
      .from("show_bookings")
      .select(CHAT_BOOKING_CARD_COLUMNS)
      .eq("business_id", viewer.businessId)
      .in("id", bookingIds);
    for (const b of (data ?? []) as unknown as ChatBookingCardRow[]) live.set(b.id, b);
  }
  return rows.map((r) => {
    const a = attachments.get(r.id);
    return {
      id: r.id,
      channelId: r.channel_id,
      authorId: r.author_id,
      text: r.text ?? "",
      mentions: r.mentions ?? [],
      createdAt: r.created_at,
      booking: a ? bookingCardFor(a, viewer, live.get(a.booking_id)) : null,
    };
  });
}

/** Newest messages in a channel (oldest first), optionally only those after a time. */
export async function loadChatMessages(
  viewer: ChatViewer,
  channelId: string,
  opts: { after?: string | null; limit?: number } = {},
): Promise<ChatMessage[]> {
  await assertChannelAccess(viewer, channelId);
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 200);
  let q = viewer.ctx.supabase
    .from("show_ops_chat_messages")
    .select("id,channel_id,author_id,text,mentions,attachment,created_at")
    .eq("channel_id", channelId)
    .eq("business_id", viewer.businessId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (opts.after && !Number.isNaN(Date.parse(opts.after))) {
    q = q.gt("created_at", new Date(opts.after).toISOString());
  }
  const { data, error } = await q;
  if (error) throw new Error("Could not load messages.");
  const rows = ((data ?? []) as MessageRow[]).reverse();
  return hydrateMessages(viewer, rows);
}

/**
 * Moves this person's read marker forward to `upTo` — the newest message they
 * have on screen, stamped by the database — never back. A little slack past this
 * server's clock allows for the database clock; anything further is ignored.
 */
export async function markChatRead(viewer: ChatViewer, channelId: string, upTo?: string | null): Promise<void> {
  const channel = await assertChannelAccess(viewer, channelId);
  const now = Date.now();
  const at = upTo && !Number.isNaN(Date.parse(upTo)) ? Math.min(Date.parse(upTo), now + 5 * 60_000) : now;
  const stamp = new Date(at).toISOString();
  const sb = viewer.ctx.supabase;
  if (channel.kind === "team") {
    // First read of Team by someone who has never polled: join, then mark.
    await sb
      .from("show_ops_chat_members")
      .upsert(
        { channel_id: channelId, business_id: viewer.businessId, user_id: viewer.meId, last_read_at: stamp },
        { onConflict: "channel_id,user_id", ignoreDuplicates: true },
      );
  }
  const { error } = await sb
    .from("show_ops_chat_members")
    .update({ last_read_at: stamp })
    .eq("channel_id", channelId)
    .eq("user_id", viewer.meId)
    .lt("last_read_at", stamp);
  if (error) throw new Error("Could not mark the chat as read.");
}

/** A booking this viewer may attach: must be readable by them (RLS: business + islands). */
async function attachableBooking(viewer: ChatViewer, bookingId: string): Promise<ChatBookingAttachment> {
  if (!viewer.canSeeBookings) throw new ChatAccessError("You do not have access to bookings.");
  if (!isUuid(bookingId)) throw new ChatAccessError("That booking does not exist.");
  const { data } = await viewer.ctx.supabase
    .from("show_bookings")
    .select("id,booking_ref")
    .eq("id", bookingId)
    .eq("business_id", viewer.businessId)
    .maybeSingle();
  if (!data) throw new ChatAccessError("That booking does not exist or is not on your islands.");
  const row = data as { id: string; booking_ref: string };
  return { kind: "booking", booking_id: row.id, ref: String(row.booking_ref) };
}

export async function postChatMessage(
  viewer: ChatViewer,
  input: { channelId: string; text?: unknown; bookingId?: string | null },
): Promise<ChatMessage> {
  const channel = await assertChannelAccess(viewer, input.channelId);
  const text = cleanMessageText(input.text);
  const attachment = input.bookingId ? await attachableBooking(viewer, input.bookingId) : null;
  if (!text && !attachment) throw new ChatAccessError("Write a message or attach a booking first.");

  const people = await loadChatPeople(viewer);
  const readers = new Set(await channelReaderIds(viewer, channel, people));
  const mentions = parseMentions(
    text,
    people.filter((p) => readers.has(p.id) && p.id !== viewer.meId),
  );

  const { data: saved, error } = await viewer.ctx.supabase
    .from("show_ops_chat_messages")
    .insert({
      channel_id: channel.id,
      business_id: viewer.businessId,
      author_id: viewer.meId,
      text,
      mentions,
      attachment,
    })
    .select("id,channel_id,author_id,text,mentions,attachment,created_at")
    .single();
  if (error || !saved) throw new Error("Could not send the message.");
  const row = saved as MessageRow;

  // Sending counts as reading everything up to it in that chat.
  await markChatRead(viewer, channel.id, row.created_at).catch(() => undefined);

  const [msg] = await hydrateMessages(viewer, [row]);
  return msg;
}

/** The Team channel id (created on first use). */
export async function teamChannelId(viewer: ChatViewer): Promise<string> {
  const { channels } = await syncChatChannels(viewer);
  const team = channels.find((c) => c.kind === "team");
  if (!team) throw new Error("Could not open the Team chat.");
  return team.id;
}

/**
 * Opens the one-to-one chat with a teammate, creating it the first time.
 * Or creates a named group with the chosen teammates.
 */
export async function openOrCreateChannel(
  viewer: ChatViewer,
  input: { kind: "direct"; userId: string } | { kind: "group"; name: string; userIds: string[] },
): Promise<string> {
  const sb = viewer.ctx.supabase;
  const people = await loadChatPeople(viewer);
  const staff = new Set(people.map((p) => p.id));

  if (input.kind === "direct") {
    const other = input.userId;
    if (!isUuid(other) || other === viewer.meId || !staff.has(other)) {
      throw new ChatAccessError("Pick someone on the team.");
    }
    const key = directChatKey(viewer.meId, other);
    const findExisting = async () => {
      const { data } = await sb
        .from("show_ops_chat_channels")
        .select("id")
        .eq("business_id", viewer.businessId)
        .eq("kind", "direct")
        .eq("direct_key", key)
        .maybeSingle();
      return (data as { id: string } | null)?.id ?? null;
    };
    const existing = await findExisting();
    if (existing) return existing;

    const id = randomUUID();
    const { error } = await sb.from("show_ops_chat_channels").insert({
      id,
      business_id: viewer.businessId,
      kind: "direct",
      name: "",
      direct_key: key,
      created_by: viewer.meId,
    });
    if (error) {
      // Someone else opened the same chat a moment ago.
      const raced = await findExisting();
      if (raced) return raced;
      throw new Error("Could not start the chat.");
    }
    const { error: memErr } = await sb.from("show_ops_chat_members").insert([
      { channel_id: id, business_id: viewer.businessId, user_id: viewer.meId },
      { channel_id: id, business_id: viewer.businessId, user_id: other },
    ]);
    if (memErr) throw new Error("Could not start the chat.");
    return id;
  }

  const name = String(input.name ?? "").replace(/\s+/g, " ").trim().slice(0, CHAT_MAX_GROUP_NAME);
  if (!name) throw new ChatAccessError("Give the group a name.");
  const others = [...new Set(input.userIds)].filter((id) => id !== viewer.meId);
  if (!others.length) throw new ChatAccessError("Add at least one person to the group.");
  if (others.some((id) => !isUuid(id) || !staff.has(id))) throw new ChatAccessError("Only people on the team can be added.");

  const id = randomUUID();
  const { error } = await sb.from("show_ops_chat_channels").insert({
    id,
    business_id: viewer.businessId,
    kind: "group",
    name,
    created_by: viewer.meId,
  });
  if (error) throw new Error("Could not create the group.");
  const { error: memErr } = await sb
    .from("show_ops_chat_members")
    .insert([viewer.meId, ...others].map((user_id) => ({ channel_id: id, business_id: viewer.businessId, user_id })));
  if (memErr) throw new Error("Could not add people to the group.");
  return id;
}

/** Bookings search for the composer: reference or customer name, newest show first. */
export async function searchChatBookings(viewer: ChatViewer, rawQuery: string): Promise<ChatBookingSearchHit[]> {
  if (!viewer.canSeeBookings) return [];
  const q = sanitizeChatSearch(rawQuery);
  if (q.length < 2) return [];
  const { data, error } = await viewer.ctx.supabase
    .from("show_bookings")
    .select("id,booking_ref,guest_name,show_name,show_date")
    .eq("business_id", viewer.businessId)
    .or(`booking_ref.ilike.%${q}%,guest_name.ilike.%${q}%`)
    .order("show_date", { ascending: false })
    .limit(8);
  if (error) throw new Error("Could not search bookings.");
  return ((data ?? []) as { id: string; booking_ref: string; guest_name: string | null; show_name: string | null; show_date: string }[]).map(
    (b) => ({
      id: b.id,
      ref: b.booking_ref,
      guestName: b.guest_name ?? "",
      showName: b.show_name ?? "",
      showDate: String(b.show_date).slice(0, 10),
    }),
  );
}
