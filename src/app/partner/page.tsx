import Link from "next/link";

import { requireShowOpsSellerContext } from "@/lib/show-ops/access";
import { formatShowOpsMoney } from "@/lib/show-ops/calc";

export default async function PartnerHomePage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await requireShowOpsSellerContext();
  const { data: rows } = await ctx.supabase
    .from("show_bookings")
    .select("id,booking_ref,guest_name,show_name,show_date,hotel_name,total_cost,nett_total,billing_mode,payment_status")
    .eq("business_id", ctx.business.id)
    .eq("supplier_id", ctx.supplier.id)
    .is("cancelled_at", null)
    .order("created_at", { ascending: false })
    .limit(50);

  const money = (n: number) => formatShowOpsMoney(n, ctx.config.currency);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-slate-900">Your last 50 bookings</h1>
        <Link href="/partner/new" className="text-sm font-medium text-[var(--show-ops-primary,#0f766e)]">
          + New
        </Link>
      </div>
      <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-200">
        You can book from here — pick a purple night on the calendar. You cannot cancel; if a guest drops out, ring the
        office.
      </p>
      {sp.created ? (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 ring-1 ring-emerald-200">
          Saved {sp.created}
        </p>
      ) : null}
      <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-200">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Ref</th>
              <th className="px-4 py-2">Guest</th>
              <th className="px-4 py-2">Show</th>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Hotel</th>
              <th className="px-4 py-2">Amount</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-4 py-2 font-mono text-xs">{r.booking_ref}</td>
                <td className="px-4 py-2">{r.guest_name}</td>
                <td className="px-4 py-2">{r.show_name}</td>
                <td className="px-4 py-2">{r.show_date}</td>
                <td className="px-4 py-2">{r.hotel_name || "—"}</td>
                <td className="px-4 py-2">
                  {r.billing_mode === "invoice" ? money(Number(r.nett_total)) : money(Number(r.total_cost))}
                </td>
              </tr>
            ))}
            {!rows?.length ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No bookings yet — make the first one.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
