import { NextRequest, NextResponse } from "next/server";

import { resolveShowOpsBusinessId } from "@/lib/show-ops/resolve-business";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function csvCell(v: unknown) {
  const s = v == null ? "" : String(v);
  return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
}

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

  const date = request.nextUrl.searchParams.get("date") || new Date().toISOString().slice(0, 10);
  const island = request.nextUrl.searchParams.get("island") || "";

  let q = supabase
    .from("show_bookings")
    .select(
      "booking_ref,guest_name,show_name,island,show_date,hotel_name,supplier_name,sales_channel,adults,children,infants,total_cost,billing_mode,created_at",
    )
    .eq("business_id", business.id)
    .eq("show_date", date)
    .is("cancelled_at", null)
    .order("created_at");
  if (island) q = q.eq("island", island);

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data ?? [];
  const byIsland = new Map<string, number>();
  const byChannel = new Map<string, number>();
  const byHour = new Map<string, number>();
  for (const r of rows) {
    byIsland.set(r.island, (byIsland.get(r.island) || 0) + 1);
    byChannel.set(r.sales_channel, (byChannel.get(r.sales_channel) || 0) + 1);
    const hour = r.created_at
      ? new Date(r.created_at).getUTCHours().toString().padStart(2, "0") + ":00"
      : "unknown";
    byHour.set(hour, (byHour.get(hour) || 0) + 1);
  }

  const lines: string[] = [];
  lines.push("section,key,value");
  lines.push(`summary,date,${csvCell(date)}`);
  lines.push(`summary,total_bookings,${rows.length}`);
  for (const [k, v] of byIsland) lines.push(`by_island,${csvCell(k)},${v}`);
  for (const [k, v] of byChannel) lines.push(`by_channel,${csvCell(k)},${v}`);
  for (const [k, v] of [...byHour.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`by_hour_utc,${csvCell(k)},${v}`);
  }
  lines.push("");
  const header = [
    "booking_ref",
    "guest_name",
    "show_name",
    "island",
    "show_date",
    "hotel_name",
    "supplier_name",
    "sales_channel",
    "adults",
    "children",
    "infants",
    "total_cost",
    "billing_mode",
    "created_at",
  ];
  lines.push(header.join(","));
  for (const row of rows) {
    lines.push(header.map((h) => csvCell((row as Record<string, unknown>)[h])).join(","));
  }

  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="daily-sales-${date}.csv"`,
    },
  });
}
