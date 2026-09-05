import { loadInvoicePhotos } from "./invoice-photos";

export type PartnerTicketBooking = { id: string; business_id: string; supplier_id: string | null; created_by: string | null; cancelled_at: string | null; booking_ref: string; guest_name: string; no_show_proof_path: string | null };

export function assertOwnTicketBooking(
  ctx: { businessId: string; supplierId: string; userId: string },
  row: { business_id: string; supplier_id: string | null; created_by: string | null; cancelled_at: string | null } | null,
): void {
  if (!row || row.business_id !== ctx.businessId || row.supplier_id !== ctx.supplierId || row.created_by !== ctx.userId) {
    throw new Error("You can only attach a ticket photo to your own booking.");
  }
  if (row.cancelled_at) throw new Error("This booking is cancelled.");
}

export async function validatePartnerTicketPhoto(file: File): Promise<{ extension: string; bytes: Buffer }> {
  const extensions: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif" };
  const extension = extensions[file.type];
  if (!extension) throw new Error("Use a JPEG, PNG, WebP or HEIC/HEIF photo.");
  if (!file.size || file.size > 3 * 1024 * 1024) throw new Error("Choose a photo up to 3 MB.");
  // Use exactly the invoice attachment validator so accepted originals can be delivered with the invoice.
  await loadInvoicePhotos({ from: () => ({ download: async () => ({ data: file, error: null }) }) }, "business", "supplier", [{
    id: "booking", business_id: "business", supplier_id: "supplier", booking_ref: "ticket", guest_name: "Guest",
    no_show_proof_path: `business/booking/ticket.${extension}`,
  }]);
  return { extension, bytes: Buffer.from(await file.arrayBuffer()) };
}
