/**
 * Booking edit history: what changed between two saves, and how to print it.
 * Pure — the row write lives in the server action.
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
  return String(v);
}

/** "Hotel: Sol Puerto → Riu Paraiso; Adults: 2 → 3" */
export function formatBookingChanges(changes: BookingChanges | null | undefined, labels: Record<string, string> = BOOKING_HISTORY_LABELS): string {
  if (!changes) return "";
  const parts: string[] = [];
  for (const [field, change] of Object.entries(changes)) {
    if (!change || typeof change !== "object") continue;
    const shadow = ID_SHADOWS[field];
    if (shadow && changes[shadow]) continue;
    const label = labels[field] ?? field.replace(/_/g, " ");
    if (field === "cancelled") {
      parts.push(`${label}: ${printValue(change.to)}`);
      continue;
    }
    parts.push(`${label}: ${printValue(change.from)} → ${printValue(change.to)}`);
  }
  return parts.join("; ");
}

/** "4 Sep 21:14" — office clock, Canary time. */
export function formatBookingHistoryWhen(iso: string, timeZone = "Atlantic/Canary"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // Fixed month names: en-GB ICU data says "Sept", which is not what the office writes.
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const month = MONTHS[Number(get("month")) - 1] ?? get("month");
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${Number(get("day"))} ${month} ${hour}:${get("minute")}`;
}
