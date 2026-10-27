import type { MailMessage } from "./extract";
import { MailProviderError } from "./gmail";
import { htmlToText, mapLimit, tidyText } from "./text";

/**
 * Email that reaches MHT's HubSpot Conversations inbox, read through the Conversations API v3 with
 * a HubSpot private app token (scope conversations.read). Server-side only: the token is never
 * logged or returned to the browser. HubSpot has no mail search, so the emails in a time window are
 * listed once (threads, then each thread's messages) and the scan and sync filter them here.
 */

const API = "https://api.hubapi.com/conversations/v3/conversations";

/** Private app tokens look like pat-eu1-xxxxxxxx-xxxx-…; anything shorter is a typo. */
export function cleanHubSpotToken(input: string): string | null {
  const v = String(input ?? "").trim();
  return /^[A-Za-z0-9_-]{20,200}$/.test(v) ? v : null;
}

async function hubspotJson<T>(token: string, path: string, who: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}${path}`, { headers: { authorization: `Bearer ${token}`, accept: "application/json" }, cache: "no-store" });
    if (res.status === 429 && attempt < 2) {
      // Private apps get about 10 requests a second; wait as HubSpot asks, then try again.
      const wait = Math.min(5, Number(res.headers.get("retry-after")) || 1);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { category?: string };
      throw new MailProviderError(`HubSpot ${who} request failed (${res.status} ${body.category ?? ""})`.trim(), res.status);
    }
    return (await res.json()) as T;
  }
}

type Paged<T> = { results?: T[]; paging?: { next?: { after?: string } } };

/** Checks the token and finds the address the inbox receives on, for the card's heading. */
export async function hubspotAccount(token: string): Promise<{ address: string; inboxes: number }> {
  const inboxes = await hubspotJson<Paged<{ id: string; name?: string }>>(token, "/inboxes?limit=100", "inboxes");
  let address = "";
  try {
    const accounts = await hubspotJson<Paged<{ name?: string; deliveryIdentifier?: { type?: string; value?: string } }>>(
      token,
      "/channel-accounts?limit=100",
      "channel accounts",
    );
    // Not in HubSpot's documented shape for every account, so take an address wherever one shows.
    const values = (accounts.results ?? []).flatMap((a) => [a.deliveryIdentifier?.value ?? "", a.name ?? ""]).map((v) => v.trim());
    address = values.find((v) => EMAIL_RE.test(v)) ?? "";
  } catch {
    // Not every token can list channel accounts; the inbox name will do.
  }
  const count = inboxes.results?.length ?? 0;
  const label = address.toLowerCase() || (count === 1 && inboxes.results?.[0]?.name ? `HubSpot · ${inboxes.results[0].name}` : "HubSpot inbox");
  return { address: label.slice(0, 320), inboxes: count };
}

type Thread = { id: string; latestMessageTimestamp?: string; archived?: boolean };
type Sender = { name?: string; deliveryIdentifier?: { type?: string; value?: string } };
type Message = {
  id: string;
  type?: string;
  createdAt?: string;
  direction?: string;
  subject?: string;
  text?: string;
  richText?: string;
  senders?: Sender[];
  truncationStatus?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** One incoming email, as the scan and sync need it. `id` is "threadId:messageId". */
export type HubSpotEmail = { id: string; threadId: string; messageId: string; from: string; fromName: string; subject: string; date: string; text: string; truncated: boolean };

/** Incoming emails from a thread's messages; chat, comments and MHT's own replies are left out. */
export function emailsFromMessages(threadId: string, messages: Message[]): HubSpotEmail[] {
  const out: HubSpotEmail[] = [];
  for (const m of messages) {
    if ((m.type && m.type !== "MESSAGE") || m.direction !== "INCOMING") continue;
    // HubSpot's docs show inbound senders as HS_EMAIL_ADDRESS or an opaque id; go by the value.
    const sender = m.senders?.find((s) => EMAIL_RE.test(s.deliveryIdentifier?.value?.trim() ?? ""));
    if (!sender) continue;
    const from = String(sender.deliveryIdentifier?.value).trim().toLowerCase();
    const date = new Date(m.createdAt ?? "");
    const text = m.text?.trim() ? tidyText(m.text) : m.richText ? htmlToText(m.richText) : "";
    out.push({
      id: `${threadId}:${m.id}`,
      threadId,
      messageId: String(m.id),
      from,
      fromName: sender.name?.trim() || from.split("@")[0],
      subject: m.subject?.trim() || "(no subject)",
      date: (Number.isNaN(date.getTime()) ? new Date() : date).toISOString(),
      text,
      truncated: Boolean(m.truncationStatus && m.truncationStatus !== "NOT_TRUNCATED"),
    });
  }
  return out;
}

/** Up to `maxThreads` threads with a message since `since`, newest first. */
async function threadsSince(token: string, since: Date, maxThreads: number): Promise<Thread[]> {
  const threads: Thread[] = [];
  let after: string | undefined;
  // Page through everything in the window (HubSpot sorts oldest first), then keep the newest.
  for (let page = 0; page < 20; page++) {
    const q = new URLSearchParams({ limit: "500", sort: "latestMessageTimestamp", latestMessageTimestampAfter: since.toISOString() });
    if (after) q.set("after", after);
    const res = await hubspotJson<Paged<Thread>>(token, `/threads?${q}`, "threads");
    threads.push(...(res.results ?? []));
    after = res.paging?.next?.after;
    if (!after) break;
  }
  return threads
    .filter((t) => !t.archived)
    .sort((a, b) => String(b.latestMessageTimestamp ?? "").localeCompare(String(a.latestMessageTimestamp ?? "")))
    .slice(0, maxThreads);
}

async function threadEmails(token: string, threadId: string): Promise<HubSpotEmail[]> {
  const messages: Message[] = [];
  let after: string | undefined;
  for (let page = 0; page < 10; page++) {
    // HubSpot's page size is left at its default: the docs give no maximum for this list.
    const q = after ? `?${new URLSearchParams({ after })}` : "";
    const res = await hubspotJson<Paged<Message>>(token, `/threads/${encodeURIComponent(threadId)}/messages${q}`, "messages");
    messages.push(...(res.results ?? []));
    after = res.paging?.next?.after;
    if (!after) break;
  }
  return emailsFromMessages(threadId, messages);
}

/** Incoming emails received since a time, newest first. */
export async function hubspotEmailsSince(token: string, since: Date, maxThreads: number): Promise<HubSpotEmail[]> {
  const threads = await threadsSince(token, since, maxThreads);
  const lists = await mapLimit(threads, 4, (t) => threadEmails(token, t.id));
  return lists
    .flat()
    .filter((e) => e.date >= since.toISOString())
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** The whole email, fetching HubSpot's original when the listed text was cut down to the latest reply. */
export async function hubspotMessage(token: string, email: HubSpotEmail): Promise<MailMessage> {
  let text = email.text;
  if (email.truncated || !text) {
    try {
      const full = await hubspotJson<{ text?: string; richText?: string }>(
        token,
        `/threads/${encodeURIComponent(email.threadId)}/messages/${encodeURIComponent(email.messageId)}/original-content`,
        "original content",
      );
      text = full.text?.trim() ? tidyText(full.text) : full.richText ? htmlToText(full.richText) : text;
    } catch {
      // Keep the shortened text; the office still sees the email.
    }
  }
  return { providerId: email.id, fromName: email.fromName, fromEmail: email.from, subject: email.subject, date: email.date, text };
}

/** The messages of one thread, for an id the list didn't hold. */
export async function hubspotEmailById(token: string, id: string): Promise<HubSpotEmail | null> {
  const [threadId, messageId] = id.split(":");
  if (!threadId || !messageId) return null;
  return (await threadEmails(token, threadId)).find((e) => e.messageId === messageId) ?? null;
}
