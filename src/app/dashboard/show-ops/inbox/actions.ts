"use server";

import {
  acceptHandoff,
  addInboxNote,
  declineHandoff,
  getInboxViewer,
  InboxAccessError,
  linkConversationBooking,
  markInboxRead,
  releaseConversation,
  sendConversationToTeammate,
  sendInboxReply,
  sendReopenTemplate,
  setConversationStatus,
  startInboxConversation,
  takeConversation,
  type InboxViewer,
} from "@/lib/show-ops/inbox/server";
import type { InboxActionResult, InboxMessage } from "@/lib/show-ops/inbox/types";

async function run<T>(fn: (viewer: InboxViewer) => Promise<T>): Promise<InboxActionResult<T>> {
  // Fresh session check on every call — the inbox page being open proves nothing.
  const viewer = await getInboxViewer();
  if (!viewer) return { ok: false, error: "The inbox is for Show Ops staff. Sign in again if this is you." };
  try {
    const data = await fn(viewer);
    return { ok: true, data } as InboxActionResult<T>;
  } catch (e) {
    if (e instanceof InboxAccessError) return { ok: false, error: e.message };
    console.error("[show-ops inbox]", e instanceof Error ? e.message : e);
    return { ok: false, error: "Something went wrong. Try again." };
  }
}

const id = (v: unknown) => String(v ?? "");

export async function sendInboxReplyAction(input: { conversationId: string; text: string }): Promise<InboxActionResult<InboxMessage>> {
  return run((v) => sendInboxReply(v, { conversationId: id(input?.conversationId), text: input?.text }));
}

export async function addInboxNoteAction(input: { conversationId: string; text: string }): Promise<InboxActionResult<InboxMessage>> {
  return run((v) => addInboxNote(v, { conversationId: id(input?.conversationId), text: input?.text }));
}

export async function sendReopenTemplateAction(input: { conversationId: string }): Promise<InboxActionResult<InboxMessage>> {
  return run((v) => sendReopenTemplate(v, { conversationId: id(input?.conversationId) }));
}

export async function startInboxConversationAction(input: {
  phone: string;
  channel: "whatsapp" | "sms";
  name?: string;
  bookingId?: string | null;
  text?: string;
}): Promise<InboxActionResult<string>> {
  return run((v) => startInboxConversation(v, input ?? {}));
}

export async function markInboxReadAction(input: { conversationId: string; upTo?: string | null }): Promise<InboxActionResult> {
  return run(async (v) => {
    await markInboxRead(v, id(input?.conversationId), input?.upTo ?? null);
    return undefined;
  });
}

export async function sendConversationToTeammateAction(input: {
  conversationId: string;
  toUserId: string;
  note?: string;
}): Promise<InboxActionResult<{ chatChannelId: string | null }>> {
  return run((v) => sendConversationToTeammate(v, { conversationId: id(input?.conversationId), toUserId: input?.toUserId, note: input?.note }));
}

export async function acceptHandoffAction(input: { handoffId: string }): Promise<InboxActionResult<string>> {
  return run((v) => acceptHandoff(v, id(input?.handoffId)));
}

export async function declineHandoffAction(input: { handoffId: string }): Promise<InboxActionResult> {
  return run(async (v) => {
    await declineHandoff(v, id(input?.handoffId));
    return undefined;
  });
}

export async function takeConversationAction(input: { conversationId: string }): Promise<InboxActionResult> {
  return run(async (v) => {
    await takeConversation(v, id(input?.conversationId));
    return undefined;
  });
}

export async function releaseConversationAction(input: { conversationId: string }): Promise<InboxActionResult> {
  return run(async (v) => {
    await releaseConversation(v, id(input?.conversationId));
    return undefined;
  });
}

export async function setConversationStatusAction(input: { conversationId: string; status: "open" | "closed" }): Promise<InboxActionResult> {
  return run(async (v) => {
    await setConversationStatus(v, id(input?.conversationId), input?.status === "closed" ? "closed" : "open");
    return undefined;
  });
}

export async function linkConversationBookingAction(input: { conversationId: string; bookingId: string | null }): Promise<InboxActionResult> {
  return run(async (v) => {
    await linkConversationBooking(v, id(input?.conversationId), input?.bookingId ? id(input.bookingId) : null);
    return undefined;
  });
}
