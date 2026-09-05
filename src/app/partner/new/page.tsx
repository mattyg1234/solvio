import { loadDirectoryHotels, loadDirectoryStops } from "@/lib/show-ops/directory-data";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { createSellerBookingAction } from "@/app/dashboard/show-ops/actions";
import { ShowOpsBookingForm } from "@/components/show-ops/booking-form";
import { requireShowOpsSellerContext } from "@/lib/show-ops/access";
import { withBookedDates } from "@/lib/show-ops/nights";

export default async function PartnerNewBookingPage() {
  const ctx = await requireShowOpsSellerContext();
  const biz = ctx.business.id;

  const [
    { data: products, error: productsError },
    { data: hotels },
    { data: stops },
    bookedDatesResult,
  ] = await Promise.all([
    ctx.supabase
      .from("show_products")
      .select(
        "id,name,island,adult_price,child_price,infant_price,adult_price_no_transport,child_price_no_transport,infant_price_no_transport,adult_nett,child_nett,transport_available,run_weekdays,show_time,show_ticket_types(*),show_extras(*)",
      )
      .eq("business_id", biz)
      .eq("active", true)
      .order("name"),
    loadDirectoryHotels(ctx.supabase, biz, true),
    loadDirectoryStops(ctx.supabase, biz, true),
    ctx.supabase.rpc("show_ops_partner_booked_dates", { p_business_id: biz }),
  ]);

  if (productsError)
    throw new Error(
      "Could not load shows, ticket types and extras. Please try again.",
    );

  if (bookedDatesResult.error)
    throw new Error("Could not load available show dates. Please try again.");
  const bookedDates = (bookedDatesResult.data ?? {}) as Record<
    string,
    string[]
  >;

  return (
    <div className="space-y-4">
      <Link
        href="/partner"
        className="inline-flex items-center gap-1.5 text-sm font-semibold"
        style={{ color: "var(--show-ops-primary,#7c3aed)" }}
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to bookings
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          New booking <span className="text-slate-400">· Partner view</span>
        </h1>
        <p className="text-sm text-slate-600">
          Follow the steps to create a new booking. Prices are your contracted
          rate with {ctx.branding.displayName}.
        </p>
      </div>
      <ShowOpsBookingForm
        mode="create"
        action={createSellerBookingAction}
        successPath="/partner/tickets/{id}?created=1"
        sellerMode
        products={
          withBookedDates(
            (products ?? []) as { id: string }[],
            bookedDates,
          ) as never
        }
        suppliers={[ctx.supplier]}
        hotels={(hotels ?? []) as never}
        stops={(stops ?? []) as never}
        config={ctx.config}
        defaults={{
          supplier_id: ctx.supplier.id,
          sales_channel: ctx.supplier.partner_type,
        }}
      />
    </div>
  );
}
