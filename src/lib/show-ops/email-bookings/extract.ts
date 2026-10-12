import { readEmailByPattern, readKnownTemplate } from "./templates";
import { EMAIL_KINDS, type EmailRead, type EmailReader, type ExtractedBooking } from "./types";

/**
 * Reads a booking email: the exact readers (WooCommerce, GetYourGuide) first; then Claude when
 * ANTHROPIC_API_KEY is set; otherwise, or if that fails for any reason, the pattern reader.
 * Server-side only (the key never reaches the browser).
 */

const MODEL = "claude-haiku-4-5-20251001";
const MAX_TEXT = 6000;
const STRING_FIELDS = ["name", "time", "location", "partner", "service", "reference", "email", "phone", "language", "requests", "paymentMethod"] as const;
const NUMBER_FIELDS = ["quantity", "adults", "children", "infants", "amount", "paid", "net"] as const;

export type MailMessage = {
  providerId: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  /** ISO time it was received. */
  date: string;
  text: string;
};

const SYSTEM = `You read emails sent to Music Hall Tavern (MHT), a dinner-show company in the Canary Islands (Tenerife, Lanzarote, Gran Canaria) and on a UK tour, by booking partners (GetYourGuide, Viator, Tiqets, Civitatis, Booking.com, TUI, Jet2 and similar) or by MHT's own website shop (WooCommerce "New order" emails), and pull out the booking.

Reply with one JSON object and nothing else:
{"kind": "new" | "change" | "cancel" | "question" | "not-booking",
 "confidence": number from 0 to 1,
 "extracted": {"name": string, "date": "YYYY-MM-DD", "time": "HH:MM", "quantity": number, "adults": number, "children": number, "infants": number,
   "location": string, "partner": string, "amount": number, "paid": number, "net": number, "service": string, "reference": string,
   "email": string, "phone": string, "language": string, "requests": string, "paymentMethod": string}}

Rules:
- kind: "new" for a new booking, "change" for an amended booking, "cancel" for a cancellation, "question" for a customer question, "not-booking" for anything else (newsletters, invoices, reviews, marketing, account notices, daily order summaries).
- name is the lead traveller or customer. quantity is the total number of people. infants are babies under 4. amount is the booking's price; paid is what the customer already paid MHT itself (e.g. online at checkout; leave it out for bookings a partner collected); net is what MHT receives after the partner's commission. Numbers are plain numbers without currency symbols.
- location is the hotel, accommodation or pick-up point. service is what was booked, without the date or ticket type. reference is the partner's booking reference, or the shop's order number (e.g. TFS/20957).
- When an order lists several ticket types (adult, child, VIP), add them up for adults, children and quantity, and list them in requests as "Tickets: 2 × Adult, 1 × Child". Put the option bought (with pick-up / without transport) in requests too.
- Resolve relative dates ("tomorrow") using the date the email was received.
- Leave out any field the email doesn't state. Never guess. confidence reflects how sure you are that every included field is right.`;

function coerceString(v: unknown): string | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s ? s.slice(0, 300) : undefined;
}

function coerceNumber(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? v : undefined;
  if (typeof v !== "string") return undefined;
  const n = Number(v.replace(/[^\d.,-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** Keeps only well-formed fields from what the model (or the browser) sent. */
export function coerceExtracted(raw: unknown): ExtractedBooking {
  const x = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const extracted: ExtractedBooking = {};
  for (const f of STRING_FIELDS) {
    const v = coerceString(x[f]);
    if (v !== undefined) extracted[f] = v;
  }
  for (const f of NUMBER_FIELDS) {
    const v = coerceNumber(x[f]);
    if (v !== undefined) extracted[f] = f === "amount" || f === "net" || f === "paid" ? Math.round(v * 100) / 100 : Math.min(999, Math.round(v));
  }
  const date = coerceString(x.date);
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(new Date(`${date}T00:00:00Z`).getTime())) extracted.date = date;
  const time = extracted.time?.match(/^(\d{1,2})[:.h](\d{2})/);
  if (extracted.time && time && Number(time[1]) < 24) extracted.time = `${time[1].padStart(2, "0")}:${time[2]}`;
  else delete extracted.time;
  if (extracted.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(extracted.email)) delete extracted.email;
  if (extracted.quantity === undefined && (extracted.adults !== undefined || extracted.children !== undefined || extracted.infants !== undefined)) {
    extracted.quantity = (extracted.adults ?? 0) + (extracted.children ?? 0) + (extracted.infants ?? 0);
  }
  return extracted;
}

export function coerceRead(raw: unknown): EmailRead | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const kind = EMAIL_KINDS.find((k) => k === r.kind);
  if (!kind) return null;
  const confidence = typeof r.confidence === "number" && Number.isFinite(r.confidence) ? Math.min(1, Math.max(0, r.confidence)) : 0.5;
  return { kind, confidence, extracted: coerceExtracted(r.extracted) };
}

function firstJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return JSON.parse(text.slice(start, end + 1));
}

async function readWithClaude(apiKey: string, m: MailMessage, sellerName: string): Promise<EmailRead | null> {
  const body = m.text.length > MAX_TEXT ? `${m.text.slice(0, MAX_TEXT)}\n[…truncated]` : m.text;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 800,
      temperature: 0,
      system: SYSTEM,
      messages: [{ role: "user", content: `Booking partner: ${sellerName}\nFrom: ${m.fromName} <${m.fromEmail}>\nReceived: ${m.date}\nSubject: ${m.subject}\n\n${body}` }],
    }),
    signal: AbortSignal.timeout(25000),
    cache: "no-store",
  });
  if (!res.ok) {
    console.warn(`[email-bookings/extract] Anthropic API returned ${res.status}; using the pattern reader`);
    return null;
  }
  const data = (await res.json()) as { stop_reason?: string; content?: { type: string; text?: string }[] };
  if (data.stop_reason === "refusal") return null;
  const text = (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
  return coerceRead(firstJsonObject(text));
}

/** What kind of email it is, the booking details in it, and which reader read it. */
export async function extractBooking(m: MailMessage, sellerName: string): Promise<EmailRead & { reader: EmailReader }> {
  const known = readKnownTemplate(m.fromEmail, m.subject, m.text);
  // A forwarded GetYourGuide booking is still GetYourGuide's, whoever forwarded it.
  if (known) return { ...known, reader: "template", extracted: { ...known.extracted, partner: known.extracted.partner ?? sellerName } };
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    try {
      const read = await readWithClaude(apiKey, m, sellerName);
      if (read) return { ...read, reader: "ai", extracted: { ...read.extracted, partner: sellerName } };
    } catch (e) {
      console.warn(`[email-bookings/extract] AI read failed (${e instanceof Error ? e.name : "error"}); using the pattern reader`);
    }
  }
  const fallback = readEmailByPattern(m.fromEmail, m.subject, m.text.slice(0, MAX_TEXT * 2));
  return { ...fallback, reader: "pattern", extracted: { ...fallback.extracted, partner: sellerName } };
}
