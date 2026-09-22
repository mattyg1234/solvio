import { partnerLinkContext } from "@/app/dashboard/show-ops/actions";
import { loadInvoiceDelivery } from "@/lib/show-ops/invoice-delivery";

export const runtime = "nodejs";
const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

/**
 * A partner downloads one of their own issued invoices from their booking link.
 * The token is the identity; only invoices raised to that partner are served.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const link = await partnerLinkContext(token);
  if (!link) return new Response("This link is no longer valid.", { status: 404, headers: privateHeaders });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Invoice not found.", { status: 404, headers: privateHeaders });
  const { ctx, supplier, admin } = link;
  const { data: invoice } = await admin
    .from("show_invoices")
    .select("id,supplier_id,status,voided")
    .eq("id", id)
    .eq("business_id", ctx.business.id)
    .maybeSingle();
  if (!invoice || invoice.supplier_id !== supplier.id) return new Response("Invoice not found.", { status: 404, headers: privateHeaders });
  if (invoice.status !== "issued" || invoice.voided) return new Response("This invoice is not available.", { status: 404, headers: privateHeaders });
  try {
    const { bytes, filename } = await loadInvoiceDelivery(admin, ctx.business.id, id, { includeEvidence: false });
    return new Response(Buffer.from(bytes), {
      headers: { ...privateHeaders, "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${filename}"` },
    });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Could not prepare this invoice.", { status: 400, headers: privateHeaders });
  }
}
