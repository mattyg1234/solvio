"use client";

import { createUnreadStore } from "@/components/show-ops/unread-store";

/** Total unread chat messages for the nav badge. */
export const CHAT_UNREAD_EVENT = "show-ops-chat-unread";

const store = createUnreadStore("/api/show-ops/chat/unread", CHAT_UNREAD_EVENT);

/** The chat page calls this after each poll or read so the nav badge follows at once. */
export function publishChatUnread(n: number) {
  store.publish(n);
}

/** Unread count for the nav; 0 when disabled (no Chat item for this person). */
export function useChatUnread(enabled: boolean): number {
  return store.useCount(enabled);
}
