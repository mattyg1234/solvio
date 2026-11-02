/**
 * WhatsApp marketing consent (Joel, 27 Oct; template 5). The Hub asks once,
 * records whether, when and how the guest said yes, and honours STOP.
 * Pure helpers only; the database writes live in inbox/server.ts.
 */

export type ConsentIntent = "yes" | "stop";

const YES = new Set(["yes", "y", "yes please", "yes!", "si", "sí", "sí!", "si!", "ja", "oui", "ok", "okay"]);
const STOP = new Set(["stop", "unsubscribe", "baja", "parar", "no more", "stop please", "opt out", "optout"]);

/** A reply that is only YES or only STOP (any case, light punctuation). Anything longer is a normal chat message. */
export function consentIntent(body: string): ConsentIntent | null {
  const t = body
    .toLowerCase()
    .replace(/[.!¡¿?,;:"'()\s]+/g, " ")
    .trim();
  if (!t || t.length > 20) return null;
  if (STOP.has(t)) return "stop";
  if (YES.has(t)) return "yes";
  return null;
}

export type ConsentState = {
  marketing_asked_at: string | null;
  marketing_opt_in_at: string | null;
  marketing_opt_in_source: string | null;
  whatsapp_opted_out_at: string | null;
};

/** One line for the booking page. */
export function consentSummary(s: ConsentState, fmt: (iso: string) => string): string {
  if (s.whatsapp_opted_out_at) return `Opted out of WhatsApp messages (replied STOP) ${fmt(s.whatsapp_opted_out_at)}`;
  if (s.marketing_opt_in_at) {
    const how = s.marketing_opt_in_source === "whatsapp_reply_yes" ? "replied YES on WhatsApp" : s.marketing_opt_in_source || "recorded";
    return `Opted in to MHT WhatsApp updates ${fmt(s.marketing_opt_in_at)} (${how})`;
  }
  if (s.marketing_asked_at) return `Asked about MHT WhatsApp updates ${fmt(s.marketing_asked_at)}, no answer yet`;
  return "Not asked about MHT WhatsApp updates yet";
}
