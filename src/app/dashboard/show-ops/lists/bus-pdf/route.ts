import { loadBusListPdf } from "@/lib/show-ops/bus-pdf-data";
import { requireShowOpsEnabled } from "@/lib/show-ops/access";
import { hasShowOpsModule } from "@/lib/show-ops/config";
import { canSeeShowOpsPage } from "@/lib/show-ops/nav";
import { parseBusPdfRequest } from "@/lib/show-ops/bus-pdf";

export const runtime = "nodejs";
const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
/** A download of the visible order, re-read using the caller's session and island RLS. */
export async function POST(request: Request) {
  const ctx = await requireShowOpsEnabled();
  if (!canSeeShowOpsPage(ctx.role, ctx.allowedPages, "lists") || !hasShowOpsModule(ctx.config, ctx.tier, "lists")) return new Response("Night list access is required.", { status: 403, headers: privateHeaders });
  try {
    const raw = await request.text();
    if (raw.length > 220000) throw new Error("This list is too large. Filter by island first.");
    const { date, bookingIds } = parseBusPdfRequest(JSON.parse(raw));
    const bytes = await loadBusListPdf(ctx.supabase, ctx.business.id, ctx.branding.displayName, { date, bookingIds });
    return new Response(Buffer.from(bytes), { headers: { ...privateHeaders, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="bus-list-${date}.pdf"` } });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Could not prepare this bus list.", { status: 400, headers: privateHeaders });
  }
}
