import Link from "next/link";

import { ArrivalPaxForm } from "@/components/show-ops/arrival-pax-form";
import { BookingFlags } from "@/components/show-ops/booking-flags";
import { DateIslandFilter } from "@/components/show-ops/date-island-filter";
import { DoorAutoRefresh } from "@/components/show-ops/door-auto-refresh";
import { ListFlagButton } from "@/components/show-ops/list-flag-button";
import { LocalTime } from "@/components/show-ops/local-time";
import { NoShowDecisionForm, TicketPhotoControl } from "@/components/show-ops/no-show-decision";
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
  hotel_name: string | null;
  pickup_stop_name: string | null;
  pickup_time: string | null;
  adults: number;
  children: number;
  infants: number;
  dietary_required: boolean | null;
  dietary_notes: string | null;
  office_comments: string | null;
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

export default async function ShowOpsDoorPage({
  searchParams,
}: {
  // `slot` is still accepted from old links and bookmarks but ignored: there is
  // one show a night now, and the Door shows every booking for that night.
  searchParams: Promise<{ date?: string; island?: string; show?: string; slot?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await requireShowOpsPage("door");
  const date = sp.date || isoDateInTimeZone(new Date(), "Atlantic/Canary");
  const island = sp.island || "";
  const showFilter = sp.show || "";
  const money = (n: number) => formatShowOpsMoney(n, showOpsCurrencyFor(ctx.config, island));
  const day = showOpsDayName(date);

  let query = ctx.supabase
    .from("show_bookings")
    .select(
      "id,booking_ref,guest_name,show_name,hotel_name,pickup_stop_name,pickup_time,adults,children,infants,dietary_required,dietary_notes,office_comments,billing_mode,payment_status,total_cost,balance_remaining,nett_total,cancelled_at,arrived_at,arrived_pax,no_show,door_pay_method,no_show_charge,no_show_proof_path,invoice_id",
    )
    .eq("business_id", ctx.business.id)
    .eq("show_date", date)
    .is("cancelled_at", null);
  if (island) query = query.eq("island", island);

  const [{ data: bookingRows }, { data: savedShows }] = await Promise.all([
    query,
    ctx.supabase.from("show_products").select("name").eq("business_id", ctx.business.id).eq("active", true).order("name"),
  ]);

  const bookings = ((bookingRows ?? []) as DoorRow[]).filter((b) => !showFilter || b.show_name === showFilter);

  // Sign any ticket photos so the door card can link them.
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

  return (
    <div className="space-y-4">
      <ShowOpsPageHeader
        eyebrow="Door staff"
        title="Door"
        subtitle={`${day ? `${day} · ` : ""}${date} · live arrivals: scan the guest QR or tap them in and they move to Arrived with the time. Printed office, bus and dietary sheets live under Night lists.`}
        actions={<DoorAutoRefresh />}
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
        touch
      />

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
  const due = pay.outstandingAmount != null && pay.outstandingAmount > 0 ? money(pay.outstandingAmount) : null;
  const payPhrase = showOpsDoorPayPhrase(row.door_pay_method);
  // Invoice bookings are settled with the partner, never at the door.
  const noDoorPay = Boolean(row.door_pay_method || arrival.status === "absent" || row.billing_mode === "invoice");

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
            {` · ${row.show_name}`}
          </p>
        </div>
        <div className="shrink-0 text-right">
          {inAt && row.arrived_at ? (
            <p className="text-lg font-semibold tabular-nums text-emerald-800">
              <LocalTime iso={row.arrived_at} fallback={inAt} />
            </p>
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
      {/* Amber = special meal, rose = money due at the door, violet = office comment */}
      <BookingFlags
        dietaryRequired={row.dietary_required}
        dietaryNotes={row.dietary_notes}
        balanceDueLabel={due}
        comments={row.office_comments}
      />
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
          photo={false}
        />
        <TicketPhotoControl key={row.no_show_proof_path ?? "none"} bookingId={row.id} proofUrl={row.proofUrl ?? null} big />
        <div className="flex flex-wrap gap-2">
          <ListFlagButton bookingId={row.id} flag="cash" label="Paid cash" hide={noDoorPay} big />
          <ListFlagButton bookingId={row.id} flag="card" label="Paid on card" hide={noDoorPay} tone="sky" big />
          <ListFlagButton bookingId={row.id} flag="cash" label="Undo cash" hide={row.door_pay_method !== "cash"} undo big />
          <ListFlagButton bookingId={row.id} flag="card" label="Undo card" hide={row.door_pay_method !== "card"} undo big />
        </div>
      </div>
    </article>
  );
}
