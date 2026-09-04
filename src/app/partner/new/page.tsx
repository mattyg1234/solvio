import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { createSellerBookingAction } from "@/app/dashboard/show-ops/actions";
import { ShowOpsBookingForm } from "@/components/show-ops/booking-form";
import { requireShowOpsSellerContext } from "@/lib/show-ops/access";
import { loadBookedDatesByProduct, withBookedDates } from "@/lib/show-ops/nights";

export default async function PartnerNewBookingPage() {
  const ctx = await requireShowOpsSellerContext();
  const biz = ctx.business.id;

  const [{ data: products }, { data: hotels }, { data: stops }, bookedDates] = await Promise.all([
    ctx.supabase
      .from("show_products")
      .select("id,name,island,adult_price,child_price,infant_price,adult_price_no_transport,child_price_no_transport,infant_price_no_transport,adult_nett,child_nett,transport_available,run_weekdays,show_time")
      .eq("business_id", biz)
      .eq("active", true)
      .order("name"),
    ctx.supabase
      .from("show_hotels")
      .select("id,name,island,bus_stop_id")
      .eq("business_id", biz)
      .eq("active", true)
      .order("name"),
    ctx.supabase
      .from("show_bus_stops")
      .select("id,stop_name,resort,pickup_time,island,runs_on,zone")
      .eq("business_id", biz)
      .eq("active", true),
    loadBookedDatesByProduct(ctx.supabase, biz),
  ]);

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
          Follow the steps to create a new booking. Prices are your contracted rate with {ctx.branding.displayName}.
        </p>
      </div>
      <ShowOpsBookingForm
        mode="create"
        action={createSellerBookingAction}
        successPath="/partner?created={ref}"
        sellerMode
        products={withBookedDates((products ?? []) as { id: string }[], bookedDates) as never}
        suppliers={[ctx.supplier]}
        hotels={(hotels ?? []) as never}
        stops={(stops ?? []) as never}
        config={ctx.config}
        defaults={{ supplier_id: ctx.supplier.id, sales_channel: ctx.supplier.partner_type }}
      />
    </div>
  );
}
