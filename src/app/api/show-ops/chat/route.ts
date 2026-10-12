import { NextResponse, type NextRequest } from "next/server";

import {
  ChatAccessError,
  getChatViewer,
  loadChatMessages,
  loadChatPeople,
  syncChatChannels,
} from "@/lib/show-ops/chat/server";
import type { ChatPerson, ChatSyncResponse } from "@/lib/show-ops/chat/types";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store" };

/**
 * Chat poll: the chats this person is in with unread counts, plus (with ?c=)
 * that chat's newest messages — only those after ?after= when given.
 * ?people=1 adds the team list.
 */
export async function GET(request: NextRequest) {
  const viewer = await getChatViewer();
  if (!viewer) return NextResponse.json({ error: "Not signed in to Show Ops." }, { status: 401, headers: noStore });

  const sp = request.nextUrl.searchParams;
  const channelId = sp.get("c");
  const after = sp.get("after");
  try {
    // Team members are needed for the Team channel's member list and @mentions.
    const people: ChatPerson[] = await loadChatPeople(viewer);
    const { channels, totalUnread } = await syncChatChannels(viewer, people);
    const body: ChatSyncResponse & { people?: ChatPerson[] } = { meId: viewer.meId, channels, totalUnread };
    if (sp.get("people") === "1") body.people = people;
    if (channelId) body.messages = await loadChatMessages(viewer, channelId, { after });
    return NextResponse.json(body, { headers: noStore });
  } catch (e) {
    if (e instanceof ChatAccessError) {
      return NextResponse.json({ error: e.message }, { status: 403, headers: noStore });
    }
    console.error("[show-ops chat] poll", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Could not load chat." }, { status: 500, headers: noStore });
  }
}
