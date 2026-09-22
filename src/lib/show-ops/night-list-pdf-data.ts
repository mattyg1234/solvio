import type { SupabaseClient } from "@supabase/supabase-js";

import { formatShowOpsDoorTime, formatShowOpsMoney, showOpsBookingPayView } from "@/lib/show-ops/calc";
import { showOpsCurrencyFor } from "@/lib/show-ops/config";
import type { ShowOpsConfig } from "@/lib/show-ops/types";
import { buildNightListPdf, type NightListPdfRow, type NightListPdfView } from "@/lib/show-ops/night-list-pdf";
import { pickupKindFromBooking, privateTransferLine } from "@/lib/show-ops/private-pickup";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type NightListPdfRequest = {
  date: string;
  view: NightListPdfView;
  island: string | null;
  showName: string | null;
  bookingIds: string[];
};

export function parseNightListPdfRequest(value: unknown): NightListPdfRequest {
  if (!value || typeof value !== "object") throw new Error("Choose a list to print.");
  const v = value as Record<string, unknown>;
  const date = typeof v.date === "string" ? v.date : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Choose a valid show date.");
  const view = v.view === "door" || v.view === "meals" ? v.view : "office";
  const ids = Array.isArray(v.bookingIds) ? v.bookingIds : [];
  if (ids.length > 5000 || new Set(ids).size !== ids.length || ids.some((id) => typeof id !== "string" || !UUID_RE.test(id))) {
    throw new Error("Choose up to 5,000 distinct bookings. Filter by island for a smaller list.");
  }
  return {
    date,
    view,
    island: typeof v.island === "string" && v.island.trim() ? v.island.trim().slice(0, 60) : null,
    showName: typeof v.showName === "string" && v.showName.trim() ? v.showName.trim().slice(0, 80) : null,
    bookingIds: ids as string[],
  };
}

/** Lanzasoft stored a bare "Yes" in the diet field with the detail in the comments; the sheet still says something. */
function dietText(required: boolean | null | undefined, notes: string | null | undefined): string | null {
  if (!required) return null;
  const t = (notes ?? "").trim();
  return !t || /^(yes|y|si|sí|true)$/i.test(t) ? "Special meal (see comments)" : t;
}

/**
 * Load the ticked bookings for one night and lay them out as the printed list.
 * The caller's session decides what it can see; a booking that moved or was
 * cancelled since the page loaded fails the print rather than printing short.
 */
export async function loadNightListPdf(
  client: SupabaseClient,
  opts: { businessId: string; businessName: string; config: ShowOpsConfig; printedBy: string },
  req: NightListPdfRequest,
): Promise<Uint8Array> {
  type Row = {
    id: string; booking_ref: string; guest_name: string; guest_mobile: string | null; show_name: string; island: string;
    hotel_name: string | null; supplier_name: string | null; supplier_ticket_number: string | null;
    adults: number; children: number; infants: number; transport_required: boolean; pickup_kind: string | null;
    pickup_stop_name: string | null; pickup_time: string | null; private_zone: string | null;
    dietary_required: boolean; dietary_notes: string | null; office_comments: string | null;
    billing_mode: string; payment_status: string; total_cost: number; balance_remaining: number; nett_total: number | null;
    cancelled_at: string | null; arrived_at: string | null; no_show: boolean | null;
  };
  const rows: Row[] = [];
  for (let offset = 0; offset < req.bookingIds.length; offset += 200) {
    const { data, error } = await client
      .from("show_bookings")
      .select(
        "id,booking_ref,guest_name,guest_mobile,show_name,island,hotel_name,supplier_name,supplier_ticket_number,adults,children,infants,transport_required,pickup_kind,pickup_stop_name,pickup_time,private_zone,dietary_required,dietary_notes,office_comments,billing_mode,payment_status,total_cost,balance_remaining,nett_total,cancelled_at,arrived_at,no_show",
      )
      .eq("business_id", opts.businessId)
      .eq("show_date", req.date)
      .is("cancelled_at", null)
      .in("id", req.bookingIds.slice(offset, offset + 200));
    if (error) throw new Error("Could not load this night list. Please try again.");
    rows.push(...((data ?? []) as Row[]));
  }
  if (rows.length !== req.bookingIds.length) {
    throw new Error("This list has changed or your access has changed. Reload it before printing.");
  }
  // Keep the order the page showed (its sort), not the database's.
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = req.bookingIds.map((id) => byId.get(id)!);

  const pdfRows: NightListPdfRow[] = ordered.map((b) => {
    const currency = showOpsCurrencyFor(opts.config, b.island);
    const money = (n: number) => formatShowOpsMoney(n, currency).replace(/^[^0-9-]+/, "");
    const pay = showOpsBookingPayView({
      billingMode: b.billing_mode, totalCost: b.total_cost, balanceRemaining: b.balance_remaining,
      nettTotal: b.nett_total, paymentStatus: b.payment_status, cancelledAt: b.cancelled_at,
    });
    const paid = pay.paidAmount ?? 0;
    const owed = pay.outstandingAmount ?? 0;
    const details: string[] = [];
    if (b.office_comments?.trim()) details.push(b.office_comments.trim());
    if (b.transport_required) {
      details.push(`Bus${b.pickup_stop_name ? ` · ${b.pickup_stop_name}` : ""}${b.pickup_time ? ` ${String(b.pickup_time).slice(0, 5)}` : ""}`);
    } else if (pickupKindFromBooking(b) === "private") {
      details.push(privateTransferLine(b.private_zone));
    }
    if (b.supplier_ticket_number?.trim()) details.push(`Tkt ${b.supplier_ticket_number.trim()}`);
    if (b.guest_mobile?.trim()) details.push(b.guest_mobile.trim());
    const door = b.no_show ? "no show" : b.arrived_at ? formatShowOpsDoorTime(b.arrived_at) : "";
    return {
      booking_ref: b.booking_ref,
      guest_name: b.guest_name,
      adults: Number(b.adults) || 0,
      children: Number(b.children) || 0,
      infants: Number(b.infants) || 0,
      show_name: b.show_name,
      supplier_name: b.supplier_name,
      hotel_name: b.hotel_name,
      details,
      dietary: dietText(b.dietary_required, b.dietary_notes),
      total: b.billing_mode === "invoice" ? "inv" : money(Number(b.total_cost) || 0),
      paid: b.billing_mode === "invoice" ? "" : money(paid),
      owed: b.billing_mode === "invoice" ? "" : money(owed),
      door,
    };
  });

  return buildNightListPdf({
    view: req.view,
    businessName: opts.businessName,
    date: req.date,
    island: req.island,
    showName: req.showName,
    printedBy: opts.printedBy,
    rows: pdfRows,
  });
}
