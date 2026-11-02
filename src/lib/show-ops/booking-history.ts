/**
 * Booking edit history: what changed between two saves, and how to print it.
 * Pure presentation helpers; automatic audit rows are written by the database.
 */

export type BookingFieldChange = { from: unknown; to: unknown };
export type BookingChanges = Record<string, BookingFieldChange>;

/** Fields worth a history line. Anything else (updated_at, snapshots) is noise. */
export const BOOKING_HISTORY_FIELDS = [
  "guest_name",
  "guest_mobile",
  "guest_email",
  "show_name",
  "product_id",
  "show_date",
  "hotel_name",
  "pickup_stop_name",
  "pickup_time",
  "pickup_kind",
  "transport_required",
  "private_accommodation",
  "private_zone",
  "adults",
  "children",
  "infants",
  "supplier_name",
  "supplier_id",
  "billing_mode",
  "total_cost",
  "deposit_amount",
  "balance_remaining",
  "nett_total",
  "dietary_required",
  "dietary_notes",
  "office_comments",
  "office_only_comments",
  "payment_method",
  "supplier_ticket_number",
] as const;

export const BOOKING_HISTORY_LABELS: Record<string, string> = {
  guest_name: "Name",
  guest_mobile: "Mobile",
  guest_email: "Email",
  show_name: "Show",
  product_id: "Show id",
  show_date: "Date",
  hotel_name: "Hotel",
  pickup_stop_name: "Pick-up",
  pickup_time: "Pick-up time",
  pickup_kind: "Getting there",
  transport_required: "Bus",
  private_accommodation: "Staying at",
  private_zone: "Resort",
  adults: "Adults",
  children: "Children",
  infants: "Infants",
  supplier_name: "Partner",
  supplier_id: "Partner id",
  billing_mode: "Billing",
  total_cost: "Total",
  deposit_amount: "Deposit",
  balance_remaining: "Balance",
  nett_total: "Nett",
  dietary_required: "Dietary",
  dietary_notes: "Dietary notes",
  office_comments: "Comments",
  office_only_comments: "Office-only comments",
  payment_method: "Paid by",
  supplier_ticket_number: "Ticket #",
  cancelled: "Cancelled",
  created: "Booking created",
  created_at: "Created at",
  created_by: "Created by account",
  created_by_name: "Creator",
  cancelled_at: "Cancelled at",
  cancelled_by: "Cancelled by account",
  cancellation_reason: "Cancellation reason",
  cancel_reason: "Cancellation reason",
  ticket_type_name: "Ticket type",
  ticket_type_id: "Ticket type id",
  extras_snapshot: "Extras",
  pricing_snapshot: "Recorded prices",
  infant_nett_total: "Infant nett",
  adult_nett_total: "Adult nett",
  child_nett_total: "Child nett",
  payment_status: "Payment status",
  arrived_pax: "Arrived passengers",
  arrived_at: "Arrival recorded at",
  no_show: "No-show",
  no_show_charge: "No-show charge decision",
  no_show_proof_path: "Ticket photo",
  invoice_id: "Invoice id",
};

/** Ids duplicate their name column; skip them in the printed line when the name moved too. */
const ID_SHADOWS: Record<string, string> = { product_id: "show_name", supplier_id: "supplier_name" };

function normalise(v: unknown): unknown {
  if (v === undefined || v === null) return null;
  if (typeof v === "string") {
    const s = v.trim();
    if (s === "") return null;
    // "18:30:00" and "18:30" are the same pick-up time.
    if (/^\d{2}:\d{2}(:\d{2})?$/.test(s)) return s.slice(0, 5);
    return s;
  }
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
  if (typeof v === "boolean") return v;
  return v;
}

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  // numeric strings vs numbers (Postgres numeric comes back as a string)
  if ((typeof a === "number" || typeof a === "string") && (typeof b === "number" || typeof b === "string")) {
    const na = Number(a);
    const nb = Number(b);
    if (String(a).trim() !== "" && String(b).trim() !== "" && Number.isFinite(na) && Number.isFinite(nb)) {
      return Math.abs(na - nb) < 0.005;
    }
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * {field: {from, to}} for every whitelisted field that differs. Unset on one
 * side counts as null, so a column the old row never had still diffs cleanly.
 */
export function diffBookingFields(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  whitelist: readonly string[] = BOOKING_HISTORY_FIELDS,
): BookingChanges {
  const out: BookingChanges = {};
  for (const field of whitelist) {
    const from = normalise(before?.[field]);
    const to = normalise(after?.[field]);
    if (!same(from, to)) out[field] = { from, to };
  }
  return out;
}

function printValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (v === true) return "yes";
  if (v === false) return "no";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(2);
  if (Array.isArray(v)) return printList(v);
  if (typeof v === "object") return "updated";
  return String(v);
}

/** Extras and similar lists: "Meal ×2, Photo". Never raw JSON. */
function printList(items: unknown[]): string {
  if (!items.length) return "none";
  return items
    .map((it) => {
      if (it && typeof it === "object") {
        const o = it as Record<string, unknown>;
        const name = o.name ?? o.label ?? o.title;
        const qty = Number(o.quantity ?? o.qty);
        if (name) return Number.isFinite(qty) && qty > 1 ? `${name} ×${qty}` : String(name);
        return "item";
      }
      return String(it);
    })
    .join(", ");
}

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v as object).length === 0;
  return false;
}

/** Bookkeeping columns staff never need to read in History. */
const HIDDEN_FIELDS = new Set([
  "id",
  "booking_ref",
  "booking_ref_num",
  "business_id",
  "created_at",
  "created_by",
  "created_by_name",
  "pricing_snapshot",
  "custom_answers",
  "ticket_token",
]);

/**
 * Internal ids, account uuids, timestamps (the entry already has its own time),
 * storage paths and imports from the old system are hidden; the readable column
 * next to them (hotel name, partner name, cancel reason…) carries the meaning.
 */
export function isHiddenHistoryField(field: string): boolean {
  if (HIDDEN_FIELDS.has(field)) return true;
  if (field.startsWith("legacy_")) return true;
  return /(_id|_by|_at|_token|_snapshot|_ref_num)$/.test(field);
}

function shortDate(v: unknown): string {
  const s = typeof v === "string" ? v : "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return printValue(v);
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * The insert row records every column. Print it as one short line:
 * "Booking created: MHT-1014 · JOEL TEST · 1 MHT ACE on 3 Nov 2026 · 3 adults · Pick-up Playa Blanca 18:40 · ACE Web Booking · Total 177"
 */
function formatCreated(changes: BookingChanges): string {
  const to = (k: string) => {
    const c = changes[k];
    return c && typeof c === "object" ? c.to : null;
  };
  const parts: string[] = [];
  const ref = to("created") ?? to("booking_ref");
  parts.push(`Booking created${isEmpty(ref) ? "" : `: ${printValue(ref)}`}`);
  if (!isEmpty(to("guest_name"))) parts.push(printValue(to("guest_name")));
  const show = isEmpty(to("show_name")) ? "" : printValue(to("show_name"));
  const date = isEmpty(to("show_date")) ? "" : shortDate(to("show_date"));
  if (show || date) parts.push([show, date && `on ${date}`].filter(Boolean).join(" "));
  const pax: string[] = [];
  const adults = Number(to("adults") ?? 0);
  const children = Number(to("children") ?? 0);
  const infants = Number(to("infants") ?? 0);
  if (adults > 0) pax.push(plural(adults, "adult", "adults"));
  if (children > 0) pax.push(plural(children, "child", "children"));
  if (infants > 0) pax.push(plural(infants, "infant", "infants"));
  if (pax.length) parts.push(pax.join(", "));
  const pickup = isEmpty(to("pickup_stop_name")) ? "" : printValue(to("pickup_stop_name"));
  const time = isEmpty(to("pickup_time")) ? "" : String(normalise(to("pickup_time")));
  if (pickup) parts.push(`Pick-up ${pickup}${time ? ` ${time}` : ""}`);
  else if (!isEmpty(to("private_accommodation"))) parts.push(`Staying at ${printValue(to("private_accommodation"))}`);
  if (!isEmpty(to("supplier_name"))) parts.push(printValue(to("supplier_name")));
  if (!isEmpty(to("total_cost"))) parts.push(`Total ${printValue(normalise(to("total_cost")))}`);
  return parts.join(" · ");
}

/** "Hotel: Sol Puerto → Riu Paraiso; Adults: 2 → 3" */
export function formatBookingChanges(changes: BookingChanges | null | undefined, labels: Record<string, string> = BOOKING_HISTORY_LABELS): string {
  if (!changes) return "";
  if (changes.created && typeof changes.created === "object") return formatCreated(changes);
  const parts: string[] = [];
  for (const [field, change] of Object.entries(changes)) {
    if (!change || typeof change !== "object") continue;
    const shadow = ID_SHADOWS[field];
    if (shadow && changes[shadow]) continue;
    const label = labels[field] ?? humanise(field);
    if (field === "cancelled") {
      parts.push(`${label}: ${printValue(change.to)}`);
      continue;
    }
    if (isHiddenHistoryField(field)) continue;
    if (isEmpty(change.from) && isEmpty(change.to)) continue;
    if (same(normalise(change.from), normalise(change.to))) continue;
    if (field.endsWith("_path")) {
      parts.push(`${label}: ${isEmpty(change.to) ? "removed" : "added"}`);
      continue;
    }
    parts.push(`${label}: ${printValue(change.from)} → ${printValue(change.to)}`);
  }
  return parts.join("; ");
}

function humanise(field: string): string {
  const s = field.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Full date and office clock, including year and time-zone label. */
export function formatBookingHistoryWhen(iso: string, timeZone = "Atlantic/Canary"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // Fixed month names: en-GB ICU data says "Sept", which is not what the office writes.
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const month = MONTHS[Number(get("month")) - 1] ?? get("month");
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${Number(get("day"))} ${month} ${get("year")} ${hour}:${get("minute")}:${get("second")} · ${timeZone === "Atlantic/Canary" ? "Canary time" : timeZone}`;
}
