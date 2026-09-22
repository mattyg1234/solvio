import { requireShowOpsEnabled } from "@/lib/show-ops/access";
import { hasShowOpsModule } from "@/lib/show-ops/config";
import { canSeeShowOpsPage } from "@/lib/show-ops/nav";
import { loadNightListPdf, parseNightListPdfRequest } from "@/lib/show-ops/night-list-pdf-data";

export const runtime = "nodejs";
const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

/** The printed night list (office, door or special meals) for the bookings the page shows, in the page's order. Opens inline for printing. */
export async function POST(request: Request) {
  const ctx = await requireShowOpsEnabled();
  if (!canSeeShowOpsPage(ctx.role, ctx.allowedPages, "lists") || !hasShowOpsModule(ctx.config, ctx.tier, "lists")) {
    return new Response("Night list access is required.", { status: 403, headers: privateHeaders });
  }
  try {
    const raw = await request.text();
    if (raw.length > 260000) throw new Error("This list is too large. Filter by island first.");
    const req = parseNightListPdfRequest(JSON.parse(raw));
    const { data: me } = await ctx.supabase.from("profiles").select("full_name,email").eq("id", ctx.user.id).maybeSingle();
    const printedBy = (me?.full_name && String(me.full_name).trim()) || String(me?.email ?? ctx.user.email ?? "office").split("@")[0];
    const bytes = await loadNightListPdf(
      ctx.supabase,
      { businessId: ctx.business.id, businessName: ctx.branding.displayName, config: ctx.config, printedBy },
      req,
    );
    return new Response(Buffer.from(bytes), {
      headers: { ...privateHeaders, "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${req.view}-list-${req.date}.pdf"` },
    });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Could not prepare this list.", { status: 400, headers: privateHeaders });
  }
}
