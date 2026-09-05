import { requireShowOpsRole } from "@/lib/show-ops/access";
import { hasShowOpsModule } from "@/lib/show-ops/config";
import { loadInvoiceDelivery } from "@/lib/show-ops/invoice-delivery";
import { canSeeShowOpsPage } from "@/lib/show-ops/nav";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireShowOpsRole("finance");
  if (!canSeeShowOpsPage(ctx.role, ctx.allowedPages, "invoices") || !hasShowOpsModule(ctx.config, ctx.tier, "invoices")) {
    return new Response("Invoice access is required.", { status: 403 });
  }
  const { id } = await params;
  try {
    const { bytes, filename } = await loadInvoiceDelivery(ctx.supabase, ctx.business.id, id, { includeEvidence: false });
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Could not prepare invoice PDF.", {
      status: 400, headers: { "Cache-Control": "private, no-store" },
    });
  }
}
