import type { EmailKind, EmailRead, ExtractedBooking } from "./types";

/**
 * Exact readers for booking emails that always come in the same layout (ported from Solvio
 * Connect's booking-templates.ts). They run before the AI: a machine-made template reads the same
 * way every time, costs nothing and never guesses. Anything they don't recognise returns null and
 * goes on to the AI or the pattern reader.
 */

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  ene: 1, abr: 4, ago: 8, dic: 12,
};

function isoDate(y: string, m: number, d: string): string | undefined {
  const date = `${y}-${String(m).padStart(2, "0")}-${d.padStart(2, "0")}`;
  return Number.isNaN(new Date(`${date}T00:00:00Z`).getTime()) ? undefined : date;
}

/** "Friday 2 Oct 2026", "2 October 2026", "2 oct. 2026" or "September 29, 2026". */
export function findDate(text: string): string | undefined {
  const dmy = text.match(/\b(\d{1,2})\s+(?:de\s+)?([a-z]{3})[a-z]*\.?\s+(?:de\s+)?(20\d{2})\b/i);
  if (dmy && MONTHS[dmy[2].toLowerCase()]) return isoDate(dmy[3], MONTHS[dmy[2].toLowerCase()], dmy[1]);
  const mdy = text.match(/\b([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(20\d{2})\b/i);
  if (mdy && MONTHS[mdy[1].toLowerCase()]) return isoDate(mdy[3], MONTHS[mdy[1].toLowerCase()], mdy[2]);
  return undefined;
}

/** "7:15 PM" → "19:15", "19:00" stays. */
export function findTime(text: string): string | undefined {
  const t = text.match(/\b(\d{1,2})[:.](\d{2})\s*(am|pm)?\b/i);
  if (!t) return undefined;
  let h = Number(t[1]);
  const pm = t[3]?.toLowerCase();
  if (pm === "pm" && h < 12) h += 12;
  if (pm === "am" && h === 12) h = 0;
  return h < 24 ? `${String(h).padStart(2, "0")}:${t[2]}` : undefined;
}

/** "196,00", "1.196,00", "1,196.00" → 196 / 1196. */
export function euros(s: string): number | undefined {
  const n = Number(s.replace(/[^\d.,]/g, "").replace(/[.,](?=\d{3}\b)/g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : undefined;
}

/** The lines under a label line. GetYourGuide puts values on the line(s) below their label. */
function under(text: string, label: string, lines = 1): string[] {
  const all = text.split("\n");
  const i = all.findIndex((l) => l.trim().toLowerCase() === label.toLowerCase());
  if (i < 0) return [];
  return all.slice(i + 1).filter((l) => l.trim()).slice(0, lines).map((l) => l.trim());
}

/**
 * A WooCommerce checkout question's answer: "Question: answer" / "Question? answer" on one line,
 * or the answer on the next line when the question line ends with ":" or "?".
 */
function answerTo(text: string, question: RegExp): string | undefined {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(question);
    if (!m || m.index === undefined) continue;
    // The first ":" or "?" after the question ends it; the answer may itself contain a colon.
    const rest = lines[i].slice(m.index + m[0].length);
    const cut = rest.search(/[:?]/);
    if (cut < 0) continue;
    const same = rest.slice(cut + 1).trim();
    if (same) return same.slice(0, 200);
    return lines.slice(i + 1).find((l) => l.trim())?.trim().slice(0, 200);
  }
  return undefined;
}

const INFANT = /\b(infant|infants|baby|babies|bebés?|under\s*4)\b/i;
const CHILD = /\b(child|children|kid|kids|youth|junior|niñ[oa]s?)\b/i;
const ADULT = /\b(adult|adults|adulto|adultos|senior)\b/i;
const WEEKDAY_TAIL = /\s*[–—-]\s*(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b.*$/i;
const DATE_TAIL = /\s*[–—-]\s*\d{1,2}\s+[a-z]{3}.*$/i;

/* ---------- WooCommerce shop orders (MHT's own website) ---------- */

/**
 * WooCommerce's "New order" email to the shop owner, e.g. subject
 * "[MHT- Music Hall Tavern]: New order #TFS/20957". Each product row reads
 * "<product> (#SKU) <qty> <line total> €"; checkout questions follow as "Question Answer".
 */
export function readWooOrder(subject: string, text: string): EmailRead | null {
  const order = `${subject}\n${text}`.match(/\b(?:new order|order)\s*:?\s*#\s*([A-Z]{0,6}\/?\d{2,})/i);
  const shopSubject = /\[[^\]]+\]:\s*(?:new order|order)\s*#/i.test(subject);
  if (!order || !(shopSubject || /woocommerce|billing address/i.test(text))) return null;
  const reference = order[1];

  if (/\b(cancel+ed|refunded|failed)\b/i.test(subject)) {
    const name = text.match(/(?:belonging to|order (?:#\S+ )?(?:from|for)) ([^:\n]+?)(?: has|:|\n)/i)?.[1]?.trim();
    return { kind: "cancel", confidence: 0.9, extracted: { reference, partner: "MHT website", ...(name ? { name } : {}) } };
  }
  if (!/\bnew order\b/i.test(subject + text)) return null;

  const e: ExtractedBooking = { reference, partner: "MHT website" };
  const from = text.match(/order from ([^:\n]+?):/i);
  if (from) e.name = from[1].trim();

  // Product rows. Item options (a bullet list inside the cell) can sit between the name and the qty.
  const rows = [...text.matchAll(/^(.+?)\s*\(#([A-Z0-9_-]+)\)([\s\S]{0,400}?)\s(\d{1,3})\s+(?:([\d.,]+)\s*[€£]|[€£]\s*([\d.,]+))/gim)];
  if (!rows.length) return null;
  const lines = rows.map((m) => ({ product: m[1].trim(), sku: m[2], qty: Number(m[4]), total: euros(m[5] ?? m[6] ?? "") ?? 0 }));

  let adults = 0;
  let children = 0;
  let infants = 0;
  for (const l of lines) {
    if (INFANT.test(l.product)) infants += l.qty;
    else if (CHILD.test(l.product)) children += l.qty;
    else adults += l.qty;
  }

  // "Tenerife Adult Dinner Show – Friday 2 Oct 2026" → the show, without the date or ticket type.
  const services = lines.map((l) =>
    l.product.replace(WEEKDAY_TAIL, "").replace(DATE_TAIL, "").replace(ADULT, "").replace(CHILD, "").replace(INFANT, "").replace(/\s{2,}/g, " ").trim(),
  );
  e.service = [...new Set(services)].join(" + ");
  e.date = findDate(lines[0].product) ?? findDate(text);

  const total = text.match(/^Total:\s*(?:[€£]\s*)?([\d.,]+)/im);
  e.amount = total ? euros(total[1]) : Math.round(lines.reduce((s, l) => s + l.total, 0) * 100) / 100;
  // Card, Link, PayPal and the like are taken at checkout; bank transfer, cash and "pay later" aren't.
  const method = text.match(/^Payment method:\s*([^\n]+)/im)?.[1]?.trim() ?? "";
  if (method) e.paymentMethod = method;
  if (method && !/bank|transfer|cash|cheque|check|later|on arrival|delivery|bacs/i.test(method)) e.paid = e.amount;

  const stay = answerTo(text, /name of (?:the |your )?(?:accommodation|hotel)|accommodation name|hotel name|which hotel|where are you staying/i);
  if (stay && !/^(n\/?a|none|-)$/i.test(stay)) e.location = stay;

  const billing = text.split(/billing address/i)[1]?.split(/\n\s*\n|shipping address|pixelyoursite/i)[0] ?? "";
  const phone = billing.match(/\+?\d[\d\s()-]{7,}\d/);
  if (phone) e.phone = phone[0].replace(/\s+/g, " ").trim();
  const email = billing.match(/[^\s@]+@[^\s@]+\.[a-z]{2,}/i);
  if (email) e.email = email[0];

  const notes: string[] = [];
  if (lines.length > 1 || lines.some((l) => ADULT.test(l.product) || CHILD.test(l.product))) {
    notes.push(`Tickets: ${lines.map((l) => `${l.qty} × ${l.product.replace(WEEKDAY_TAIL, "")}`).join(", ")}`);
  }
  // "Do you have any infants under 4? Yes, 1" — a number becomes infants; a bare yes stays a note.
  const infantAnswer = answerTo(text, /\binfants?\b/i);
  if (infantAnswer && !/^no\b/i.test(infantAnswer)) {
    const n = infantAnswer.match(/\b(\d{1,2})\b/);
    if (n && Number(n[1]) > 0) infants += Number(n[1]);
    else notes.push(`Infants: ${infantAnswer}`);
  }
  const note = text.match(/^(?:customer (?:provided )?note|note):\s*([^\n]+)/im);
  if (note) notes.push(note[1].trim());
  if (notes.length) e.requests = notes.join(". ");

  if (adults) e.adults = adults;
  if (children) e.children = children;
  if (infants) e.infants = infants;
  e.quantity = adults + children + infants;

  return { kind: "new", confidence: e.date && e.name ? 0.95 : 0.8, extracted: e };
}

/* ---------- GetYourGuide supplier emails ---------- */

/** "Booking - S100001 - GYGTEST12345" and its cancellation and change versions. */
export function readGetYourGuide(subject: string, text: string): EmailRead | null {
  const ref = `${subject}\n${text}`.match(/\b(GYG[A-Z0-9]{6,})\b/);
  if (!ref) return null;
  const e: ExtractedBooking = { reference: ref[1], partner: "GetYourGuide" };
  const kind: EmailKind = /cancel/i.test(subject) ? "cancel" : /\b(change|amend|modif|updated)/i.test(subject) ? "change" : "new";

  // "Your offer has been booked:" is followed by the product, then the option that was bought
  // (the option is what says pick-up or own way, so it goes in the notes).
  const offered = text.split(/your offer has been (?:booked|cancel+ed|changed)[^\n]*\n/i)[1]?.split(/\nReference number\b/i)[0];
  const offerLines = offered?.split("\n").map((l) => l.trim().replace(/^[^:]{2,30}:\s*/, "")).filter(Boolean) ?? [];
  if (offerLines.length) e.service = offerLines[0];

  const when = under(text, "Date")[0] ?? "";
  e.date = findDate(when);
  e.time = findTime(when);

  const block = text.split(/\nNumber of participants\n/i)[1]?.split(/\n(?:Main customer|Lead traveler|Customer)\n/i)[0] ?? "";
  let adults = 0;
  let children = 0;
  let infants = 0;
  const extras: string[] = [];
  for (const m of block.matchAll(/^(\d+)\s*x\s*(.+)$/gim)) {
    const n = Number(m[1]);
    const label = m[2].trim();
    if (INFANT.test(label)) infants += n;
    else if (CHILD.test(label)) children += n;
    else if (ADULT.test(label) || /\(age/i.test(label)) adults += n;
    else extras.push(`${n} × ${label}`);
  }
  if (adults + children + infants) {
    e.quantity = adults + children + infants;
    if (adults) e.adults = adults;
    if (children) e.children = children;
    if (infants) e.infants = infants;
  }

  const cust = under(text, "Main customer", 4);
  if (cust[0]) e.name = cust[0];
  const email = cust.find((l) => /@/.test(l));
  if (email) e.email = email;
  const phone = text.match(/^Phone:\s*([+\d][\d\s()-]{6,})$/im);
  if (phone) e.phone = phone[1].trim();
  const lang = text.match(/^Language:\s*(.+)$/im);
  if (lang) e.language = lang[1].trim();

  const price = under(text, "Price")[0];
  if (price) e.amount = euros(price);

  const notes = offerLines.length > 1 ? [`Option: ${offerLines[offerLines.length - 1]}`, ...extras] : [...extras];
  const pickup = text.match(/^(?:Pickup|Pick-up|Pick up)(?: location)?:?\s*\n?(.+)$/im);
  if (pickup) e.location = pickup[1].trim();
  if (notes.length) e.requests = notes.join(". ");

  if (kind === "new" && !e.date) return null;
  return { kind, confidence: e.date && e.name ? 0.95 : 0.8, extracted: e };
}

/**
 * The plain-text copy of an email, cleaned for the readers: Gmail's text version marks bold as
 * *2 x* and leaves "[image: logo]" and "<https://…>" lines; odd spaces (7:15 PM) become plain ones.
 */
export function cleanEmailText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[   ]/g, " ")
    .replace(/^[ \t>]*\[image:[^\]]*\][ \t]*$/gim, "")
    .replace(/^[ \t>]*<https?:\/\/[^>\s]*>?[ \t]*$/gim, "")
    .replace(/\*([^*\n]+)\*/g, "$1");
}

/** Tries each exact reader in turn. */
export function readKnownTemplate(fromEmail: string, subject: string, text: string): EmailRead | null {
  const body = cleanEmailText(text);
  if (/getyourguide/i.test(fromEmail) || /\bGYG[A-Z0-9]{6,}\b/.test(subject)) {
    const r = readGetYourGuide(subject, body);
    if (r) return r;
  }
  return readWooOrder(subject, body);
}

/* ---------- Pattern reader: the fallback when there's no template and no AI ---------- */

const KNOWN_SENDERS: [RegExp, string][] = [
  [/getyourguide/i, "GetYourGuide"],
  [/viator|tripadvisor/i, "Viator"],
  [/booking\.com/i, "Booking.com"],
  [/civitatis/i, "Civitatis"],
  [/airbnb/i, "Airbnb Experiences"],
  [/\btui\b/i, "TUI"],
  [/jet2/i, "Jet2"],
];

/** Reads an email with simple patterns. Low confidence on purpose: the office checks every field. */
export function readEmailByPattern(fromEmail: string, subject: string, body: string): EmailRead {
  const known = readKnownTemplate(fromEmail, subject, body);
  if (known) return known;
  const text = `${subject}\n${cleanEmailText(body)}`;
  const e: ExtractedBooking = {};
  let found = 0;

  const partner = KNOWN_SENDERS.find(([re]) => re.test(fromEmail))?.[1];
  if (partner) e.partner = partner;

  const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  const dmy = text.match(/\b(\d{1,2})[/.](\d{1,2})[/.](20\d{2})\b/);
  const words = findDate(text);
  if (iso) e.date = iso[1];
  else if (dmy) e.date = isoDate(dmy[3], Number(dmy[2]), dmy[1]);
  else if (words) e.date = words;
  if (e.date) found++;

  let adults = 0;
  let children = 0;
  let infants = 0;
  let people = 0;
  for (const m of text.matchAll(/(\d+)\s*x?\s*(adults?|child(?:ren)?|kids?|infants?|babies|people|persons?|personas|pax|guests|travell?ers|participants|adultos|niños)\b/gi)) {
    const n = Number(m[1]);
    if (/^adult/i.test(m[2])) adults += n;
    else if (/^(child|kid|niñ)/i.test(m[2])) children += n;
    else if (/^(infant|bab)/i.test(m[2])) infants += n;
    else people += n;
  }
  if (adults) e.adults = adults;
  if (children) e.children = children;
  if (infants) e.infants = infants;
  const total = adults + children + infants || people;
  if (total) {
    e.quantity = total;
    found++;
  } else {
    const t = text.match(/(?:participants|travell?ers|guests|pax|personas)\s*:\s*(\d+)/i);
    if (t) {
      e.quantity = Number(t[1]);
      found++;
    }
  }

  const name = text.match(/(?:lead traveller|lead traveler|traveller|traveler|customer|guest name|lead name|nombre|cliente)\s*:\s*([^\n,]+)/i);
  if (name) {
    e.name = name[1].trim();
    found++;
  }

  const money = text.match(/(?:EUR|€)\s*([\d.,]+)|([\d.,]+)\s*(?:EUR|€)/i);
  if (money) {
    const n = euros(money[1] ?? money[2]);
    if (n !== undefined) {
      e.amount = n;
      found++;
    }
  }

  const ref = text.match(/(?:booking reference|booking ref|reference|ref|localizador|confirmation (?:code|number))\.?\s*(?:no\.?|number)?\s*:?\s*([A-Z0-9][A-Z0-9/-]{4,})/i);
  if (ref) e.reference = ref[1];

  const pickup = text.match(/(?:pick-?up|recogida|hotel|accommodation)\s*:\s*([^\n,]+)/i);
  if (pickup) e.location = pickup[1].trim();

  const activity = text.match(/(?:activity|tour|product|actividad|excursion|show)\s*:\s*([^\n]+)/i);
  if (activity) e.service = activity[1].trim();

  const kind: EmailKind = /cancel|anulad|cancelad/i.test(subject)
    ? "cancel"
    : /\b(change|amend|modif|cambio)/i.test(subject)
      ? "change"
      : found >= 2
        ? "new"
        : /\?/.test(text)
          ? "question"
          : "not-booking";

  return { kind, extracted: e, confidence: Math.min(0.75, 0.3 + found * 0.1) };
}
