import { partnerSellsOnIsland } from "@/lib/show-ops/partners";

import { isMatchOnlySeller } from "./sellers";
import type { ExtractedBooking } from "./types";

/**
 * Maps what was read from a booking email onto MHT's own records: which show (by island + name +
 * the nights it runs), which partner row the sale belongs to, which directory hotel, and the
 * channel + reference used to never create the same booking twice. Pure: the page loads the
 * catalogue and passes it in, so every rule here is unit-tested.
 */

/* ---------- Islands ---------- */

/** Order prefixes and SKU codes MHT uses: TFS/20957, TFS_AD_8027, ACE/1234, LPA… */
const ISLAND_CODES: Record<string, string> = {
  TFS: "Tenerife",
  ACE: "Lanzarote",
  LPA: "Gran Canaria",
  GC: "Gran Canaria",
  GCA: "Gran Canaria",
  FUE: "Fuerteventura",
  UK: "UK Tour",
};
const ISLAND_WORDS: [RegExp, string][] = [
  [/\btenerife\b/i, "Tenerife"],
  [/\blanzarote\b/i, "Lanzarote"],
  [/\bgran canaria\b/i, "Gran Canaria"],
  [/\bfuerteventura\b/i, "Fuerteventura"],
  [/\buk tour\b/i, "UK Tour"],
];

export function islandCode(island: string | null | undefined): string | null {
  const hit = Object.entries(ISLAND_CODES).find(([code, name]) => name === island && code.length === 3);
  return hit?.[0] ?? null;
}

/**
 * The island a booking email is for: the order prefix first (TFS/…), then island names in the
 * text, then the inbox it arrived in (tenerife@…). Only islands the workspace actually has.
 */
export function islandFromEmail(
  input: { reference?: string; text: string; inbox?: string | null },
  islands: string[],
): string | null {
  const allowed = (i: string | undefined | null) => (i && (!islands.length || islands.includes(i)) ? i : null);
  const code = (input.reference ?? "").match(/^\s*([A-Z]{2,3})\s*[/_-]/i)?.[1]?.toUpperCase();
  if (code && allowed(ISLAND_CODES[code])) return ISLAND_CODES[code];
  const sku = input.text.match(/\(#\s*([A-Z]{2,3})_/);
  if (sku && allowed(ISLAND_CODES[sku[1].toUpperCase()])) return ISLAND_CODES[sku[1].toUpperCase()];
  const named = [...new Set(ISLAND_WORDS.filter(([re]) => re.test(input.text)).map(([, name]) => name))].filter((n) => allowed(n));
  if (named.length === 1) return named[0];
  const inbox = (input.inbox ?? "").split("@")[0] ?? "";
  const fromInbox = ISLAND_WORDS.find(([re]) => re.test(inbox.replace(/[._-]/g, " ")))?.[1];
  return allowed(fromInbox) ?? null;
}

/* ---------- Text matching ---------- */

export function normaliseName(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    // Filler words the same hotel is written with or without ("Hotel Riu Palace" = "Riu Palace").
    .replace(/\b(the|hotel|hotels|aparthotel|apartments?|apartamentos?|apts?|resort|spa|and|by)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string | null | undefined): string[] {
  return normaliseName(value)
    .split(" ")
    .filter((t) => t.length > 2 && !["show", "mht", "music", "hall", "tavern", "ticket", "tickets", "dinner", "adult", "child"].includes(t));
}

/* ---------- Shows ---------- */

export type CatalogProduct = {
  id: string;
  name: string;
  island: string;
  show_time?: string | null;
  run_weekdays?: number[] | null;
  run_dates?: string[] | null;
  dark_dates?: string[] | null;
  transport_available?: boolean;
  show_ticket_types?: { id: string; name: string; active: boolean }[] | null;
};

/** Whether a show runs on a date (0 = Sunday, same as show_products.run_weekdays). */
export function productRunsOn(p: CatalogProduct, date: string | undefined): boolean | null {
  if (!date) return null;
  if ((p.dark_dates ?? []).includes(date)) return false;
  if ((p.run_dates ?? []).includes(date)) return true;
  const days = p.run_weekdays ?? [];
  if (!days.length) return null;
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
  return days.includes(dow);
}

/**
 * The show a booking is for. On one island MHT runs one main show a night, so the island plus the
 * night usually settles it; the name only breaks ties (a UK tour leg, a New Year special).
 */
export function matchProduct(
  products: CatalogProduct[],
  island: string | null,
  date: string | undefined,
  service: string | undefined,
): CatalogProduct | null {
  const pool = island ? products.filter((p) => p.island === island) : products;
  if (!pool.length) return null;
  const want = new Set(tokens(service));
  const scored = pool.map((p) => {
    const runs = productRunsOn(p, date);
    const nameScore = tokens(p.name).filter((t) => want.has(t)).length;
    return { p, runs, score: (runs === true ? 4 : runs === false ? -4 : 0) + nameScore };
  });
  scored.sort((a, b) => b.score - a.score);
  const [best, second] = scored;
  if (best.runs === false) return null;
  if (!island && best.score <= 0) return null;
  if (second && second.score === best.score) return null;
  return best.p;
}

export function matchTicketType(product: CatalogProduct | null, text: string): string | null {
  const types = (product?.show_ticket_types ?? []).filter((t) => t.active);
  if (!types.length) return null;
  const hay = ` ${normaliseName(text)} `;
  const hits = types.filter((t) => {
    const n = normaliseName(t.name);
    return n.length >= 3 && hay.includes(` ${n} `);
  });
  hits.sort((a, b) => normaliseName(b.name).length - normaliseName(a.name).length);
  return hits[0]?.id ?? null;
}

/* ---------- Partners (show_suppliers) ---------- */

export type CatalogSupplier = {
  id: string;
  name: string;
  partner_type?: string | null;
  island?: string | null;
  billing_mode?: string | null;
};

/** Mapping rows from Settings → GetYourGuide products (the island's GYG partner, show and pick-up). */
export type CatalogChannelProduct = {
  product_id: string;
  supplier_id: string;
  ticket_type_id: string | null;
  pickup_kind: string;
  island: string | null;
  active: boolean;
};

export type SellerSource = "getyourguide" | "website" | "marketplace" | "custom";

export function sellerSource(sellerKey: string | null | undefined, e: ExtractedBooking): SellerSource {
  if (sellerKey === "getyourguide" || /^GYG[A-Z0-9]{6,}$/.test(e.reference ?? "") || /getyourguide/i.test(e.partner ?? "")) return "getyourguide";
  if (/mht website/i.test(e.partner ?? "")) return "website";
  if (sellerKey && !sellerKey.startsWith("custom:")) return "marketplace";
  return "custom";
}

function supplierScore(s: CatalogSupplier, island: string | null): number {
  let score = 0;
  const code = islandCode(island);
  if (island && code && new RegExp(`\\b${code}\\b`, "i").test(s.name)) score += 3;
  if (island && s.name.toLowerCase().includes(island.toLowerCase())) score += 3;
  if (island && (s.island ?? "").split(",").map((x) => x.trim()).includes(island)) score += 1;
  return score;
}

function bestSupplier(pool: CatalogSupplier[], island: string | null, prefer?: (s: CatalogSupplier) => boolean): CatalogSupplier | null {
  const sells = pool.filter((s) => partnerSellsOnIsland(s.island, island));
  if (!sells.length) return null;
  const ranked = sells
    .map((s) => ({ s, score: supplierScore(s, island) + (prefer?.(s) ? 1 : 0) }))
    .sort((a, b) => b.score - a.score || a.s.name.localeCompare(b.s.name));
  return ranked[0].s;
}

/**
 * The partner row a sale belongs to: GetYourGuide → the island's GYG partner (invoice rows first,
 * like the GYG API), website orders → the island's MHT Web partner, a marketplace or custom sender
 * → a partner carrying its name.
 */
export function matchSupplier(
  suppliers: CatalogSupplier[],
  source: SellerSource,
  sellerName: string | null | undefined,
  island: string | null,
): CatalogSupplier | null {
  if (source === "getyourguide") {
    const pool = suppliers.filter((s) => /^gyg$/i.test(s.partner_type ?? "") || /get\s*your\s*guide|\bgyg\b/i.test(s.name));
    return bestSupplier(pool, island, (s) => s.billing_mode === "invoice");
  }
  if (source === "website") {
    const typed = suppliers.filter((s) => /^mht web$/i.test((s.partner_type ?? "").trim()));
    const pool = typed.length ? typed : suppliers.filter((s) => /\bweb\b/i.test(s.name) && !/get\s*your\s*guide/i.test(s.name));
    return bestSupplier(pool, island);
  }
  const name = String(sellerName ?? "").trim().toLowerCase();
  if (name.length < 3) return null;
  const pool = suppliers.filter((s) => s.name.toLowerCase().includes(name));
  return bestSupplier(pool, island);
}

/* ---------- Hotels ---------- */

export type CatalogHotel = { id: string; name: string; island: string; bus_stop_id?: string | null };

/** A directory hotel for the accommodation the email names: exact name first, then a clear containment. */
export function matchHotel(hotels: CatalogHotel[], location: string | undefined, island: string | null): CatalogHotel | null {
  const want = normaliseName(location);
  if (want.length < 3) return null;
  const pool = island ? hotels.filter((h) => h.island === island) : hotels;
  const exact = pool.filter((h) => normaliseName(h.name) === want);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;
  const contained = pool.filter((h) => {
    const n = normaliseName(h.name);
    return n.length >= 5 && (` ${want} `.includes(` ${n} `) || (want.length >= 5 && ` ${n} `.includes(` ${want} `)));
  });
  if (!contained.length) return null;
  contained.sort((a, b) => normaliseName(b.name).length - normaliseName(a.name).length);
  const top = normaliseName(contained[0].name).length;
  return contained.filter((h) => normaliseName(h.name).length === top).length === 1 ? contained[0] : null;
}

/* ---------- Pick-up ---------- */

/** GetYourGuide's option line says pick-up or own way ("… - Direct Guests South" = own way). */
export function pickupFromText(text: string): "bus" | "own_way" | null {
  if (/\b(without|no)\s+(transport|transfer|pick-?up)|\bdirect guests?\b|\bown way\b|\bmeet(ing)? at the venue\b|\bshow only\b/i.test(text)) return "own_way";
  if (/\bwith\s+(transport|transfer|pick-?up)|\bhotel pick-?up\b|\bincl(uding|\.)?\s+(transport|transfer|pick-?up)\b|\bpick-?up included\b/i.test(text)) return "bus";
  return null;
}

/* ---------- Channel + reference (dedupe) ---------- */

/**
 * show_bookings(channel, channel_ref) is unique per business. GetYourGuide uses the same channel
 * as the GYG API ("getyourguide"), so an email for a booking the API already made is caught.
 */
export function channelFor(source: SellerSource, sellerKey: string | null | undefined): string {
  if (source === "getyourguide") return "getyourguide";
  if (source === "website") return "website";
  if (source === "marketplace" && sellerKey) return sellerKey;
  return "email";
}

export function channelRefFor(e: ExtractedBooking): string | null {
  const ref = String(e.reference ?? "").trim().replace(/^#/, "");
  return ref.length >= 3 && ref.length <= 120 ? ref : null;
}

export const normRef = (s: string | null | undefined) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/* ---------- The prefilled booking ---------- */

/** The subset of the booking form's defaults an email can fill (structurally BookingFormDefaults). */
export type EmailDraftDefaults = {
  show_date?: string;
  guest_name?: string;
  guest_mobile?: string | null;
  guest_email?: string | null;
  product_id?: string | null;
  ticket_type_id?: string | null;
  hotel_id?: string | null;
  supplier_id?: string | null;
  transport_required?: boolean;
  pickup_kind?: string | null;
  payment_method?: string | null;
  adults?: number;
  children?: number;
  infants?: number;
  supplier_ticket_number?: string | null;
  office_comments?: string | null;
  office_only_comments?: string | null;
};

export type EmailBookingDraft = {
  island: string | null;
  product: CatalogProduct | null;
  supplier: CatalogSupplier | null;
  hotel: CatalogHotel | null;
  channel: string;
  channelRef: string | null;
  defaults: EmailDraftDefaults;
  /** Things for Ruth to check before saving, in plain words. */
  checks: string[];
};

const money = (n: number | undefined) => (n === undefined ? "" : `€${n.toFixed(2)}`);

export function bookingDraftFromEmail(input: {
  extracted: ExtractedBooking;
  sellerKey: string | null;
  sellerName: string | null;
  subject: string;
  body: string;
  inbox?: string | null;
  islands: string[];
  products: CatalogProduct[];
  suppliers: CatalogSupplier[];
  hotels: CatalogHotel[];
  channelProducts?: CatalogChannelProduct[];
}): EmailBookingDraft {
  const e = input.extracted;
  const checks: string[] = [];
  const source = sellerSource(input.sellerKey, e);
  const text = `${input.subject}\n${e.service ?? ""}\n${input.body}`;
  const island = islandFromEmail({ reference: e.reference, text, inbox: input.inbox }, input.islands);

  // GetYourGuide: the island's mapping in Settings → GetYourGuide products settles show + partner.
  const mapped =
    source === "getyourguide" && island
      ? (input.channelProducts ?? []).filter((c) => c.active && c.island === island)
      : [];
  const mapping = mapped.length === 1 ? mapped[0] : null;

  const product =
    (mapping && input.products.find((p) => p.id === mapping.product_id)) || matchProduct(input.products, island, e.date, e.service);
  const supplier =
    (mapping && input.suppliers.find((s) => s.id === mapping.supplier_id)) ||
    matchSupplier(input.suppliers, source, input.sellerName ?? e.partner, island);
  const hotel = matchHotel(input.hotels, e.location, island);
  const ticketTypeId = mapping?.ticket_type_id ?? matchTicketType(product, `${e.service ?? ""} ${e.requests ?? ""}`);

  let pickup: "bus" | "own_way" | "private" | null = pickupFromText(`${e.service ?? ""}\n${e.requests ?? ""}`);
  if (!pickup && mapping && (mapping.pickup_kind === "own_way" || mapping.pickup_kind === "private")) pickup = mapping.pickup_kind;

  if (!island) checks.push("Couldn't tell which island this is for. Pick the show.");
  if (!product) checks.push(island ? `No ${island} show matched${e.date ? ` on ${e.date}` : ""}. Pick the show.` : "Pick the show.");
  else if (productRunsOn(product, e.date) === false) checks.push(`${product.name} doesn't normally run on ${e.date}. Check the date.`);
  if (!e.date) checks.push("The email has no show date. Pick the night.");
  if (!supplier) checks.push(`No partner matched for ${input.sellerName ?? e.partner ?? "this sender"}${island ? ` on ${island}` : ""}. Pick the partner.`);
  if (e.location && !hotel) checks.push(`Hotel "${e.location}" isn't in the hotel list by that name. Pick it or choose private / own way.`);
  if (!e.time && source === "website" && product?.show_time) checks.push(`Website orders don't say a time; the show's time (${product.show_time}) applies.`);
  if (e.time && product?.show_time && !product.show_time.startsWith(e.time)) checks.push(`The email says ${e.time}; the show is at ${product.show_time}.`);
  if (e.amount !== undefined) checks.push(`The email's price is ${money(e.amount)}. Check it against the Hub's price before saving.`);
  if (isMatchOnlySeller(input.sellerKey)) checks.push(`${input.sellerName ?? "This partner"} usually phones bookings in first. Use Match if it's already booked.`);

  let adults = e.adults;
  const children = e.children;
  const infants = e.infants;
  if (adults === undefined && e.quantity !== undefined) adults = Math.max(0, e.quantity - (children ?? 0) - (infants ?? 0));

  const seller = input.sellerName ?? e.partner ?? "Email";
  const channelRef = channelRefFor(e);
  const officeComments = [e.reference ? `${seller} ${e.reference}` : seller, e.requests].filter(Boolean).join(" · ").slice(0, 500);
  const privateBits = [
    `From email: ${input.subject}`.slice(0, 200),
    e.amount !== undefined ? `Email price ${money(e.amount)}` : "",
    e.paid !== undefined ? `Paid online ${money(e.paid)}${e.paymentMethod ? ` (${e.paymentMethod})` : ""}` : "",
    e.net !== undefined ? `MHT receives ${money(e.net)}` : "",
    e.location && !hotel ? `Hotel in email: ${e.location}` : "",
    e.language ? `Language: ${e.language}` : "",
  ].filter(Boolean);

  const defaults: EmailDraftDefaults = {
    ...(e.date ? { show_date: e.date } : {}),
    ...(e.name ? { guest_name: e.name } : {}),
    ...(e.email ? { guest_email: e.email } : {}),
    ...(e.phone ? { guest_mobile: e.phone } : {}),
    ...(product ? { product_id: product.id } : {}),
    ...(ticketTypeId && product ? { ticket_type_id: ticketTypeId } : {}),
    ...(supplier ? { supplier_id: supplier.id } : {}),
    ...(hotel ? { hotel_id: hotel.id } : {}),
    ...(pickup ? { pickup_kind: pickup, transport_required: pickup === "bus" } : {}),
    ...(e.paid !== undefined && e.paid > 0 ? { payment_method: "card" } : {}),
    ...(adults !== undefined ? { adults } : {}),
    ...(children !== undefined ? { children } : {}),
    ...(infants !== undefined ? { infants } : {}),
    ...(e.reference ? { supplier_ticket_number: e.reference.slice(0, 120) } : {}),
    office_comments: officeComments || null,
    office_only_comments: privateBits.join(" · ").slice(0, 1000) || null,
  };

  return { island, product, supplier, hotel, channel: channelFor(source, input.sellerKey), channelRef, defaults, checks };
}

/* ---------- Existing bookings an email may be about ---------- */

export type BookingCandidate = {
  id: string;
  booking_ref: string;
  guest_name: string;
  show_date: string;
  show_name?: string | null;
  supplier_name?: string | null;
  adults?: number | null;
  children?: number | null;
  infants?: number | null;
  hotel_name?: string | null;
  channel?: string | null;
  channel_ref?: string | null;
  supplier_ticket_number?: string | null;
  cancelled_at?: string | null;
};

export type BookingMatch = { booking: BookingCandidate; kind: "same" | "possible"; why: string };

function surnameOf(name: string | undefined): string {
  const parts = String(name ?? "").trim().split(/\s+/);
  return (parts[parts.length - 1] ?? "").toLowerCase();
}

/** Same reference (channel ref or the partner's ticket number) = the same booking; same night + surname = possibly. */
export function rankBookingMatches(e: ExtractedBooking, rows: BookingCandidate[]): BookingMatch[] {
  const ref = normRef(e.reference);
  const surname = surnameOf(e.name);
  const out: BookingMatch[] = [];
  const seen = new Set<string>();
  for (const b of rows) {
    if (ref.length >= 3 && (normRef(b.channel_ref) === ref || normRef(b.supplier_ticket_number) === ref)) {
      out.push({ booking: b, kind: "same", why: normRef(b.channel_ref) === ref ? "Same reference" : "Same ticket number" });
      seen.add(b.id);
    }
  }
  for (const b of rows) {
    if (seen.has(b.id)) continue;
    if (surname.length > 2 && e.date && b.show_date === e.date && b.guest_name.toLowerCase().includes(surname)) {
      out.push({ booking: b, kind: "possible", why: "Same night and surname" });
    }
  }
  return out;
}

/** What a change email says that differs from the booking, in plain words. */
export function bookingDifferences(e: ExtractedBooking, b: BookingCandidate): string[] {
  const diffs: string[] = [];
  if (e.date && e.date !== b.show_date) diffs.push(`Date ${b.show_date} → ${e.date}`);
  if (e.adults !== undefined && e.adults !== (b.adults ?? 0)) diffs.push(`Adults ${b.adults ?? 0} → ${e.adults}`);
  if (e.children !== undefined && e.children !== (b.children ?? 0)) diffs.push(`Children ${b.children ?? 0} → ${e.children}`);
  if (e.infants !== undefined && e.infants !== (b.infants ?? 0)) diffs.push(`Infants ${b.infants ?? 0} → ${e.infants}`);
  if (e.name && normaliseName(e.name) !== normaliseName(b.guest_name)) diffs.push(`Name ${b.guest_name} → ${e.name}`);
  if (e.location && b.hotel_name && normaliseName(e.location) !== normaliseName(b.hotel_name)) diffs.push(`Hotel ${b.hotel_name} → ${e.location}`);
  return diffs;
}
