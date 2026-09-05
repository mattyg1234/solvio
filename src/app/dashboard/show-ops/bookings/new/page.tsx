import { loadDirectoryHotels, loadDirectoryStops } from "@/lib/show-ops/directory-data";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { createBookingAction } from "@/app/dashboard/show-ops/actions";
import { ShowOpsBookingForm } from "@/components/show-ops/booking-form";
import { requireShowOpsEnabled } from "@/lib/show-ops/access";
import {
  loadBookedDatesByProduct,
  withBookedDates,
} from "@/lib/show-ops/nights";

export default async function NewBookingPage() {
  const ctx = await requireShowOpsEnabled();
  const biz = ctx.business.id;

  const [
    { data: suppliers },
    { data: products, error: productsError },
    { data: hotels },
    { data: stops },
    bookedDates,
  ] = await Promise.all([
    ctx.supabase
      .from("show_suppliers")
      .select(
        "id,name,billing_mode,deposit_percent,invoice_nett_percent,island,partner_type,can_choose_billing_mode",
      )
      .eq("business_id", biz)
      .eq("active", true)
      .order("name"),
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
    loadBookedDatesByProduct(ctx.supabase, biz),
  ]);

  if (productsError)
    throw new Error(
      "Could not load shows, ticket types and extras. Please try again.",
    );

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
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
          New booking
        </h2>
        <p className="text-sm text-slate-600">
          Follow the steps to create a new booking.
        </p>
      </div>
      <ShowOpsBookingForm
        mode="create"
        action={createBookingAction}
        successPath="/dashboard/show-ops/bookings?created={ref}"
        products={
          withBookedDates(
            (products ?? []) as { id: string }[],
            bookedDates,
          ) as never
        }
        suppliers={(suppliers ?? []) as never}
        hotels={(hotels ?? []) as never}
        stops={(stops ?? []) as never}
        config={ctx.config}
        // Whoever is signed in books for their own outlet by default.
        defaults={
          ctx.defaultSupplierId
            ? { supplier_id: ctx.defaultSupplierId }
            : undefined
        }
      />
    </div>
  );
}
