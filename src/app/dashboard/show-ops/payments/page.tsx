import Link from "next/link";

import { recordPaymentAction, sendShowOpsPaymentLinkAction } from "@/app/dashboard/show-ops/actions";
import { DateIslandFilter } from "@/components/show-ops/date-island-filter";
import { ShowOpsPageHeader } from "@/components/show-ops/show-ops-page-header";
import { NumberInput } from "@/components/ui/number-input";
import { requireShowOpsEnabled } from "@/lib/show-ops/access";
import { formatShowOpsMoney, showOpsAmountDue } from "@/lib/show-ops/calc";
import { hasShowOpsModule, showOpsCurrencyFor } from "@/lib/show-ops/config";

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; show?: string; island?: string; sent?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await requireShowOpsEnabled();
  if (!hasShowOpsModule(ctx.config, ctx.tier, "payments")) {
    return <p className="text-sm text-slate-600">Payments are not enabled for this workspace.</p>;
  }

  const date = sp.date || new Date().toISOString().slice(0, 10);
  const show = sp.show || "";
  const island = sp.island || "";
  const money = (n: number) => formatShowOpsMoney(n, showOpsCurrencyFor(ctx.config, island));
  const stripeReady = Boolean(
    ctx.business.stripe_connect_account_id?.trim() && ctx.business.stripe_connect_charges_enabled,
  );
  const canLink = ctx.config.guest_stripe_enabled && stripeReady;

  const { data: savedShows } = await ctx.supabase
    .from("show_products")
    .select("name")
    .eq("business_id", ctx.business.id)
    .eq("active", true)
    .order("name");

  const uniqueShows = [...new Set([...(savedShows ?? []).map((r) => r.name), show].filter(Boolean))].sort();

  let q = ctx.supabase
    .from("show_bookings")
    .select(
      "id,booking_ref,guest_name,guest_email,show_name,island,deposit_amount,balance_remaining,total_cost,payment_status,billing_mode",
    )
    .eq("business_id", ctx.business.id)
    .eq("show_date", date)
    .eq("billing_mode", "deposit")
    .neq("payment_status", "paid")
    .is("cancelled_at", null)
    .order("guest_name");
  if (show) q = q.eq("show_name", show);
  if (island) q = q.eq("island", island);
  const [{ data: rows }, { data: recentPays }] = await Promise.all([
    q,
    ctx.supabase
      .from("show_booking_payments")
      .select("id,amount,method,created_at,booking_id,show_bookings(booking_ref,guest_name,show_date)")
      .eq("business_id", ctx.business.id)
      .order("created_at", { ascending: false })
      .limit(40),
  ]);

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <ShowOpsPageHeader
          eyebrow="Operations"
          title="Payments due"
          subtitle={`Deposit / direct sales for ${date}${show ? ` · ${show}` : ""} — record cash or card, or email a Stripe link.`}
        />
        {sp.sent === "1" ? (
          <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 ring-1 ring-emerald-200">
            Payment link emailed.
          </p>
        ) : null}
        {ctx.config.guest_stripe_enabled && !stripeReady ? (
          <p className="rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-950 ring-1 ring-sky-200">
            Connect Stripe in{" "}
            <Link href="/dashboard/payments" className="underline">
              Dashboard → Payments
            </Link>{" "}
            to email guests a payment link. Cash and card still work.
          </p>
        ) : null}
        <DateIslandFilter
          basePath="/dashboard/show-ops/payments"
          date={date}
          island={island}
          islands={ctx.config.islands}
          includeShow
          showName={show}
          showNames={uniqueShows}
        />
        <div className="space-y-3">
          {(rows ?? []).map((b) => {
            const due = showOpsAmountDue({
              billingMode: "deposit",
              totalCost: Number(b.total_cost),
              depositAmount: Number(b.deposit_amount),
              paidSum: b.payment_status === "unpaid" ? 0 : Math.max(0, Number(b.total_cost) - Number(b.balance_remaining)),
            });
            return (
            <div key={b.id} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
              <div className="flex flex-wrap justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {b.guest_name}{" "}
                    <span className="font-mono text-xs text-slate-500">{b.booking_ref}</span>
                  </p>
                  <p className="text-sm text-slate-600">
                    {b.show_name} · {b.island} · total {money(Number(b.total_cost))} · deposit{" "}
                    {money(Number(b.deposit_amount))} · outstanding {money(Number(b.balance_remaining))} ·{" "}
                    {due.kind === "deposit" ? "deposit due" : "balance due"} {money(due.amount)}
                    {b.guest_email ? ` · ${b.guest_email}` : " · no email"}
                  </p>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <form action={recordPaymentAction} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="booking_id" value={b.id} />
                    <label className="text-xs">
                      Amount
                      <NumberInput
                        name="amount"
                        defaultValue={due.amount}
                        className="mt-1 block w-28 rounded border px-2 py-1"
                      />
                    </label>
                    <label className="text-xs">
                      Method
                      <select name="method" className="mt-1 block rounded border px-2 py-1">
                        <option value="cash">Cash</option>
                        <option value="card">Card</option>
                        <option value="transfer">Transfer</option>
                      </select>
                    </label>
                    <button type="submit" className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white">
                      Record
                    </button>
                  </form>
                  {canLink ? (
                    <form action={sendShowOpsPaymentLinkAction}>
                      <input type="hidden" name="booking_id" value={b.id} />
                      <button
                        type="submit"
                        disabled={!b.guest_email}
                        className="rounded-xl bg-[var(--show-ops-primary,#7c3aed)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Email payment link
                      </button>
                    </form>
                  ) : null}
                </div>
              </div>
            </div>
            );
          })}
          {!rows?.length ? <p className="text-sm text-slate-500">No open deposit balances for this filter.</p> : null}
        </div>
      </div>

      <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <h3 className="font-semibold text-slate-900">Recent payments</h3>
        <p className="mt-1 text-sm text-slate-600">Last 40 recorded payments across all dates.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2 pr-3">When</th>
                <th className="py-2 pr-3">Booking</th>
                <th className="py-2 pr-3">Guest</th>
                <th className="py-2 pr-3">Method</th>
                <th className="py-2">Amount</th>
              </tr>
            </thead>
            <tbody>
              {(recentPays ?? []).map((p) => {
                const b = Array.isArray(p.show_bookings) ? p.show_bookings[0] : p.show_bookings;
                return (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="py-2 pr-3 text-slate-600">{new Date(p.created_at).toLocaleString()}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{b?.booking_ref ?? "—"}</td>
                    <td className="py-2 pr-3">{b?.guest_name ?? "—"}</td>
                    <td className="py-2 pr-3 capitalize">{p.method}</td>
                    <td className="py-2 font-medium">{money(Number(p.amount))}</td>
                  </tr>
                );
              })}
              {!recentPays?.length ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-500">
                    No payments recorded yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
