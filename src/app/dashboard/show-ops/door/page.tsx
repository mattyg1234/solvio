import Link from "next/link";

import { ArrivalPaxForm } from "@/components/show-ops/arrival-pax-form";
import { DateIslandFilter } from "@/components/show-ops/date-island-filter";
import { ListFlagButton } from "@/components/show-ops/list-flag-button";
import { NoShowDecisionForm } from "@/components/show-ops/no-show-decision";
import { ShowOpsPageHeader } from "@/components/show-ops/show-ops-page-header";
import { DoorTicketScanner } from "@/components/show-ops/ticket-scanner";
import { requireShowOpsPage } from "@/lib/show-ops/access";
import {
  formatShowOpsDoorTime,
  formatShowOpsMoney,
  formatShowOpsPax,
  showOpsArrivalMark,
  showOpsBookingPayView,
  showOpsDayName,
  showOpsDoorPayPhrase,
  surnameKey,
} from "@/lib/show-ops/calc";
import { showOpsCurrencyFor } from "@/lib/show-ops/config";
import { isoDateInTimeZone } from "@/lib/show-ops/digest";

type DoorRow = {
  id: string;
  booking_ref: string;
  guest_name: string;
  show_name: string;
  ampm: string | null;
  hotel_name: string | null;
  pickup_stop_name: string | null;
  pickup_time: string | null;
  adults: number;
  children: number;
  infants: number;
  billing_mode: string;
  payment_status: string;
  total_cost: number;
  balance_remaining: number;
  nett_total: number | null;
  cancelled_at: string | null;
  arrived_at: string | null;
  arrived_pax: number | null;
  no_show: boolean | null;
  door_pay_method: string | null;
  no_show_charge: "charge" | "write_off" | null;
  no_show_proof_path: string | null;
  invoice_id: string | null;
  proofUrl?: string | null;
};

function slotLabel(ampm: string | null): string | null {
  if (ampm === "AM") return "Morning";
  if (ampm === "PM") return "Evening";
  return ampm;
}

export default async function ShowOpsDoorPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; island?: string; show?: string; slot?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await requireShowOpsPage("door");
  const date = sp.date || isoDateInTimeZone(new Date(), "Atlantic/Canary");
  const island = sp.island || "";
  const showFilter = sp.show || "";
  const slot = sp.slot === "AM" || sp.slot === "PM" ? sp.slot : "";
  const money = (n: number) => formatShowOpsMoney(n, showOpsCurrencyFor(ctx.config, island));
  const day = showOpsDayName(date);

  let query = ctx.supabase
    .from("show_bookings")
    .select(
      "id,booking_ref,guest_name,show_name,ampm,hotel_name,pickup_stop_name,pickup_time,adults,children,infants,billing_mode,payment_status,total_cost,balance_remaining,nett_total,cancelled_at,arrived_at,arrived_pax,no_show,door_pay_method,no_show_charge,no_show_proof_path,invoice_id",
    )
    .eq("business_id", ctx.business.id)
    .eq("show_date", date)
    .is("cancelled_at", null);
  if (island) query = query.eq("island", island);

  const [{ data: bookingRows }, { data: savedShows }] = await Promise.all([
    query,
    ctx.supabase.from("show_products").select("name").eq("business_id", ctx.business.id).eq("active", true).order("name"),
  ]);

  const bookings = ((bookingRows ?? []) as DoorRow[]).filter((b) => {
    if (showFilter && b.show_name !== showFilter) return false;
    if (slot && b.ampm !== slot) return false;
    return true;
  });

  // Sign any no-show proof photos so the door card can link them.
  await Promise.all(
    bookings
      .filter((b) => b.no_show_proof_path)
      .map(async (b) => {
        const { data } = await ctx.supabase.storage
          .from("show-ops-proofs")
          .createSignedUrl(b.no_show_proof_path!, 60 * 60);
        if (data?.signedUrl) b.proofUrl = data.signedUrl;
      }),
  );

  const showNames = [
    ...new Set([...(savedShows ?? []).map((p) => p.name), ...bookings.map((b) => b.show_name), showFilter].filter(Boolean)),
  ].sort();

  const waiting = bookings
    .filter((b) => !b.arrived_at && !b.no_show)
    .sort((a, b) => surnameKey(a.guest_name).localeCompare(surnameKey(b.guest_name)));
  const inNow = bookings
    .filter((b) => b.arrived_at)
    .sort((a, b) => String(b.arrived_at).localeCompare(String(a.arrived_at)));
  const absent = bookings.filter((b) => b.no_show && !b.arrived_at);
  const waitingPax = waiting.reduce((n, b) => n + b.adults + b.children + b.infants, 0);
  const inPax = inNow.reduce((n, b) => n + (b.arrived_pax ?? b.adults + b.children + b.infants), 0);

  const slotHref = (next: string) => {
    const params = new URLSearchParams();
    params.set("date", date);
    if (island) params.set("island", island);
    if (showFilter) params.set("show", showFilter);
    if (next) params.set("slot", next);
    return `/dashboard/show-ops/door?${params.toString()}`;
  };

  return (
    <div className="space-y-4">
      <ShowOpsPageHeader
        eyebrow="Door staff"
        title="Ticket in"
        subtitle={`${day ? `${day} · ` : ""}${date} · scan the guest QR and they drop into Arrived with the time.`}
      />

      <DoorTicketScanner date={date} island={island} />

      <DateIslandFilter
        key={`${date}:${island}:${showFilter}`}
        basePath="/dashboard/show-ops/door"
        date={date}
        island={island}
        islands={ctx.config.islands}
        showName={showFilter}
        showNames={showNames}
        includeShow
        extra={slot ? { slot } : {}}
        touch
      />

      <div className="flex gap-2 print:hidden">
        {(
          [
            ["", "All"],
            ["AM", "Morning"],
            ["PM", "Evening"],
          ] as const
        ).map(([value, label]) => {
          const on = slot === value;
          return (
            <Link
              key={label}
              href={slotHref(value)}
              className={`min-h-11 flex-1 rounded-xl px-3 py-2 text-center text-sm font-semibold ${
                on ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </div>

      <p className="text-sm font-medium text-slate-600">
        {waiting.length} waiting · {inNow.length} in
        {absent.length ? ` · ${absent.length} no-show` : ""}
        <span className="text-slate-400">
          {" "}
          · {waitingPax} still outside · {inPax} inside
        </span>
      </p>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Waiting</h3>
        {waiting.length ? (
          waiting.map((b) => <DoorCard key={b.id} row={b} money={money} />)
        ) : (
          <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">Everyone on this list is in.</p>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Arrived</h3>
        {inNow.length ? (
          inNow.map((b) => <DoorCard key={b.id} row={b} money={money} />)
        ) : (
          <p className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-500 ring-1 ring-slate-200">Nobody scanned in yet.</p>
        )}
      </section>

      {absent.length ? (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">No-show</h3>
          {absent.map((b) => (
            <DoorCard key={b.id} row={b} money={money} />
          ))}
        </section>
      ) : null}
    </div>
  );
}

function DoorCard({ row, money }: { row: DoorRow; money: (n: number) => string }) {
  const arrival = showOpsArrivalMark({
    adults: row.adults,
    children: row.children,
    infants: row.infants,
    arrivedPax: row.arrived_pax,
    arrivedAt: row.arrived_at,
    noShow: row.no_show,
  });
  const pay = showOpsBookingPayView({
    billingMode: row.billing_mode,
    totalCost: row.total_cost,
    balanceRemaining: row.balance_remaining,
    nettTotal: row.nett_total,
    paymentStatus: row.payment_status,
    cancelledAt: row.cancelled_at,
  });
  const inAt = formatShowOpsDoorTime(row.arrived_at);
  const slot = slotLabel(row.ampm);
  const due = pay.outstandingAmount != null && pay.outstandingAmount > 0 ? money(pay.outstandingAmount) : null;
  const payPhrase = showOpsDoorPayPhrase(row.door_pay_method);

  return (
    <article
      id={`door-${row.id}`}
      className={`rounded-2xl px-4 py-3 ring-1 ${
        arrival.status === "all_in"
          ? "bg-emerald-50/80 ring-emerald-200"
          : arrival.status === "absent"
            ? "bg-slate-100 ring-slate-200 text-slate-500"
            : "bg-white ring-slate-200"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/dashboard/show-ops/bookings/${row.id}`} className="block truncate text-lg font-semibold text-slate-900">
            {row.guest_name}
          </Link>
          <p className="mt-0.5 text-sm text-slate-500">
            {row.booking_ref}
            {slot ? ` · ${slot}` : ""}
            {` · ${row.show_name}`}
          </p>
        </div>
        <div className="shrink-0 text-right">
          {inAt ? (
            <p className="text-lg font-semibold tabular-nums text-emerald-800">{inAt}</p>
          ) : arrival.status === "absent" ? (
            <p className="text-sm font-semibold text-slate-500">No-show</p>
          ) : (
            <p className="text-sm font-semibold text-slate-400">Waiting</p>
          )}
          <p className="text-sm font-medium text-slate-700">{formatShowOpsPax(row.adults, row.children, row.infants)}</p>
        </div>
      </div>
      <p className="mt-2 text-sm text-slate-600">
        {[row.hotel_name, row.pickup_stop_name, row.pickup_time?.slice(0, 5)].filter(Boolean).join(" · ") || "No pickup"}
      </p>
      {due ? <p className="mt-2 text-sm font-semibold text-amber-800">{due} still due at the door</p> : null}
      {payPhrase ? <p className="mt-1 text-sm font-medium text-emerald-800">Paid {payPhrase}</p> : null}

      {/* Mark people in and take payment, right from the phone */}
      <div className="mt-3 flex flex-col gap-2 border-t border-black/5 pt-3">
        <ArrivalPaxForm key={`${row.id}:${arrival.arrived}`} bookingId={row.id} mark={arrival} big />
        <NoShowDecisionForm
          bookingId={row.id}
          charge={row.no_show_charge === "write_off" || row.no_show_charge === "charge" ? row.no_show_charge : null}
          missing={arrival.missing ?? 0}
          booked={arrival.booked}
          invoiced={Boolean(row.invoice_id)}
          proofUrl={row.proofUrl ?? null}
          compact
        />
        <div className="flex flex-wrap gap-2">
          <ListFlagButton bookingId={row.id} flag="cash" label="Paid cash" hide={Boolean(row.door_pay_method || arrival.status === "absent")} big />
          <ListFlagButton bookingId={row.id} flag="card" label="Paid on card" hide={Boolean(row.door_pay_method || arrival.status === "absent")} tone="sky" big />
          <ListFlagButton bookingId={row.id} flag="cash" label="Undo cash" hide={row.door_pay_method !== "cash"} undo big />
          <ListFlagButton bookingId={row.id} flag="card" label="Undo card" hide={row.door_pay_method !== "card"} undo big />
        </div>
      </div>
    </article>
  );
}
