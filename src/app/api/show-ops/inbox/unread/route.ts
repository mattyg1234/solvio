import { NextResponse } from "next/server";

import { getInboxViewer, listInbox } from "@/lib/show-ops/inbox/server";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store" };

/** Nav badge: unread guest messages that are this person's to deal with, plus chats sent to them. */
export async function GET() {
  const viewer = await getInboxViewer();
  if (!viewer) return NextResponse.json({ total: 0 }, { status: 401, headers: noStore });
  try {
    const { totalUnread } = await listInbox(viewer);
    return NextResponse.json({ total: totalUnread }, { headers: noStore });
  } catch (e) {
    console.error("[show-ops inbox] unread", e instanceof Error ? e.message : e);
    return NextResponse.json({ total: 0 }, { status: 500, headers: noStore });
  }
}
