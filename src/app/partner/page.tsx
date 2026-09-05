import Link from "next/link";

import { requireShowOpsSellerContext } from "@/lib/show-ops/access";
import { formatShowOpsMoney } from "@/lib/show-ops/calc";
import { showOpsCurrencyFor } from "@/lib/show-ops/config";
import {
  collectPartnerPages,
  partnerAnalyticsRange,
  summarisePartnerBookings,
  type PartnerAnalyticsBooking,
  type PartnerSalesTotals,
} from "@/lib/show-ops/partner-analytics";
import type { ShowOpsCurrency } from "@/lib/show-ops/types";

type PortalBooking = PartnerAnalyticsBooking & {
  booking_ref: string;
  guest_name: string;
  show_name: string;
  show_date: string;
  hotel_name: string | null;
  nett_total: number;
  billing_mode: string;
};
type TeamMember = {
  user_id: string;
  email: string | null;
  full_name: string | null;
};

function SalesValues({ sales }: { sales: PartnerSalesTotals["sales"] }) {
  const currencies = Object.keys(sales).sort() as ShowOpsCurrency[];
  return currencies.length ? (
    <span className="flex flex-wrap gap-x-3 gap-y-1">
      {currencies.map((currency) => (
        <span key={currency} className="whitespace-nowrap">
          {formatShowOpsMoney(sales[currency]!, currency)}{" "}
          <span className="text-xs uppercase">{currency}</span>
        </span>
      ))}
    </span>
  ) : (
    <span>—</span>
  );
}

export default async function PartnerHomePage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await requireShowOpsSellerContext();
  let range;
  try {
    range = partnerAnalyticsRange(sp.from, sp.to);
  } catch (error) {
    return (
      <div className="rounded-2xl bg-white p-6 ring-1 ring-slate-200">
        <p role="alert" className="text-sm text-rose-700">
          {error instanceof Error ? error.message : "Choose valid dates."}
        </p>
        <Link className="mt-3 inline-block text-sm underline" href="/partner">
          Reset dates
        </Link>
      </div>
    );
  }

  let rows: PortalBooking[] = [];
  let members: TeamMember[] = [];
  let loadFailed = false;
  try {
    [rows, members] = await Promise.all([
      collectPartnerPages<PortalBooking>(async (offset, limit) => {
        const { data, error } = await ctx.supabase.rpc(
          "show_ops_partner_bookings",
          {
            p_business_id: ctx.business.id,
            p_supplier_id: ctx.supplier.id,
            p_from: range.start,
            p_to: range.end,
            p_offset: offset,
            p_limit: limit,
          },
        );
        if (error) throw error;
        return (data ?? []) as PortalBooking[];
      }),
      (async () => {
        const { data, error } = await ctx.supabase.rpc(
          "show_ops_partner_team",
          { p_business_id: ctx.business.id, p_supplier_id: ctx.supplier.id },
        );
        if (error) throw error;
        return (data ?? []) as TeamMember[];
      })(),
    ]);
  } catch {
    loadFailed = true;
  }
  const sellerNames = new Map(
    members.map((member) => [
      member.user_id,
      member.full_name || member.email || "Seller",
    ]),
  );
  const summary = summarisePartnerBookings(
    rows,
    range,
    ctx.config,
    sellerNames,
  );
  const recent = rows.slice(0, 50);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-900">
          {ctx.partnerAdmin ? "Organisation results" : "My results"}
        </h1>
        <Link
          href="/partner/new"
          className="text-sm font-medium text-[var(--show-ops-primary,#0f766e)]"
        >
          + New booking
        </Link>
      </div>
      {sp.created ? (
        <p
          role="status"
          className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 ring-1 ring-emerald-200"
        >
          Saved {sp.created}
        </p>
      ) : null}
      <section className="space-y-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200 sm:p-6">
        <form className="flex flex-wrap items-end gap-3" method="get">
          <label className="min-w-0 flex-1 text-sm font-medium text-slate-700">
            Created from
            <input
              type="date"
              name="from"
              required
              defaultValue={range.from}
              className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2"
            />
          </label>
          <label className="min-w-0 flex-1 text-sm font-medium text-slate-700">
            Created through
            <input
              type="date"
              name="to"
              required
              defaultValue={range.to}
              className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2"
            />
          </label>
          <button
            type="submit"
            className="rounded-xl bg-[var(--show-ops-primary,#0f766e)] px-4 py-2 text-sm font-semibold text-white"
          >
            Show results
          </button>
        </form>
        <p className="text-xs leading-relaxed text-slate-500">
          Based on booking creation date, Canary Islands time, including both
          dates. Cancelled bookings are excluded. Gross booked sales are the
          full booking value, before commission; they are not payments received.
          Currencies are shown separately.
        </p>
        {loadFailed ? (
          <p
            role="alert"
            className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800"
          >
            We could not load your results. Please try again. No partial totals
            are shown.
          </p>
        ) : (
          <>
            <dl className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-slate-50 p-4">
                <dt className="text-sm text-slate-500">Bookings</dt>
                <dd className="mt-1 text-2xl font-semibold">
                  {summary.bookings.toLocaleString("en-GB")}
                </dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <dt className="text-sm text-slate-500">Passengers</dt>
                <dd className="mt-1 text-2xl font-semibold">
                  {summary.passengers.toLocaleString("en-GB")}
                </dd>
                <p className="mt-1 text-xs text-slate-500">
                  Adults, children and infants
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <dt className="text-sm text-slate-500">Gross booked sales</dt>
                <dd className="mt-1 text-lg font-semibold">
                  <SalesValues sales={summary.sales} />
                </dd>
              </div>
            </dl>
            {summary.missingValueBookings ? (
              <p className="text-sm text-amber-800">
                {summary.missingValueBookings} booking(s) have no recorded sales
                value. Their bookings and passengers are included.
              </p>
            ) : null}
            {ctx.partnerAdmin ? (
              <div className="space-y-2">
                <h2 className="pt-2 font-semibold text-slate-900">
                  Seller comparison
                </h2>
                <p className="text-xs text-slate-500">
                  Ordered by booking count. Office, former-seller and
                  unattributed historical bookings are kept separate.
                </p>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="text-xs text-slate-500">
                      <tr>
                        <th className="py-2 pr-4">Seller</th>
                        <th className="px-2 py-2 text-right">Bookings</th>
                        <th className="px-2 py-2 text-right">Passengers</th>
                        <th className="py-2 pl-4">Gross booked sales</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.sellers.map((seller) => (
                        <tr
                          key={seller.userId}
                          className="border-t border-slate-100"
                        >
                          <td className="py-3 pr-4">
                            {seller.name}
                            {seller.userId === ctx.user.id ? (
                              <span className="text-slate-500"> · you</span>
                            ) : null}
                          </td>
                          <td className="px-2 py-3 text-right">
                            {seller.bookings}
                          </td>
                          <td className="px-2 py-3 text-right">
                            {seller.passengers}
                          </td>
                          <td className="py-3 pl-4">
                            <SalesValues sales={seller.sales} />
                          </td>
                        </tr>
                      ))}
                      {summary.unattributed.bookings ? (
                        <tr className="border-t border-slate-200 text-slate-600">
                          <td className="py-3 pr-4">
                            Office / former seller / unattributed
                          </td>
                          <td className="px-2 py-3 text-right">
                            {summary.unattributed.bookings}
                          </td>
                          <td className="px-2 py-3 text-right">
                            {summary.unattributed.passengers}
                          </td>
                          <td className="py-3 pl-4">
                            <SalesValues sales={summary.unattributed.sales} />
                          </td>
                        </tr>
                      ) : null}
                      {!summary.bookings ? (
                        <tr>
                          <td colSpan={4} className="py-4 text-slate-500">
                            No bookings in this date range.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </>
        )}
      </section>
      {!loadFailed ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">
            {ctx.partnerAdmin ? "Organisation bookings" : "My bookings"}
          </h2>
          <p className="text-sm text-slate-500">
            Latest {recent.length} of {summary.bookings} in this creation date
            range. Contact the office for cancellations.
          </p>
          <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-200">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr>
                  {[
                    "Ref",
                    "Guest",
                    "Show",
                    "Show date",
                    "Hotel",
                    "Amount",
                    "Ticket photos",
                  ].map((label) => (
                    <th key={label} className="px-4 py-3">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recent.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-mono text-xs">
                      {row.booking_ref}
                    </td>
                    <td className="px-4 py-3">{row.guest_name}</td>
                    <td className="px-4 py-3">{row.show_name}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {row.show_date}
                    </td>
                    <td className="px-4 py-3">{row.hotel_name || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {formatShowOpsMoney(
                        Number(
                          row.billing_mode === "invoice"
                            ? row.nett_total
                            : row.total_cost,
                        ),
                        showOpsCurrencyFor(ctx.config, row.island),
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {row.created_by === ctx.user.id ? (
                        <Link
                          className="text-[var(--show-ops-primary,#0f766e)] underline"
                          href={`/partner/tickets/${row.id}`}
                        >
                          Add photos
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
                {!recent.length ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-8 text-center text-slate-500"
                    >
                      No bookings in this date range.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">
            Booking amounts show your contracted amount for invoice bookings and
            the full booking value otherwise.
          </p>
        </section>
      ) : null}
    </div>
  );
}
