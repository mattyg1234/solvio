"use server";

import {
  ChatAccessError,
  getChatViewer,
  markChatRead,
  openOrCreateChannel,
  postChatMessage,
  teamChannelId,
  type ChatViewer,
} from "@/lib/show-ops/chat/server";
import type { ChatActionResult, ChatMessage } from "@/lib/show-ops/chat/types";

async function run<T>(fn: (viewer: ChatViewer) => Promise<T>): Promise<ChatActionResult<T>> {
  // Fresh session check on every call — the chat page being open proves nothing.
  const viewer = await getChatViewer();
  if (!viewer) return { ok: false, error: "Chat is for Show Ops staff. Sign in again if this is you." };
  try {
    const data = await fn(viewer);
    return { ok: true, data } as ChatActionResult<T>;
  } catch (e) {
    if (e instanceof ChatAccessError) return { ok: false, error: e.message };
    console.error("[show-ops chat]", e instanceof Error ? e.message : e);
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong. Try again." };
  }
}

export async function sendChatMessageAction(input: {
  channelId: string;
  text?: string;
  bookingId?: string | null;
}): Promise<ChatActionResult<ChatMessage>> {
  return run((viewer) =>
    postChatMessage(viewer, {
      channelId: String(input?.channelId ?? ""),
      text: input?.text,
      bookingId: input?.bookingId ? String(input.bookingId) : null,
    }),
  );
}

export async function markChatReadAction(input: { channelId: string; upTo?: string | null }): Promise<ChatActionResult> {
  return run(async (viewer) => {
    await markChatRead(viewer, String(input?.channelId ?? ""), input?.upTo ?? null);
    return undefined;
  });
}

export async function openDirectChatAction(input: { userId: string }): Promise<ChatActionResult<string>> {
  return run((viewer) => openOrCreateChannel(viewer, { kind: "direct", userId: String(input?.userId ?? "") }));
}

export async function createGroupChatAction(input: { name: string; userIds: string[] }): Promise<ChatActionResult<string>> {
  return run((viewer) =>
    openOrCreateChannel(viewer, {
      kind: "group",
      name: String(input?.name ?? ""),
      userIds: Array.isArray(input?.userIds) ? input.userIds.map(String).slice(0, 100) : [],
    }),
  );
}

export type SendBookingTarget =
  | { kind: "team" }
  | { kind: "person"; userId: string }
  | { kind: "channel"; channelId: string };

/**
 * "Send to chat" from a booking: posts the booking card, with an optional
 * question, to the Team chat, a teammate (opening the direct chat if needed) or
 * a group the sender is in. Returns the chat's id so the page can link to it.
 */
export async function sendBookingToChatAction(input: {
  bookingId: string;
  target: SendBookingTarget;
  text?: string;
}): Promise<ChatActionResult<string>> {
  return run(async (viewer) => {
    const target = input?.target;
    let channelId: string;
    if (target?.kind === "team") channelId = await teamChannelId(viewer);
    else if (target?.kind === "person") channelId = await openOrCreateChannel(viewer, { kind: "direct", userId: String(target.userId ?? "") });
    else if (target?.kind === "channel") channelId = String(target.channelId ?? "");
    else throw new ChatAccessError("Pick where to send it.");
    // postChatMessage re-checks membership of channelId and that the booking is visible to the sender.
    await postChatMessage(viewer, { channelId, text: input?.text, bookingId: String(input?.bookingId ?? "") });
    return channelId;
  });
}
