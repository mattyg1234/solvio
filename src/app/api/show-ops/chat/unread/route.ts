import { NextResponse } from "next/server";

import { chatUnreadSummary, getChatViewer } from "@/lib/show-ops/chat/server";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store" };

/** Nav badge: total unread chat messages for the signed-in staff member. */
export async function GET() {
  const viewer = await getChatViewer();
  if (!viewer) return NextResponse.json({ total: 0, mentions: 0 }, { status: 401, headers: noStore });
  try {
    const { total, mentions } = await chatUnreadSummary(viewer);
    return NextResponse.json({ total, mentions }, { headers: noStore });
  } catch (e) {
    console.error("[show-ops chat] unread", e instanceof Error ? e.message : e);
    return NextResponse.json({ total: 0, mentions: 0 }, { status: 500, headers: noStore });
  }
}
