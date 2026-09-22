/**
 * Partner cancellation requests (Joel, 17 Sept 2026): a partner can ask to cancel
 * from their booking link up to the day before the show, GetYourGuide-style.
 * The office approves or declines; an approved cancellation is either written
 * off (nothing invoiced) or charged (still invoiced in full).
 */

export type CancellationRequestStatus = "pending" | "approved" | "denied";
export type CancellationCharge = "charge" | "write_off";

export type CancellationRow = {
  show_date: string;
  cancelled_at?: string | null;
  invoice_id?: string | null;
  cancel_requested_at?: string | null;
  cancel_request_status?: string | null;
  cancel_request_reply?: string | null;
  cancel_charge?: string | null;
};

/** Today's date in the office's time zone, as YYYY-MM-DD. */
export function showOpsTodayIso(now: Date = new Date(), timeZone = "Atlantic/Canary"): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * Can this partner still request a cancellation? The cut-off is the day before
 * the show: on the show day itself (or after) they ring the office.
 */
export function cancellationRequestWindow(
  row: CancellationRow,
  today: string,
): { allowed: true } | { allowed: false; reason: string } {
  if (row.cancelled_at) return { allowed: false, reason: "Already cancelled." };
  if (row.invoice_id) return { allowed: false, reason: "Already invoiced — contact the office." };
  if (row.cancel_request_status === "pending") return { allowed: false, reason: "Request already sent — waiting for the office." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.show_date)) return { allowed: false, reason: "Show date missing." };
  if (row.show_date <= today) {
    return { allowed: false, reason: "Too late to cancel online — cancellations close the day before the show. Ring the office." };
  }
  return { allowed: true };
}

/** One-line status a partner sees against a booking on their link page. */
export function partnerCancellationStatus(row: CancellationRow): { label: string; tone: "muted" | "pending" | "denied" | "cancelled" } | null {
  if (row.cancelled_at) {
    if (row.cancel_charge === "charge") return { label: "Cancelled — charged in full", tone: "cancelled" };
    return { label: "Cancelled", tone: "cancelled" };
  }
  if (row.cancel_request_status === "pending") return { label: "Cancellation requested — waiting for the office", tone: "pending" };
  if (row.cancel_request_status === "denied") {
    return { label: `Cancellation declined${row.cancel_request_reply ? ` — ${row.cancel_request_reply}` : ""}`, tone: "denied" };
  }
  return null;
}

/** Default approve choice: charge unless the partner's no-show policy says write off. */
export function defaultCancellationCharge(partnerPolicy: string | null | undefined, showDate: string, today: string): CancellationCharge {
  // Inside the cut-off (show is tomorrow or later) a cancellation is free.
  if (showDate > today) return "write_off";
  return partnerPolicy === "write_off" ? "write_off" : "charge";
}

/** Invoice line note for a cancelled booking that is still billed. */
export function cancelledChargeNote(row: CancellationRow): string | null {
  if (row.cancelled_at && row.cancel_charge === "charge") return "Cancelled late — charged in full";
  return null;
}
