"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireGlobalShowOpsAdmin } from "@/lib/show-ops/access";

function back(param: string, value: string): never {
  revalidatePath("/dashboard/show-ops/settings");
  redirect(`/dashboard/show-ops/settings?${param}=${encodeURIComponent(value)}#channels`);
}

/** Map a GetYourGuide product id to a show + the partner it books under. Admin only. */
export async function saveChannelProductAction(formData: FormData): Promise<void> {
  const ctx = await requireGlobalShowOpsAdmin();
  const externalId = String(formData.get("external_product_id") ?? "").trim();
  const productId = String(formData.get("product_id") ?? "").trim();
  const supplierId = String(formData.get("supplier_id") ?? "").trim();
  const ticketTypeId = String(formData.get("ticket_type_id") ?? "").trim() || null;
  const pickupKind = String(formData.get("pickup_kind") ?? "own_way") === "private" ? "private" : "own_way";
  const cutoff = Math.max(0, Math.trunc(Number(formData.get("cutoff_minutes") ?? 120) || 0));
  const availabilityType = String(formData.get("availability_type") ?? "time_point") === "time_period" ? "time_period" : "time_point";
  const pricingType = String(formData.get("pricing_type") ?? "individual") === "group" ? "group" : "individual";
  const groupSizeRaw = Math.trunc(Number(formData.get("group_size") ?? 0) || 0);
  const groupSize = pricingType === "group" ? groupSizeRaw : null;
  const periodMinutes = Math.min(1440, Math.max(15, Math.trunc(Number(formData.get("period_minutes") ?? 180) || 180)));
  if (pricingType === "group" && (!groupSize || groupSize < 1 || groupSize > 200)) back("channel_error", "Group products need a group size between 1 and 200 people.");
  if (!externalId || externalId.length > 255 || externalId.includes("%")) back("channel_error", "GetYourGuide product id is required, up to 255 characters, no % sign.");
  if (!productId || !supplierId) back("channel_error", "Pick the show and the GetYourGuide partner it books under.");

  const [{ data: product }, { data: supplier }] = await Promise.all([
    ctx.supabase.from("show_products").select("id").eq("id", productId).eq("business_id", ctx.business.id).maybeSingle(),
    ctx.supabase.from("show_suppliers").select("id,booking_token").eq("id", supplierId).eq("business_id", ctx.business.id).maybeSingle(),
  ]);
  if (!product || !supplier) back("channel_error", "Show or partner not found in this workspace.");
  if (!supplier?.booking_token) back("channel_error", "That partner has no booking link token; open Partners and it will be created.");

  const id = String(formData.get("id") ?? "").trim();
  const row = {
    business_id: ctx.business.id,
    channel: "getyourguide",
    external_product_id: externalId,
    product_id: productId,
    supplier_id: supplierId,
    ticket_type_id: ticketTypeId,
    pickup_kind: pickupKind,
    cutoff_minutes: cutoff,
    availability_type: availabilityType,
    pricing_type: pricingType,
    group_size: groupSize,
    period_minutes: periodMinutes,
    active: String(formData.get("active") ?? "1") !== "0",
    notes: String(formData.get("notes") ?? "").trim().slice(0, 300) || null,
    updated_at: new Date().toISOString(),
  };
  const { error } = id
    ? await ctx.supabase.from("show_channel_products").update(row).eq("id", id).eq("business_id", ctx.business.id)
    : await ctx.supabase.from("show_channel_products").insert(row);
  if (error) back("channel_error", /duplicate|unique/i.test(error.message) ? "That GetYourGuide product id is already mapped." : error.message);
  back("channel", "saved");
}

export async function deleteChannelProductAction(formData: FormData): Promise<void> {
  const ctx = await requireGlobalShowOpsAdmin();
  const id = String(formData.get("id") ?? "").trim();
  const { error } = await ctx.supabase.from("show_channel_products").delete().eq("id", id).eq("business_id", ctx.business.id);
  if (error) back("channel_error", error.message);
  back("channel", "deleted");
}
