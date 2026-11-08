/**
 * "Last 30 taken" on Bookings (Joel, 8 Nov 2026): the newest bookings by when they
 * were entered, across every show date, so the office can eyeball mistakes and
 * double entries.
 */

export const LATEST_BOOKINGS_LIMIT = 30;

export type LatestBookingKeyRow = {
  id: string;
  guest_name: string | null;
  show_date: string | null;
  island: string | null;
  cancelled_at: string | null;
};

function norm(s: string | null | undefined) {
  return String(s ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Ids of live bookings that look like the same booking entered twice: same guest
 * name, same show night, same island. Cancelled rows never count.
 */
export function possibleDuplicateIds(rows: LatestBookingKeyRow[]): Set<string> {
  const byKey = new Map<string, string[]>();
  for (const r of rows) {
    if (r.cancelled_at) continue;
    const name = norm(r.guest_name);
    if (!name || !r.show_date) continue;
    const key = `${name}|${r.show_date}|${r.island ?? ""}`;
    byKey.set(key, [...(byKey.get(key) ?? []), r.id]);
  }
  const out = new Set<string>();
  for (const ids of byKey.values()) if (ids.length > 1) ids.forEach((id) => out.add(id));
  return out;
}

/** "Sun 8 Nov, 14:03" in Canary time — when the booking was entered. */
export function takenAtLabel(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Atlantic/Canary",
  });
}
