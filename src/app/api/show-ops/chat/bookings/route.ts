import { NextResponse, type NextRequest } from "next/server";

import { getChatViewer, searchChatBookings } from "@/lib/show-ops/chat/server";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store" };

/** Composer booking search (reference or customer name). Needs Bookings access; island rules apply. */
export async function GET(request: NextRequest) {
  const viewer = await getChatViewer();
  if (!viewer) return NextResponse.json({ error: "Not signed in to Show Ops." }, { status: 401, headers: noStore });
  if (!viewer.canSeeBookings) {
    return NextResponse.json({ error: "You do not have access to bookings." }, { status: 403, headers: noStore });
  }
  try {
    const hits = await searchChatBookings(viewer, request.nextUrl.searchParams.get("q") ?? "");
    return NextResponse.json({ bookings: hits }, { headers: noStore });
  } catch (e) {
    console.error("[show-ops chat] booking search", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Could not search bookings." }, { status: 500, headers: noStore });
  }
}
