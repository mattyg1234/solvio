import { loadDirectoryHotels, loadDirectoryStops } from "@/lib/show-ops/directory-data";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { createBookingAction } from "@/app/dashboard/show-ops/actions";
import { createBookingFromEmailAction } from "@/app/dashboard/show-ops/email-bookings/actions";
import { ShowOpsBookingForm } from "@/components/show-ops/booking-form";
import { EmailDraftBanner } from "@/components/show-ops/email-bookings/email-draft-banner";
import { requireShowOpsPage } from "@/lib/show-ops/access";
import { loadEmailFormDraft } from "@/lib/show-ops/email-bookings/draft";
import {
  loadBookedDatesByProduct,
  withBookedDates,
} from "@/lib/show-ops/nights";

export default async function NewBookingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireShowOpsPage("bookings");
  const biz = ctx.business.id;
  // Opened from Email bookings (?email=<id>): the form comes prefilled from the email.
  const emailParam = (await searchParams).email;
  const emailId = typeof emailParam === "string" ? emailParam : "";

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
        "id,name,billing_mode,deposit_percent,invoice_nett_percent,round_up,island,partner_type,can_choose_billing_mode,sale_rate_id",
      )
      .eq("business_id", biz)
      .eq("active", true)
      .order("name"),
    ctx.supabase
      .from("show_products")
      .select(
        "id,name,island,adult_price,child_price,infant_price,adult_price_no_transport,child_price_no_transport,infant_price_no_transport,adult_nett,child_nett,transport_available,run_weekdays,run_dates,dark_dates,show_time,show_ticket_types(*),show_extras(*)",
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

  const fromEmail = emailId
    ? await loadEmailFormDraft(ctx, emailId, {
        products: products ?? [],
        suppliers: suppliers ?? [],
        hotels: hotels ?? [],
      })
    : null;

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
      {fromEmail ? <EmailDraftBanner source={fromEmail} /> : null}
      <ShowOpsBookingForm
        mode="create"
        action={
          fromEmail
            ? createBookingFromEmailAction.bind(null, fromEmail.email.id)
            : createBookingAction
        }
        successPath={
          fromEmail
            ? "/dashboard/show-ops/email-bookings?created={ref}"
            : "/dashboard/show-ops/bookings?created={ref}"
        }
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
          // From an email the partner is the email's seller, never the desk's own outlet.
          fromEmail
            ? fromEmail.draft.defaults
            : ctx.defaultSupplierId
              ? { supplier_id: ctx.defaultSupplierId }
              : undefined
        }
      />
    </div>
  );
}
