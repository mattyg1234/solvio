import type { SupabaseClient } from "@supabase/supabase-js";
import { buildInvoicePdf, invoicePdfFilename } from "./invoice-pdf";

/** Same stored invoice + attachment bundle for download and email. Uses the caller's authenticated client. */
export async function loadInvoiceDelivery(supabase: SupabaseClient, businessId: string, invoiceId: string) {
  const { data: invoice, error: invoiceError } = await supabase.from("show_invoices")
    .select("*").eq("id", invoiceId).eq("business_id", businessId).maybeSingle();
  if (invoiceError) throw new Error("Could not load invoice. Nothing was sent.");
  if (!invoice) throw new Error("Invoice not found in this workspace.");
  if (invoice.status !== "issued" || invoice.voided) throw new Error("Only issued, non-voided invoices can be downloaded or emailed.");
  if (!invoice.invoice_number && !invoice.verifactu_number) throw new Error("Invoice has no issued number.");

  const { data: lines, count, error: linesError } = await supabase.from("show_invoice_lines")
    .select("*", { count: "exact" }).eq("invoice_id", invoiceId).eq("business_id", businessId)
    .order("guest_name").order("id").range(0, 1999);
  if (linesError || !lines?.length) throw new Error("Could not load invoice lines. Nothing was sent.");
  if (count !== lines.length) throw new Error("Invoice has too many lines for one attachment. Split the invoice pack.");
  const ids = [...new Set(lines.map((line) => line.booking_id as string | null).filter((id): id is string => !!id))];
  const bookings: Array<{ id: string; show_date: string; booking_ref: string; guest_name: string }> = [];
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const { data, error } = await supabase.from("show_bookings")
      .select("id,show_date,booking_ref,guest_name").eq("business_id", businessId).in("id", batch);
    if (error || !data || data.length !== batch.length) throw new Error("Could not load every invoice booking date. Nothing was sent.");
    bookings.push(...data);
  }
  const dateByBooking = new Map(bookings.map((b) => [b.id, b.show_date]));
  const datedLines = lines.map((line) => ({ ...line, show_date: dateByBooking.get(line.booking_id) || invoice.invoice_date }));
  const bytes = await buildInvoicePdf({ invoice, lines: datedLines });
  return { invoice, lines: datedLines, bytes, filename: invoicePdfFilename(invoice.invoice_number || invoice.verifactu_number) };
}
