import { NextResponse } from "next/server";

import { loadTwilioConnection } from "@/lib/show-ops/inbox/connection";
import { getInboxViewer, InboxAccessError, messageMedia } from "@/lib/show-ops/inbox/server";
import { fetchTwilioMedia } from "@/lib/show-ops/inbox/twilio";

export const dynamic = "force-dynamic";

const SAFE_INLINE = /^(image\/(jpeg|png|gif|webp)|audio\/(ogg|mpeg|mp4|amr)|video\/mp4|application\/pdf)$/i;

/**
 * A guest's photo or file. Twilio keeps it behind the workspace's credentials,
 * so the Hub fetches it for staff who can read that conversation (RLS).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ messageId: string; index: string }> }) {
  const viewer = await getInboxViewer();
  if (!viewer) return new NextResponse("Not signed in.", { status: 401 });
  const { messageId, index } = await params;
  let media: { url: string; type: string }[];
  try {
    media = await messageMedia(viewer, messageId);
  } catch (e) {
    if (e instanceof InboxAccessError) return new NextResponse("Not found.", { status: 404 });
    throw e;
  }
  const item = media[Number.parseInt(index, 10)];
  if (!item) return new NextResponse("Not found.", { status: 404 });
  const conn = await loadTwilioConnection(viewer.businessId);
  if (!conn) return new NextResponse("Twilio is not connected.", { status: 409 });
  const res = await fetchTwilioMedia(conn.creds, item.url);
  if (!res?.body) return new NextResponse("Could not fetch the file from Twilio.", { status: 502 });
  const type = String(item.type || "application/octet-stream");
  const inline = SAFE_INLINE.test(type);
  return new NextResponse(res.body, {
    headers: {
      "Content-Type": inline ? type : "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="guest-file-${index}"`,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
