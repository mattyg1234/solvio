import { NextResponse } from "next/server";

import { requireShowOpsAction } from "@/lib/show-ops/access";
import { buildBookingSheet } from "@/lib/show-ops/booking-sheet";
import { loadSheetLookups } from "@/lib/show-ops/booking-sheet-data";

export const dynamic = "force-dynamic";

/** The blank paper bookings sheet, with today's partners, shows, hotels and stops as dropdowns. */
export async function GET() {
  let ctx;
  try {
    ctx = await requireShowOpsAction("booker", "bookings");
  } catch (e) {
    return new NextResponse(e instanceof Error ? e.message : "Not allowed", { status: 403 });
  }
  const lookups = await loadSheetLookups(ctx.supabase as never, ctx.business.id);
  const bytes = await buildBookingSheet(lookups, { businessName: ctx.branding.displayName });
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="paper-bookings-sheet-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
