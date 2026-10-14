import { NextResponse } from "next/server";

import { loadTwilioConnectionByWebhookToken, statusWebhookUrl } from "@/lib/show-ops/inbox/connection";
import { validTwilioSignature } from "@/lib/show-ops/inbox/logic";
import { applyStatusCallback } from "@/lib/show-ops/inbox/server";
import { parseTwilioFormBody } from "@/lib/twilio-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Delivery updates for messages the Hub sent (sent → delivered → read, or failed with a reason). */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const conn = await loadTwilioConnectionByWebhookToken(token);
  if (!conn) return new NextResponse("Not found.", { status: 404 });

  const form = await parseTwilioFormBody(request);
  const urls = [request.url, statusWebhookUrl(token)];
  if (!validTwilioSignature(conn.creds.authToken, request.headers.get("x-twilio-signature"), urls, form)) {
    return new NextResponse("Invalid signature.", { status: 403 });
  }
  try {
    await applyStatusCallback(conn, form);
  } catch (e) {
    console.error("[show-ops inbox] status", e instanceof Error ? e.message : e);
    return new NextResponse("Error", { status: 500 });
  }
  return new NextResponse(null, { status: 204 });
}
