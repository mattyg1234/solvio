import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchLogoForPdf } from "@/lib/business-logo";
import { brandingFromBusiness, parseShowOpsConfig } from "./config";
import { buildInvoicePdf, invoicePdfFilename, type InvoicePdfBranding } from "./invoice-pdf";
import { loadInvoicePhotos, MAX_INVOICE_DELIVERY_BYTES, type InvoicePhotoBooking } from "./invoice-photos";
import { invoiceDeliveryFingerprint } from "./invoice-delivery-fingerprint";

/**
 * Logo, accent colour, tax label and footer for the PDF come from the business row,
 * not the invoice, so a rebrand shows on every download without reissuing invoices.
 * Returns a warning instead of failing when the logo cannot be embedded.
 */
export async function loadInvoicePdfBranding(supabase: SupabaseClient, businessId: string): Promise<{ branding: InvoicePdfBranding; logoWarning: string | null }> {
  const { data: business, error } = await supabase.from("businesses")
    .select("name,logo_url,show_ops_logo_url,show_ops_display_name,show_ops_primary_color,show_ops_accent_color,show_ops_config")
    .eq("id", businessId).maybeSingle();
  if (error || !business) throw new Error("Could not load business branding for the invoice PDF.");
  const brand = brandingFromBusiness(business);
  const config = parseShowOpsConfig(business.show_ops_config);
  const fetched = await fetchLogoForPdf(brand.logoUrl);
  return {
    branding: {
      logo: fetched.logo,
      accentColor: brand.primaryColor,
      taxLabel: config.invoice.taxLabel,
      footerNote: config.invoice.footerNote,
      thankYouName: config.invoice.thankYouName || brand.displayName,
    },
    logoWarning: fetched.logo ? null : fetched.warning,
  };
}

/** Same stored invoice + attachment bundle for download and email. Uses the caller's authenticated client. */
export async function loadInvoiceDelivery(supabase: SupabaseClient, businessId: string, invoiceId: string, options: { includeEvidence?: boolean } = {}) {
  const includeEvidence = options.includeEvidence !== false;
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
  const bookings: Array<InvoicePhotoBooking & { show_date: string }> = [];
  if (includeEvidence && ids.length && !invoice.supplier_id) throw new Error("Invoice bookings have no seller association. Review the invoice before sending.");
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    let query = supabase.from("show_bookings")
      .select("id,business_id,supplier_id,show_date,booking_ref,guest_name,no_show_proof_path").eq("business_id", businessId).in("id", batch);
    if (includeEvidence) query = query.eq("supplier_id", invoice.supplier_id);
    const { data, error } = await query;
    if (error || !data || data.length !== batch.length) throw new Error("Could not load every invoice booking date. Nothing was sent.");
    bookings.push(...data);
  }
  bookings.sort((a, b) => a.id.localeCompare(b.id));
  const dateByBooking = new Map(bookings.map((b) => [b.id, b.show_date]));
  const datedLines = lines.map((line) => ({ ...line, show_date: dateByBooking.get(line.booking_id) || invoice.invoice_date }));
  const { branding, logoWarning } = await loadInvoicePdfBranding(supabase, businessId);
  const bytes = await buildInvoicePdf({ invoice, lines: datedLines, branding });
  const evidence = includeEvidence ? await loadInvoicePhotos(supabase.storage, businessId, invoice.supplier_id, bookings) : { photos: [], missing: [], totalBytes: 0 };
  if (bytes.length + evidence.totalBytes > MAX_INVOICE_DELIVERY_BYTES) throw new Error("Invoice and ticket photos exceed the email attachment limit. Split the invoice pack.");
  const evidenceFingerprint = invoiceDeliveryFingerprint(invoice, datedLines, { photos: evidence.photos.map(({ bookingId, path, sha256 }) => ({ bookingId, path, sha256 })), missing: evidence.missing });
  return { invoice, lines: datedLines, bytes, evidence, evidenceFingerprint, logoWarning, filename: invoicePdfFilename(invoice.invoice_number || invoice.verifactu_number) };
}
