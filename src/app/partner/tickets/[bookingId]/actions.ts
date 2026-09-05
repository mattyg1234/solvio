"use server";

import { revalidatePath } from "next/cache";
import { requireShowOpsSellerContext } from "@/lib/show-ops/access";
import { assertOwnTicketBooking, validatePartnerTicketPhoto, type PartnerTicketBooking } from "@/lib/show-ops/partner-ticket-photo";

export async function uploadPartnerTicketPhoto(formData: FormData): Promise<{ ok: boolean; message: string }> {
  try {
    const ctx = await requireShowOpsSellerContext();
    const bookingId = String(formData.get("booking_id") ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(bookingId)) return { ok: false, message: "Booking required." };
    const { data: booking, error } = await ctx.supabase.rpc("show_ops_seller_ticket_booking", { p_booking: bookingId }).returns<PartnerTicketBooking[]>().maybeSingle();
    if (error) throw new Error("Could not check this booking. Please retry.");
    assertOwnTicketBooking({ businessId: ctx.business.id, supplierId: ctx.supplier.id, userId: ctx.user.id }, booking);
    const file = formData.get("photo");
    if (!(file instanceof File)) return { ok: false, message: "Choose a ticket photo." };
    const { extension, bytes } = await validatePartnerTicketPhoto(file);
    const path = `${ctx.business.id}/${bookingId}/${crypto.randomUUID()}.${extension}`;
    const bucket = ctx.supabase.storage.from("show-ops-proofs");
    const { error: uploadError } = await bucket.upload(path, bytes, { contentType: file.type, upsert: false });
    if (uploadError) throw new Error("Photo upload failed. Please retry.");
    const { error: attachError } = await ctx.supabase.rpc("show_ops_attach_seller_ticket", { p_booking: bookingId, p_path: path });
    if (attachError) {
      throw new Error("Photo could not be attached. Refresh the booking and try again.");
    }
    revalidatePath(`/partner/tickets/${bookingId}`);
    revalidatePath("/partner");
    revalidatePath("/dashboard/show-ops/invoices");
    return { ok: true, message: "Ticket photo attached. The original photo is available for the invoice." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Photo could not be attached. Please retry." };
  }
}
