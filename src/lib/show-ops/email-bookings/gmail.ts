import type { MailMessage } from "./extract";
import { htmlToText, parseFrom, tidyText } from "./text";

/**
 * Gmail through Google's OAuth 2.0 and the Gmail REST API, read-only (gmail.readonly).
 * Ported from Solvio Connect's server/mail/google.ts. Server-side only: it reads
 * GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET and never returns tokens to the browser.
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
export const GOOGLE_SCOPES = "openid email https://www.googleapis.com/auth/gmail.readonly";

/** Thrown when GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET aren't set. */
export class MailConfigError extends Error {
  constructor(public readonly variable: string) {
    super(`${variable} is not set on the server.`);
    this.name = "MailConfigError";
  }
}

/** Thrown when Google answers with an error. Never carries tokens or response bodies. */
export class MailProviderError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "MailProviderError";
  }
}

function env(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new MailConfigError(name);
  return value;
}

/** Gmail can only be connected once both Google OAuth settings are on the server. */
export function gmailConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim());
}

export type TokenSet = { accessToken: string; refreshToken?: string; expiresAt: Date | null };

export function googleAuthUrl(state: string, redirectUri: string, loginHint?: string): string {
  const params = new URLSearchParams({
    client_id: env("GOOGLE_CLIENT_ID"),
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  if (loginHint) params.set("login_hint", loginHint);
  return `${AUTH_URL}?${params}`;
}

async function tokenRequest(params: Record<string, string>): Promise<TokenSet> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env("GOOGLE_CLIENT_ID"), client_secret: env("GOOGLE_CLIENT_SECRET"), ...params }),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !body.access_token) {
    // Only the error code, never the response body (it could echo a token or code).
    throw new MailProviderError(`Google token request failed: ${body.error ?? res.status}`, res.status);
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token || undefined,
    expiresAt: typeof body.expires_in === "number" ? new Date(Date.now() + body.expires_in * 1000) : null,
  };
}

export function googleExchangeCode(code: string, redirectUri: string): Promise<TokenSet> {
  return tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
}

/** Google keeps the same refresh token, so the new set usually has none. */
export function googleRefresh(refreshToken: string): Promise<TokenSet> {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
}

async function apiJson<T>(url: string, accessToken: string, who: string): Promise<T> {
  const res = await fetch(url, { headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" }, cache: "no-store" });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { code?: string | number; status?: string; details?: { reason?: string }[] } };
    // Google's reason tells a switched-off Gmail API (SERVICE_DISABLED) from a missing permission.
    const reason = body.error?.details?.find((d) => d?.reason)?.reason ?? "";
    throw new MailProviderError(`${who} request failed (${res.status} ${body.error?.status ?? body.error?.code ?? ""} ${reason})`.replace(/\s+\)/, ")").trim(), res.status);
  }
  return (await res.json()) as T;
}

export async function googleEmail(accessToken: string): Promise<string | null> {
  const info = await apiJson<{ email?: string }>(USERINFO_URL, accessToken, "Google userinfo");
  return info.email ? info.email.toLowerCase() : null;
}

type ListResponse = { messages?: { id: string }[]; nextPageToken?: string; resultSizeEstimate?: number };

/** Ids of messages matching a Gmail search, newest first, up to `max`. */
export async function gmailSearch(accessToken: string, q: string, max: number): Promise<{ ids: string[]; estimate: number }> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  let estimate = 0;
  do {
    const params = new URLSearchParams({ q, maxResults: String(Math.min(500, max - ids.length)) });
    if (pageToken) params.set("pageToken", pageToken);
    const page = await apiJson<ListResponse>(`${GMAIL}/messages?${params}`, accessToken, "Gmail list");
    estimate = Math.max(estimate, page.resultSizeEstimate ?? 0);
    for (const m of page.messages ?? []) ids.push(m.id);
    pageToken = page.nextPageToken;
  } while (pageToken && ids.length < max);
  return { ids: ids.slice(0, max), estimate: Math.max(estimate, ids.length) };
}

/** Gmail's rough count of messages matching a search (one request). */
export async function gmailEstimate(accessToken: string, q: string): Promise<number> {
  const params = new URLSearchParams({ q, maxResults: "1" });
  const page = await apiJson<ListResponse>(`${GMAIL}/messages?${params}`, accessToken, "Gmail list");
  return page.resultSizeEstimate ?? 0;
}

/** Subject line, sender and arrival time, without downloading the email. */
export async function gmailSubject(accessToken: string, id: string): Promise<{ subject: string; date: string | null; from: string }> {
  const params = new URLSearchParams({ format: "metadata", metadataHeaders: "Subject" });
  params.append("metadataHeaders", "From");
  const m = await apiJson<{ internalDate?: string; payload?: { headers?: { name: string; value: string }[] } }>(
    `${GMAIL}/messages/${encodeURIComponent(id)}?${params}`,
    accessToken,
    "Gmail get",
  );
  const header = (name: string) => m.payload?.headers?.find((h) => h.name.toLowerCase() === name)?.value ?? "";
  return { subject: header("subject"), date: m.internalDate ? new Date(Number(m.internalDate)).toISOString() : null, from: header("from") };
}

type Part = { mimeType?: string; filename?: string; headers?: { name: string; value: string }[]; body?: { data?: string }; parts?: Part[] };
type FullMessage = { id: string; internalDate?: string; payload?: Part; snippet?: string };

function decode(part: Part): string {
  const bytes = Buffer.from(part.body?.data ?? "", "base64url");
  const type = part.headers?.find((h) => h.name.toLowerCase() === "content-type")?.value ?? "";
  const charset = type.match(/charset="?([\w.:-]+)"?/i)?.[1]?.toLowerCase() ?? "utf-8";
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return bytes.toString("utf8");
  }
}

/** First text/plain and text/html bodies anywhere in the MIME tree, skipping attachments. */
function findBodies(part: Part | undefined, found: { plain?: string; html?: string } = {}): { plain?: string; html?: string } {
  if (!part) return found;
  if (!part.filename && part.body?.data) {
    if (part.mimeType === "text/plain" && found.plain === undefined) found.plain = decode(part);
    else if (part.mimeType === "text/html" && found.html === undefined) found.html = decode(part);
  }
  for (const child of part.parts ?? []) findBodies(child, found);
  return found;
}

export async function gmailMessage(accessToken: string, id: string): Promise<MailMessage> {
  const m = await apiJson<FullMessage>(`${GMAIL}/messages/${encodeURIComponent(id)}?format=full`, accessToken, "Gmail get");
  const header = (name: string) => m.payload?.headers?.find((h) => h.name.toLowerCase() === name)?.value ?? "";
  const from = parseFrom(header("from"));
  const bodies = findBodies(m.payload);
  const text = bodies.plain?.trim() ? tidyText(bodies.plain) : bodies.html ? htmlToText(bodies.html) : (m.snippet ?? "");
  const date = m.internalDate ? new Date(Number(m.internalDate)) : new Date(header("date") || Date.now());
  return {
    providerId: m.id,
    fromName: from.name,
    fromEmail: from.email,
    subject: header("subject") || "(no subject)",
    date: (Number.isNaN(date.getTime()) ? new Date() : date).toISOString(),
    text,
  };
}

/** Gmail search for mail from any of these addresses or domains. */
export function gmailFromQuery(senders: string[]): string {
  return `from:(${senders.join(" OR ")})`;
}

/** True when Google says the saved sign-in no longer works. */
export function needsReconnect(e: unknown): boolean {
  return e instanceof MailProviderError && (e.status === 401 || /invalid_grant/.test(e.message));
}
