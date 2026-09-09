import { NextRequest, NextResponse } from "next/server";

import { loadReportRows, ReportLoadError } from "@/lib/show-ops/report-data";
import { resolveShowOpsBusinessId } from "@/lib/show-ops/resolve-business";
import { formatShowOpsPax, showOpsArrivalMark, showOpsBookingPayView } from "@/lib/show-ops/calc";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function csvCell(v: unknown) {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
}

function sanitizeSearch(q: string): string {
  return q.replace(/[%_,()]/g, "").trim();
}

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const business = await resolveShowOpsBusinessId(supabase, user.id);
  if (!business?.show_ops_enabled) {
    return NextResponse.json({ error: "Show Ops not enabled" }, { status: 403 });
  }

  const sp = request.nextUrl.searchParams;
  const q = sanitizeSearch(sp.get("q") || "");
  const island = sp.get("island") || "";
  const date = sp.get("date") || "";
  const from = sp.get("from") || "";
  const to = sp.get("to") || "";
  const pay = sp.get("pay") || "";
  const show = sp.get("show") || "";
  const includeCancelled = sp.get("include_cancelled") === "1" || pay === "cancelled";

  const result = await loadReportRows("booking export", (offset, limit) => {
    let query = supabase
      .from("show_bookings")
      .select(
        "booking_ref,guest_name,show_name,island,show_date,hotel_name,pickup_stop_name,pickup_time,supplier_name,adults,children,infants,arrived_pax,arrived_at,no_show,total_cost,balance_remaining,nett_total,payment_status,billing_mode,payment_method,cancelled_at,created_at",
      )
      .eq("business_id", business.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + limit - 1);

    if (!includeCancelled) query = query.is("cancelled_at", null);
    if (pay === "cancelled") query = query.not("cancelled_at", "is", null);
    if (pay === "invoice") query = query.eq("billing_mode", "invoice");
    if (pay === "unpaid" || pay === "partial" || pay === "paid") {
      query = query.eq("billing_mode", "deposit").eq("payment_status", pay);
    }
    if (island) query = query.eq("island", island);
    if (date) query = query.eq("show_date", date);
    if (from) query = query.gte("show_date", from);
    if (to) query = query.lte("show_date", to);
    if (show) query = query.eq("show_name", show);
    if (q) {
      query = query.or(
        `booking_ref.ilike.%${q}%,guest_name.ilike.%${q}%,show_name.ilike.%${q}%,supplier_name.ilike.%${q}%,hotel_name.ilike.%${q}%`,
      );
    }
    return query;
  }).catch((error: unknown) => ({ data: null, error }));
  if (!result.data) {
    const message = result.error instanceof ReportLoadError ? result.error.message : "Could not load booking export. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
  const data = result.data;

  const header = [
    "booking_ref",
    "guest_name",
    "show_name",
    "island",
    "show_date",
    "hotel_name",
    "pickup",
    "supplier_name",
    "pax",
    "showed",
    "missing",
    "price",
    "paid",
    "outstanding",
    "status",
    "billing_mode",
    "payment_method",
  ];
  const lines = [header.join(",")];
  for (const row of data ?? []) {
    const payView = showOpsBookingPayView({
      billingMode: row.billing_mode,
      totalCost: Number(row.total_cost),
      balanceRemaining: Number(row.balance_remaining),
      nettTotal: row.nett_total == null ? null : Number(row.nett_total),
      paymentStatus: row.payment_status,
      cancelledAt: row.cancelled_at,
    });
    const arrival = showOpsArrivalMark({
      adults: row.adults,
      children: row.children,
      infants: row.infants,
      arrivedPax: row.arrived_pax,
      arrivedAt: row.arrived_at,
      noShow: row.no_show,
    });
    lines.push(
      [
        row.booking_ref,
        row.guest_name,
        row.show_name,
        row.island,
        row.show_date,
        row.hotel_name,
        [row.pickup_stop_name, row.pickup_time ? String(row.pickup_time).slice(0, 5) : ""].filter(Boolean).join(" · "),
        row.supplier_name,
        formatShowOpsPax(row.adults, row.children, row.infants),
        arrival.status === "pending" ? "" : String(arrival.arrived ?? ""),
        arrival.missing == null ? "" : String(arrival.missing),
        Number(row.total_cost).toFixed(2),
        payView.paidAmount == null ? "" : payView.paidAmount.toFixed(2),
        payView.outstandingAmount == null ? "" : payView.outstandingAmount.toFixed(2),
        payView.label,
        row.billing_mode,
        row.payment_method ?? "",
      ]
        .map(csvCell)
        .join(","),
    );
  }

  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="show-ops-bookings.csv"`,
    },
  });
}
