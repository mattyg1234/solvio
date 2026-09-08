import type { SupabaseClient } from "@supabase/supabase-js";

import { round2 } from "@/lib/show-ops/calc";

/**
 * How much has actually been paid on a deposit booking.
 *
 * The ledger (show_booking_payments) is the source of truth. Bookings imported
 * from Lanzasoft arrived with a paid amount recorded on the booking itself and
 * no ledger rows; until an opening-balance row exists for them, the recorded
 * amount (total − balance) is the paid basis. Never treat an empty or failed
 * ledger read as "nothing paid" when the booking says otherwise.
 */
export type PaidBasis = {
  total_cost: number | string | null;
  balance_remaining: number | string | null;
  legacy_id?: string | number | null;
};

export function recordedPaid(b: PaidBasis): number {
  const total = Number(b.total_cost ?? 0);
  const balance = Number(b.balance_remaining ?? 0);
  if (!Number.isFinite(total) || !Number.isFinite(balance)) return 0;
  return round2(Math.max(0, total - balance));
}

export function effectivePaid(b: PaidBasis, ledgerSum: number): number {
  const ledger = round2(Math.max(0, Number(ledgerSum) || 0));
  if (ledger > 0) return ledger;
  return recordedPaid(b);
}

/** Sum of ledger rows for a booking. Throws on a failed read — a failed read must never zero a balance. */
async function readBookingLedger(client: SupabaseClient, bookingId: string) {
  const { data, error } = await client.from("show_booking_payments").select("amount,method").eq("booking_id", bookingId);
  if (error) throw new Error(`Could not read payments for this booking: ${error.message}`);
  const rows = data ?? [];
  if (rows.some((p) => p.amount == null || !Number.isFinite(Number(p.amount)))) {
    throw new Error("Invalid payment amount in this booking's ledger. Reconcile it before continuing.");
  }
  return { rows, total: round2(rows.reduce((s, p) => s + Number(p.amount), 0)) };
}

export async function sumBookingLedger(client: SupabaseClient, bookingId: string): Promise<number> {
  return (await readBookingLedger(client, bookingId)).total;
}

/** Ledger sum plus the imported opening basis, in one call. */
export async function paidOnBooking(client: SupabaseClient, booking: PaidBasis & { id: string }): Promise<number> {
  const ledger = await readBookingLedger(client, booking.id);
  if (booking.legacy_id != null && ledger.rows.length && !ledger.rows.some((p) => p.method === "import")) {
    throw new Error("This imported booking's opening balance needs reconciliation before continuing.");
  }
  // Once a ledger exists, it includes the opening receipt (including a zero
  // opening). Never substitute a stale booking summary for a zero ledger total.
  return ledger.rows.length ? ledger.total : recordedPaid(booking);
}
