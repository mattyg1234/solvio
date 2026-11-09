/**
 * Which guest-facing details changed when a booking was edited, so "Update booking"
 * re-sends the guest their confirmation only when something they would see moved.
 * Office notes, partner, payment method etc. never trigger a re-send.
 */

const GUEST_FACING: Array<{ key: string; label: string }> = [
  { key: "guest_name", label: "name" },
  { key: "guest_email", label: "email" },
  { key: "guest_mobile", label: "mobile" },
  { key: "show_name", label: "show" },
  { key: "show_date", label: "date" },
  { key: "ampm", label: "show time" },
  { key: "adults", label: "adults" },
  { key: "children", label: "children" },
  { key: "infants", label: "infants" },
  { key: "hotel_name", label: "hotel" },
  { key: "transport_required", label: "transport" },
  { key: "pickup_kind", label: "pick-up type" },
  { key: "private_zone", label: "private zone" },
  { key: "pickup_stop_name", label: "pick-up point" },
  { key: "pickup_time", label: "pick-up time" },
  { key: "total_cost", label: "total" },
  { key: "dietary_notes", label: "dietary notes" },
];

function norm(key: string, v: unknown): string {
  if (v == null) return "";
  if (typeof v === "boolean") return v ? "1" : "";
  if (typeof v === "number") return Number.isFinite(v) ? String(Math.round(v * 100) / 100) : "";
  const s = String(v).trim();
  if (key === "pickup_time") return s.slice(0, 5);
  if (key === "total_cost" && s !== "" && Number.isFinite(Number(s))) return String(Math.round(Number(s) * 100) / 100);
  if (key === "adults" || key === "children" || key === "infants") return String(Number(s) || 0);
  if (key === "guest_email") return s.toLowerCase();
  if (key === "guest_mobile") return s.replace(/[^\d+]/g, "");
  return s;
}

/** Labels of the guest-facing fields that differ between the saved row and the edit. */
export function guestFacingChanges(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const { key, label } of GUEST_FACING) {
    if (!(key in after)) continue;
    if (norm(key, before[key]) !== norm(key, after[key])) out.push(label);
  }
  return out;
}

/** Today's date (YYYY-MM-DD) in the Canary Islands. */
export function canaryToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Atlantic/Canary", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
