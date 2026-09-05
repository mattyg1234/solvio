"use server";
import { revalidatePath } from "next/cache";
import { requireShowOpsRole } from "@/lib/show-ops/access";
import { parseTicketTypeFields } from "@/lib/show-ops/ticket-types";
export async function saveTicketTypeAction(fd: FormData): Promise<void> {
  const ctx = await requireShowOpsRole("admin");
  const productId = String(fd.get("product_id") ?? "");
  const id = String(fd.get("id") ?? "");
  const fields = parseTicketTypeFields(fd);
  const { data: product } = await ctx.supabase
    .from("show_products")
    .select("id")
    .eq("id", productId)
    .eq("business_id", ctx.business.id)
    .maybeSingle();
  if (!product) throw new Error("Show not found.");
  const query = id
    ? ctx.supabase
        .from("show_ticket_types")
        .update(fields)
        .eq("id", id)
        .eq("product_id", productId)
        .eq("business_id", ctx.business.id)
    : ctx.supabase
        .from("show_ticket_types")
        .insert({
          ...fields,
          product_id: productId,
          business_id: ctx.business.id,
        });
  const { data, error } = await query.select("id");
  if (error || !data?.length)
    throw new Error(
      "Could not save the ticket type. Check your access and try again.",
    );
  revalidatePath("/dashboard/show-ops/master");
  revalidatePath("/partner/new");
  revalidatePath("/dashboard/show-ops/bookings");
}
export async function archiveTicketTypeAction(fd: FormData): Promise<void> {
  const ctx = await requireShowOpsRole("admin");
  const { data, error } = await ctx.supabase
    .from("show_ticket_types")
    .update({ active: false })
    .eq("id", String(fd.get("id") ?? ""))
    .eq("product_id", String(fd.get("product_id") ?? ""))
    .eq("business_id", ctx.business.id)
    .select("id");
  if (error || !data?.length)
    throw new Error("Could not archive this ticket type.");
  revalidatePath("/dashboard/show-ops/master");
  revalidatePath("/partner/new");
  revalidatePath("/dashboard/show-ops/bookings");
}
