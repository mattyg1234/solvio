import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { createPartnerLinkBookingAction, partnerLinkContext } from "@/app/dashboard/show-ops/actions";
import { ShowOpsBookingForm } from "@/components/show-ops/booking-form";
import { loadRatePrices } from "@/lib/show-ops/rate-cards";
import { formatShowOpsMoney } from "@/lib/show-ops/calc";
import { showOpsCurrencyFor } from "@/lib/show-ops/config";
import { loadDirectoryHotels, loadDirectoryStops } from "@/lib/show-ops/directory-data";
import { withBookedDates } from "@/lib/show-ops/nights";

export const dynamic = "force-dynamic";

/**
 * A partner's private booking page. No login: the token in the URL is the identity,
 * and every booking made here is stamped with that partner.
 */
export default async function PartnerLinkPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const link = await partnerLinkContext(token);
  if (!link) notFound();
  const { ctx, supplier, admin } = link;
  const biz = ctx.business.id;

  const [{ data: products, error: productsError }, { data: hotels }, { data: stops }, bookedDatesResult, { data: recent }, created, ratePrices] = await Promise.all([
    admin
      .from("show_products")
      .select(
        "id,name,island,adult_price,child_price,infant_price,adult_price_no_transport,child_price_no_transport,infant_price_no_transport,adult_nett,child_nett,transport_available,run_weekdays,show_time,show_ticket_types(*),show_extras(*)",
      )
      .eq("business_id", biz)
      .eq("active", true)
      .order("name"),
    loadDirectoryHotels(admin, biz, true),
    loadDirectoryStops(admin, biz, true),
    admin.rpc("show_ops_partner_booked_dates", { p_business_id: biz }),
    admin
      .from("show_bookings")
      .select("id,booking_ref,guest_name,show_name,show_date,island,hotel_name,adults,children,infants,total_cost,nett_total,deposit_amount,billing_mode,created_at")
      .eq("business_id", biz)
      .eq("supplier_id", supplier.id)
      .order("created_at", { ascending: false })
      .limit(25),
    /^[0-9a-f-]{36}$/i.test(sp.created ?? "")
      ? admin.from("show_bookings").select("booking_ref,guest_name,show_name,show_date").eq("id", sp.created!).eq("supplier_id", supplier.id).maybeSingle()
      : Promise.resolve({ data: null }),
    // The partner's rate card — the prices this link quotes and books at.
    loadRatePrices(admin, biz, supplier.sale_rate_id ? String(supplier.sale_rate_id) : null),
  ]);
  if (productsError) throw new Error("Could not load shows. Please refresh.");
  const bookedDates = (bookedDatesResult.error ? {} : (bookedDatesResult.data ?? {})) as Record<string, string[]>;
  const { branding } = ctx;

  return (
    <div
      className="min-h-screen bg-slate-50 px-4 py-6"
      style={{ ["--show-ops-primary" as string]: branding.primaryColor, ["--show-ops-accent" as string]: branding.accentColor } as React.CSSProperties}
    >
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {branding.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={branding.logoUrl} alt="" className="h-12 w-auto max-w-[9rem] object-contain" />
            ) : (
              <Image src="/brand/icon-192.png" alt="" width={40} height={40} className="h-10 w-10 rounded-xl" />
            )}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{branding.displayName}</p>
              <h1 className="text-xl font-semibold tracking-tight text-slate-900">{supplier.name}</h1>
            </div>
          </div>
          <a href="#your-bookings" className="rounded-full bg-white px-3 py-1.5 text-sm font-medium ring-1 ring-slate-200">
            Your bookings ({recent?.length ?? 0})
          </a>
        </header>

        {created.data ? (
          <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 ring-1 ring-emerald-200" role="status">
            Booked. <strong>{created.data.booking_ref}</strong> — {created.data.guest_name}, {created.data.show_name} on {created.data.show_date}.
            Quote that reference to {branding.displayName} if you need to change anything.
          </p>
        ) : null}

        <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">New booking</h2>
          <p className="mb-4 text-sm text-slate-600">
            Prices shown are your contracted rate with {branding.displayName}. This page is private to {supplier.name}; every booking made here is recorded under your name.
          </p>
          <ShowOpsBookingForm
            mode="create"
            action={createPartnerLinkBookingAction}
            successPath={`/p/${encodeURIComponent(token)}?created={id}`}
            sellerMode
            products={withBookedDates((products ?? []) as { id: string }[], bookedDates) as never}
            suppliers={[supplier] as never}
            ratePrices={ratePrices}
            hotels={(hotels ?? []) as never}
            stops={(stops ?? []) as never}
            config={ctx.config}
            defaults={{ supplier_id: supplier.id, sales_channel: supplier.partner_type, partner_token: token } as never}
          />
        </section>

        <section id="your-bookings" className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Your bookings</h2>
          <p className="mb-3 text-sm text-slate-600">The last 25 bookings made under {supplier.name}.</p>
          {recent?.length ? (
            <ul className="divide-y divide-slate-100 text-sm">
              {recent.map((b) => {
                const currency = showOpsCurrencyFor(ctx.config, b.island);
                const pax = Number(b.adults || 0) + Number(b.children || 0) + Number(b.infants || 0);
                return (
                  <li key={b.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
                    <span className="min-w-0">
                      <span className="font-mono text-xs text-slate-500">{b.booking_ref}</span>{" "}
                      <span className="font-medium text-slate-900">{b.guest_name}</span>
                      <span className="block text-xs text-slate-500">
                        {b.show_name} · {b.show_date} · {pax} pax{b.hotel_name ? ` · ${b.hotel_name}` : ""}
                      </span>
                    </span>
                    <span className="text-right tabular-nums text-slate-700">
                      {formatShowOpsMoney(Number(b.total_cost || 0), currency)}
                      <span className="block text-[11px] text-slate-500">
                        {b.billing_mode === "invoice" ? `nett ${formatShowOpsMoney(Number(b.nett_total || 0), currency)}` : `deposit ${formatShowOpsMoney(Number(b.deposit_amount || 0), currency)}`}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No bookings yet. Your first one will appear here.</p>
          )}
        </section>

        <p className="text-center text-xs text-slate-400">
          Keep this link private to your team. Questions? Contact {branding.displayName}.{" "}
          <Link href="/" className="underline">Solvio</Link>
        </p>
      </div>
    </div>
  );
}
