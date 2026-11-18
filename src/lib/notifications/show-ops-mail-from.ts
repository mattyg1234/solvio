import type { Resend } from "resend";

/**
 * Show Ops guest emails (tickets, payment links, invoices, partner links) can go
 * from the client's own address, e.g. SHOW_OPS_MAIL_FROM="MHT Shows <reservations@musichalltavern.com>"
 * (Matty, 18 Nov). Until that domain is verified in Resend, Resend refuses the send;
 * we then send again from the usual Solvio address with Reply-To set to the client's
 * address, so no email is lost and replies still reach the client.
 */

export function defaultShowOpsFrom(env: NodeJS.ProcessEnv = process.env): string {
  return env.SOLVIO_MAIL_FROM?.trim() || env.RESEND_MAIL_FROM?.trim() || "Solvio Bookings <hello@solviosystems.com>";
}

export function preferredShowOpsFrom(env: NodeJS.ProcessEnv = process.env): string | null {
  const v = env.SHOW_OPS_MAIL_FROM?.trim();
  return v && v.includes("@") ? v : null;
}

/** "MHT Shows <reservations@musichalltavern.com>" → "reservations@musichalltavern.com". */
export function bareAddress(from: string): string {
  const m = from.match(/<([^>]+)>/);
  return (m ? m[1] : from).trim();
}

/** Resend's answer when the from-domain isn't (yet) verified on the account. */
export function isUnverifiedDomainError(message: string | null | undefined): boolean {
  return /domain.*(not verified|is not verified|unverified)|verify (a|your) domain|not.*verified.*domain/i.test(String(message ?? ""));
}

type SendPayload = Omit<Parameters<Resend["emails"]["send"]>[0], "from">;

export async function sendShowOpsMail(client: Resend, payload: SendPayload, env: NodeJS.ProcessEnv = process.env) {
  const preferred = preferredShowOpsFrom(env);
  const fallback = defaultShowOpsFrom(env);
  if (!preferred || preferred === fallback) return client.emails.send({ ...payload, from: fallback } as Parameters<Resend["emails"]["send"]>[0]);

  const first = await client.emails.send({ ...payload, from: preferred } as Parameters<Resend["emails"]["send"]>[0]);
  if (!first.error || !isUnverifiedDomainError(first.error.message)) return first;
  console.warn(`[show-ops-mail] ${bareAddress(preferred)} not verified in Resend yet; sent from the default address instead.`);
  const replyTo = (payload as { replyTo?: string | string[] }).replyTo ?? bareAddress(preferred);
  return client.emails.send({ ...payload, replyTo, from: fallback } as Parameters<Resend["emails"]["send"]>[0]);
}
