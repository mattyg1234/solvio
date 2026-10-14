"use client";

import { createUnreadStore } from "@/components/show-ops/unread-store";

/** Guest messages waiting for this person, plus chats sent to them, for the nav badge. */
const store = createUnreadStore("/api/show-ops/inbox/unread", "show-ops-inbox-unread");

export function publishInboxUnread(n: number) {
  store.publish(n);
}

export function useInboxUnread(enabled: boolean): number {
  return store.useCount(enabled);
}
