import { isoDateInTimeZone } from "@/lib/show-ops/digest";

/** Nights are local: Canary shows and the UK tour both count "tonight" in their own zone. */
export const SHOW_OPS_SCAN_ZONES = ["Atlantic/Canary", "Europe/London"] as const;

/** Is a ticket for tonight, in any zone the operator works in? */
export function ticketIsForTonight(showDate: string, now: Date = new Date()): boolean {
  const date = String(showDate || "").slice(0, 10);
  return SHOW_OPS_SCAN_ZONES.some((tz) => isoDateInTimeZone(now, tz) === date);
}

export type ScanArrivalPlan =
  | { kind: "first"; arrivedPax: number }
  | { kind: "complete_party"; arrivedPax: number; remaining: number }
  | { kind: "already_in" };

/**
 * What a scan should do given the party's current state. A first scan brings the
 * whole party in; scanning a partially-arrived party brings the rest in; a party
 * already fully in is reported as such. Door staff can still adjust counts by hand.
 */
/**
 * Joel (17 Sept): scan, choose how many turned up, then confirm. The chosen
 * number is the party's total in so far (absolute, 1..booked). Without a
 * choice, the old behaviour: the whole party, or the rest of it.
 */
export function scanArrivalPlanWithCount(
  input: { booked: number; arrivedAt: string | null; arrivedPax: number | null },
  chosen: number | null | undefined,
): ScanArrivalPlan | { kind: "invalid"; message: string } {
  if (chosen == null || chosen === undefined || Number.isNaN(Number(chosen))) return scanArrivalPlan(input);
  const booked = Math.max(0, Math.trunc(Number(input.booked) || 0));
  const n = Math.trunc(Number(chosen));
  if (n < 1 || n > booked) return { kind: "invalid", message: `Choose between 1 and ${booked}.` };
  if (!input.arrivedAt) return { kind: "first", arrivedPax: n };
  const arrived = Math.max(0, Math.trunc(Number(input.arrivedPax ?? booked)));
  if (n <= arrived) return { kind: "already_in" };
  return { kind: "complete_party", arrivedPax: n, remaining: n - arrived };
}

export function scanArrivalPlan(input: { booked: number; arrivedAt: string | null; arrivedPax: number | null }): ScanArrivalPlan {
  const booked = Math.max(0, Math.trunc(Number(input.booked) || 0));
  if (!input.arrivedAt) return { kind: "first", arrivedPax: booked };
  const arrived = Math.max(0, Math.trunc(Number(input.arrivedPax ?? booked)));
  if (arrived < booked) return { kind: "complete_party", arrivedPax: booked, remaining: booked - arrived };
  return { kind: "already_in" };
}
