import type { ShowOpsContext } from "@/lib/show-ops/access";

import { loadEmail } from "./data";
import {
  bookingDraftFromEmail,
  type CatalogChannelProduct,
  type CatalogHotel,
  type CatalogProduct,
  type CatalogSupplier,
  type EmailBookingDraft,
} from "./mapping";
import type { InboundEmailRow } from "./types";

export type EmailFormDraft = { email: InboundEmailRow; draft: EmailBookingDraft; inbox: string | null };

/**
 * For /bookings/new?email=<id>: the email and the booking form defaults read from it, mapped onto
 * the catalogue the form already loaded. Null when the id isn't an email this person can see.
 */
export async function loadEmailFormDraft(
  ctx: ShowOpsContext,
  emailId: string,
  catalog: { products: unknown[]; suppliers: unknown[]; hotels: unknown[] },
): Promise<EmailFormDraft | null> {
  const email = await loadEmail(ctx.supabase, ctx.business.id, emailId);
  if (!email) return null;
  const products = catalog.products as CatalogProduct[];

  const [{ data: inboxRow }, { data: mappings }] = await Promise.all([
    ctx.supabase.from("show_email_booking_connections").select("address").eq("business_id", ctx.business.id).maybeSingle(),
    ctx.supabase.from("show_channel_products").select("product_id,supplier_id,ticket_type_id,pickup_kind,active").eq("business_id", ctx.business.id).eq("channel", "getyourguide"),
  ]);
  const islandOf = new Map(products.map((p) => [p.id, p.island]));
  const channelProducts: CatalogChannelProduct[] = ((mappings ?? []) as Omit<CatalogChannelProduct, "island">[]).map((m) => ({
    ...m,
    island: islandOf.get(m.product_id) ?? null,
  }));
  const inbox = inboxRow?.address ? String(inboxRow.address) : null;

  const draft = bookingDraftFromEmail({
    extracted: email.extracted,
    sellerKey: email.seller_key,
    sellerName: email.seller_name,
    subject: email.subject,
    body: email.body,
    inbox,
    islands: ctx.config.islands,
    products,
    suppliers: catalog.suppliers as CatalogSupplier[],
    hotels: catalog.hotels as CatalogHotel[],
    channelProducts,
  });
  return { email, draft, inbox };
}
