import { NextResponse } from "next/server";

import { loadTwilioConnectionByWebhookToken } from "@/lib/show-ops/inbox/connection";
import { parseMetaWebhook, validMetaSignature } from "@/lib/show-ops/inbox/meta";
import { applyMetaStatus, recordInboundMessage } from "@/lib/show-ops/inbox/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Meta's check when the callback URL is saved in the Meta app: the verify token is
 * this workspace's webhook token (the last part of the URL).
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const url = new URL(request.url);
  const conn = await loadTwilioConnectionByWebhookToken(token);
  if (!conn || url.searchParams.get("hub.mode") !== "subscribe" || url.searchParams.get("hub.verify_token") !== token) {
    return new NextResponse("Forbidden.", { status: 403 });
  }
  return new NextResponse(url.searchParams.get("hub.challenge") ?? "", { headers: { "Content-Type": "text/plain" } });
}

/**
 * Guest WhatsApp messages and delivery ticks from Meta's Cloud API. The token in the
 * URL names the workspace; the signature (app secret) proves it is Meta. No auto-reply.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const conn = await loadTwilioConnectionByWebhookToken(token);
  if (!conn?.metaCreds) return new NextResponse("Not found.", { status: 404 });

  const raw = await request.text();
  if (!validMetaSignature(conn.metaCreds.appSecret, request.headers.get("x-hub-signature-256"), raw)) {
    return new NextResponse("Invalid signature.", { status: 403 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new NextResponse(null, { status: 200 });
  }
  const { messages, statuses } = parseMetaWebhook(payload, conn.metaCreds.phoneNumberId);
  try {
    for (const msg of messages) await recordInboundMessage(conn, msg);
    for (const s of statuses) await applyMetaStatus(conn, s);
  } catch (e) {
    console.error("[show-ops inbox] Meta webhook", e instanceof Error ? e.message : e);
    // 500 makes Meta retry; the message id keeps a retry from saving it twice.
    return new NextResponse("Error", { status: 500 });
  }
  return new NextResponse(null, { status: 200 });
}
