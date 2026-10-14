import { NextResponse, type NextRequest } from "next/server";

import { loadChatPeople, chatViewerFromContext } from "@/lib/show-ops/chat/server";
import type { ChatPerson } from "@/lib/show-ops/chat/types";
import { getInboxViewer, InboxAccessError, inboxSync } from "@/lib/show-ops/inbox/server";
import type { InboxSyncResponse } from "@/lib/show-ops/inbox/types";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store" };

/**
 * Inbox poll: the conversations this person may see with unread counts, plus
 * (with ?c=) that conversation's messages — only those changed after ?after=
 * when given, so delivery ticks update too. ?people=1 adds the team list.
 */
export async function GET(request: NextRequest) {
  const viewer = await getInboxViewer();
  if (!viewer) return NextResponse.json({ error: "Not signed in to Show Ops." }, { status: 401, headers: noStore });
  const sp = request.nextUrl.searchParams;
  try {
    const body: InboxSyncResponse & { people?: ChatPerson[] } = await inboxSync(viewer, sp.get("c"), sp.get("after"));
    if (sp.get("people") === "1") {
      const chatViewer = chatViewerFromContext(viewer.ctx);
      body.people = chatViewer ? await loadChatPeople(chatViewer) : [];
    }
    return NextResponse.json(body, { headers: noStore });
  } catch (e) {
    if (e instanceof InboxAccessError) return NextResponse.json({ error: e.message }, { status: 403, headers: noStore });
    console.error("[show-ops inbox] poll", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Could not load the inbox." }, { status: 500, headers: noStore });
  }
}
