import { unstable_rethrow } from "next/navigation";

import { requireShowOpsAction, type ShowOpsContext } from "@/lib/show-ops/access";

import { MailConfigError, MailProviderError, needsReconnect } from "./gmail";

/**
 * Permission check for the Email bookings routes and actions. Email bookings follows the Bookings
 * page grant: any bookings desk member (booker+) reviews and refreshes; connecting, disconnecting
 * and choosing senders needs Reservation (ops) or above.
 */
export type MailGate = { ctx: ShowOpsContext } | { error: string; status: number };

export async function mailGate(needed: "booker" | "office"): Promise<MailGate> {
  try {
    return { ctx: await requireShowOpsAction(needed, "bookings") };
  } catch (e) {
    // Signed out: let Next send the redirect to the login page.
    unstable_rethrow(e);
    return {
      error: needed === "office" ? "Only Reservation (ops) staff and above with the Bookings page can change the bookings inbox." : "You don't have access to Email bookings.",
      status: 403,
    };
  }
}

/** Short, token-free description of an error for server logs. */
export function describeMailError(e: unknown): string {
  if (e instanceof MailProviderError || e instanceof MailConfigError) return e.message;
  if (e instanceof Error) return `${e.name}: ${e.message}`.slice(0, 300);
  return "Unknown error";
}

/** A safe message for the office; details go to the server log, never tokens. */
export function mailErrorAnswer(where: string, e: unknown): { error: string; status: number; reconnect?: boolean } {
  console.error(`[${where}] ${describeMailError(e)}`);
  if (e instanceof MailConfigError) return { error: "Gmail connection isn't switched on yet on the server.", status: 503 };
  if (needsReconnect(e)) return { error: "The inbox sign-in has expired or was removed. Connect it again.", status: 409, reconnect: true };
  if (e instanceof MailProviderError) return { error: "Gmail didn't answer as expected. Try again in a minute.", status: 502 };
  if (e instanceof Error && /SHOW_OPS_SECRETS_KEY/.test(e.message)) return { error: "The server's secrets key (SHOW_OPS_SECRETS_KEY) isn't set, so the inbox sign-in can't be stored.", status: 503 };
  return { error: "Something went wrong. Try again.", status: 500 };
}
