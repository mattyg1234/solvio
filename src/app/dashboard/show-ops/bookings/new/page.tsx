import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { createBookingAction } from "@/app/dashboard/show-ops/actions";
import { ShowOpsBookingForm } from "@/components/show-ops/booking-form";
import { requireShowOpsEnabled } from "@/lib/show-ops/access";
import { loadBookedDatesByProduct, withBookedDates } from "@/lib/show-ops/nights";

export default async function NewBookingPage() {
  const ctx = await requireShowOpsEnabled();
  const biz = ctx.business.id;

  const [{ data: suppliers }, { data: products }, { data: hotels }, { data: stops }, bookedDates] = await Promise.all([
    ctx.supabase
      .from("show_suppliers")
        .select("id,name,billing_mode,deposit_percent,invoice_nett_percent,island,partner_type,can_choose_billing_mode")
      .eq("business_id", biz)
      .eq("active", true)
      .order("name"),
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
      .select("id,stop_name,resort,pickup_time,island,runs_on")
      .eq("business_id", biz)
      .eq("active", true),
    loadBookedDatesByProduct(ctx.supabase, biz),
  ]);

  return (
    <div className="space-y-4">
      <Link
        href="/dashboard/show-ops/bookings"
        className="inline-flex items-center gap-1.5 text-sm font-semibold"
        style={{ color: "var(--show-ops-primary,#7c3aed)" }}
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to bookings
      </Link>
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">New booking</h2>
        <p className="text-sm text-slate-600">Follow the steps to create a new booking.</p>
      </div>
      <ShowOpsBookingForm
        mode="create"
        action={createBookingAction}
        successPath="/dashboard/show-ops/bookings?created={ref}"
        products={withBookedDates((products ?? []) as { id: string }[], bookedDates) as never}
        suppliers={(suppliers ?? []) as never}
        hotels={(hotels ?? []) as never}
        stops={(stops ?? []) as never}
        config={ctx.config}
        // Whoever is signed in books for their own outlet by default.
        defaults={ctx.defaultSupplierId ? { supplier_id: ctx.defaultSupplierId } : undefined}
      />
    </div>
  );
}
