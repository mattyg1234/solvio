import { NextRequest, NextResponse } from "next/server";

import {
  dailySalesCsv,
  localDayUtcRange,
  SHOW_OPS_OFFICE_TZ,
  summariseDailySales,
  type DailySalesRow,
} from "@/lib/show-ops/daily-sales";
import { isoDateInTimeZone } from "@/lib/show-ops/digest";
import { loadReportRows, ReportLoadError } from "@/lib/show-ops/report-data";
import { resolveShowOpsBusinessId } from "@/lib/show-ops/resolve-business";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Bookings taken on one office-local day (Atlantic/Canary), summary + rows. Linked from Reports → Daily sales. */
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

  const rawDate = request.nextUrl.searchParams.get("date") || "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : isoDateInTimeZone(new Date(), SHOW_OPS_OFFICE_TZ);
  const island = request.nextUrl.searchParams.get("island") || "";
  const window = localDayUtcRange(date, SHOW_OPS_OFFICE_TZ);

  const result = await loadReportRows("daily sales export", (offset, limit) => {
    let q = supabase
      .from("show_bookings")
      .select(
        "booking_ref,guest_name,show_name,island,show_date,hotel_name,supplier_name,sales_channel,adults,children,infants,total_cost,billing_mode,created_at",
      )
      .eq("business_id", business.id)
      .gte("created_at", window.start)
      .lt("created_at", window.end)
      .is("cancelled_at", null)
      .order("created_at")
      .order("id")
      .range(offset, offset + limit - 1);
    if (island) q = q.eq("island", island);
    return q;
  }).catch((error: unknown) => ({ data: null, error }));
  if (!result.data) {
    const message = result.error instanceof ReportLoadError ? result.error.message : "Could not load daily sales export. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
  const data = result.data;

  const csv = dailySalesCsv(summariseDailySales(date, (data ?? []) as DailySalesRow[], SHOW_OPS_OFFICE_TZ));

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="daily-sales-${date}${island ? `-${island}` : ""}.csv"`,
    },
  });
}
