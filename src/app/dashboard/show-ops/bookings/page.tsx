import Link from "next/link";

import { BookingsDeskTable, type BookingsDeskRow, type BookingsDeskSort } from "@/components/show-ops/bookings-desk";
import { ShowOpsLiveFilterForm } from "@/components/show-ops/live-filter-form";
import { TicketScanner } from "@/components/show-ops/ticket-scanner";
import { SHOW_OPS_GHOST_BTN, ShowOpsNewBookingButton, ShowOpsPageHeader, ShowOpsPill } from "@/components/show-ops/show-ops-page-header";
import { requireShowOpsPage } from "@/lib/show-ops/access";
import {
  addDaysIso,
  formatShowOpsMoney,
  formatShowOpsPax,
  showOpsArrivalMark,
  showOpsBookingPayView,
  showOpsDayName,
  showOpsDoorPayPhrase,
} from "@/lib/show-ops/calc";
import { showOpsCurrencyFor } from "@/lib/show-ops/config";
import { SHOW_OPS_PAYMENT_METHOD_LABELS } from "@/lib/show-ops/types";

const PAGE_SIZE = 250;

/** Whitelisted sort keys → columns. Joel: "sort by everything". */
const SORT_COLUMNS: Record<string, string> = {
  created: "created_at",
  date: "show_date",
  // Refs are text (MHT-L316713 / MHT-316714); the stored number sorts them properly.
  ref: "booking_ref_num",
  name: "guest_name",
  show: "show_name",
  hotel: "hotel_name",
  stop: "pickup_time",
  price: "total_cost",
  outstanding: "balance_remaining",
  supplier: "supplier_name",
};

function sanitizeSearch(q: string): string {
  return q.replace(/[%_,()]/g, "").trim();
}

function payBadgeClass(label: string): string {
  if (label === "Paid") return "bg-emerald-50 text-emerald-800";
  if (label === "Part paid") return "bg-amber-50 text-amber-900";
  if (label === "Unpaid") return "bg-rose-50 text-rose-800";
  if (label === "Invoice") return "bg-slate-100 text-slate-700";
  return "bg-slate-100 text-slate-500";
}

function csvHref(sp: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v) params.set(k, v);
  }
  const q = params.toString();
  return q ? `/api/show-ops/bookings.csv?${q}` : "/api/show-ops/bookings.csv";
}

export default async function AllBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    created?: string;
    q?: string;
    island?: string;
    date?: string;
    from?: string;
    to?: string;
    pay?: string;
    cancelled?: string;
    page?: string;
    include_cancelled?: string;
    show?: string;
    door?: string;
    all?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const sp = await searchParams;
  const ctx = await requireShowOpsPage("bookings");
  const money = (n: number, island?: string | null) => formatShowOpsMoney(n, showOpsCurrencyFor(ctx.config, island));
  const today = new Date().toISOString().slice(0, 10);
  const fourWeekEnd = addDaysIso(today, 27);
  const q = sanitizeSearch(sp.q || "");
  const island = sp.island || "";
  const showFilter = sp.show || "";
  const door = sp.door || "";
  const allDates = sp.all === "1" && !sp.from && !sp.to;
  const tonightOnly = Boolean(sp.date) && !sp.from && !sp.to && !allDates;
  const date = tonightOnly ? sp.date || today : "";
  const from = allDates || tonightOnly ? sp.from || "" : sp.from || today;
  const to = allDates || tonightOnly ? sp.to || "" : sp.to || fourWeekEnd;
  const pay = sp.pay || "";
  const includeCancelled = sp.include_cancelled === "1" || pay === "cancelled";
  const page = Math.max(1, Number(sp.page || 1) || 1);
  const fromIdx = (page - 1) * PAGE_SIZE;
  const toIdx = fromIdx + PAGE_SIZE - 1;
  const sortKey = sp.sort && SORT_COLUMNS[sp.sort] ? sp.sort : "date";
  const ascending = sp.dir ? sp.dir === "asc" : sortKey === "date";

  let query = ctx.supabase
    .from("show_bookings")
    .select(
      "id,booking_ref,guest_name,guest_mobile,guest_email,show_name,show_date,hotel_name,pickup_stop_name,pickup_time,supplier_name,island,adults,children,infants,total_cost,deposit_amount,balance_remaining,nett_total,payment_status,billing_mode,created_at,cancelled_at,arrived_at,arrived_pax,door_pay_method,no_show,dietary_required,dietary_notes,supplier_ticket_number,office_comments,transport_required,sales_channel,payment_method,pickup_kind",
      { count: "exact" },
    )
    .eq("business_id", ctx.business.id)
    .order(SORT_COLUMNS[sortKey], { ascending, nullsFirst: ascending })
    .order("show_date", { ascending: true })
    .range(fromIdx, toIdx);

  if (!includeCancelled) query = query.is("cancelled_at", null);
  if (pay === "cancelled") query = query.not("cancelled_at", "is", null);
  if (pay === "invoice") query = query.eq("billing_mode", "invoice");
  if (pay === "unpaid" || pay === "partial" || pay === "paid") {
    query = query.eq("billing_mode", "deposit").eq("payment_status", pay);
  }
  if (island) query = query.eq("island", island);
  if (date) query = query.eq("show_date", date);
  if (from) query = query.gte("show_date", from);
  if (to) query = query.lte("show_date", to);
  if (showFilter) query = query.eq("show_name", showFilter);
  if (door === "in") query = query.not("arrived_at", "is", null);
  if (door === "absent") query = query.eq("no_show", true);
  if (door === "cash") query = query.eq("door_pay_method", "cash");
  if (door === "unpaid") query = query.eq("billing_mode", "deposit").neq("payment_status", "paid");
  if (q) {
    query = query.or(
      [
        "booking_ref",
        "guest_name",
        "guest_email",
        "guest_mobile",
        "show_name",
        "supplier_name",
        "hotel_name",
        "pickup_stop_name",
        "supplier_ticket_number",
      ]
        .map((col) => `${col}.ilike.%${q}%`)
        .join(","),
    );
  }

  const [{ data: rows, count }, { data: savedShows }] = await Promise.all([
    query,
    ctx.supabase
      .from("show_products")
      .select("name,island")
      .eq("business_id", ctx.business.id)
      .eq("active", true)
      .order("name"),
  ]);
  const total = count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const showOptions = (() => {
    const byName = new Map<string, Set<string>>();
    for (const p of savedShows ?? []) {
      if (!p.name) continue;
      const islands = byName.get(p.name) ?? new Set<string>();
      if (p.island) islands.add(p.island);
      byName.set(p.name, islands);
    }
    if (showFilter && !byName.has(showFilter)) byName.set(showFilter, new Set());
    return [...byName.entries()].map(([name, islands]) => ({
      name,
      label: islands.size ? `${name} · ${[...islands].join(", ")}` : name,
    }));
  })();

  const filterQs = (extra: Record<string, string>) => {
    const params = new URLSearchParams();
    if (sp.q) params.set("q", sp.q);
    if (island) params.set("island", island);
    if (date) params.set("date", date);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (pay) params.set("pay", pay);
    if (showFilter) params.set("show", showFilter);
    if (door) params.set("door", door);
    if (allDates) params.set("all", "1");
    if (sp.sort) params.set("sort", sp.sort);
    if (sp.dir) params.set("dir", sp.dir);
    if (includeCancelled && pay !== "cancelled") params.set("include_cancelled", "1");
    for (const [k, v] of Object.entries(extra)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    const s = params.toString();
    return s ? `/dashboard/show-ops/bookings?${s}` : "/dashboard/show-ops/bookings";
  };

  const fourWeeks = !allDates && !tonightOnly && from === today && to === fourWeekEnd;
  const windowLabel = allDates
    ? "all dates"
    : tonightOnly
      ? date
      : `${from} → ${to}`;
  const deskRows: BookingsDeskRow[] = (rows ?? []).map((r) => {
    const payView = showOpsBookingPayView({
      billingMode: r.billing_mode,
      totalCost: Number(r.total_cost),
      balanceRemaining: Number(r.balance_remaining),
      nettTotal: r.nett_total == null ? null : Number(r.nett_total),
      paymentStatus: r.payment_status,
      cancelledAt: r.cancelled_at,
    });
    const doorPay = showOpsDoorPayPhrase(r.door_pay_method);
    const arrival = showOpsArrivalMark({
      adults: r.adults,
      children: r.children,
      infants: r.infants,
      arrivedPax: r.arrived_pax,
      arrivedAt: r.arrived_at,
      noShow: r.no_show,
    });
    return {
      id: r.id,
      bookingRef: r.booking_ref,
      guestName: r.guest_name,
      guestMobile: r.guest_mobile,
      guestEmail: r.guest_email,
      showName: r.show_name,
      island: r.island,
      showDate: r.show_date,
      dayName: showOpsDayName(r.show_date, "short"),
      hotelName: r.hotel_name,
      pickupStop: r.pickup_stop_name,
      pickupTime: r.pickup_time ? String(r.pickup_time).slice(0, 5) : null,
      pax: formatShowOpsPax(r.adults, r.children, r.infants),
      arrival,
      price: money(Number(r.total_cost), r.island),
      paid: payView.paidAmount == null ? "—" : money(payView.paidAmount, r.island),
      outstanding: payView.outstandingAmount == null ? "—" : money(payView.outstandingAmount, r.island),
      statusLabel: payView.label,
      statusClass: payBadgeClass(payView.label),
      doorLabel: `${arrival.doorLabel}${doorPay ? ` · ${doorPay}` : ""}`,
      diet: r.dietary_required ? r.dietary_notes || "Diet" : null,
      comments: r.office_comments,
      ticket: r.supplier_ticket_number,
      supplier: r.supplier_name,
      paymentMethod: r.payment_method ? (SHOW_OPS_PAYMENT_METHOD_LABELS as Record<string, string>)[r.payment_method] ?? r.payment_method : null,
      pickupKind: r.pickup_kind ?? null,
      channel: r.sales_channel,
      transport: Boolean(r.transport_required),
      deposit: money(Number(r.deposit_amount), r.island),
      billing: r.billing_mode === "invoice" ? "Invoice" : "Deposit",
      cancelled: Boolean(r.cancelled_at),
      arrived: Boolean(r.arrived_at),
      doorPay: r.door_pay_method,
      noShow: Boolean(r.no_show),
      alreadyPaid: r.billing_mode === "deposit" && r.payment_status === "paid",
    };
  });
  const sort: Record<string, BookingsDeskSort> = Object.fromEntries(
    ["ref", "name", "show", "date", "stop", "price", "outstanding", "supplier"].map((k) => {
      const active = sortKey === k;
      const nextDir: "asc" | "desc" = active && !ascending ? "asc" : "desc";
      return [
        k,
        {
          href: filterQs({ sort: k, dir: active ? nextDir : k === "date" ? "asc" : "desc", page: "" }),
          active,
          dir: (active ? (ascending ? "asc" : "desc") : null) as BookingsDeskSort["dir"],
        },
      ];
    }),
  );

  const filteredAway = Boolean(q || island || showFilter || pay || door || allDates || tonightOnly || !fourWeeks);

  return (
    <div className="space-y-6">
      <ShowOpsPageHeader
        eyebrow="Operations"
        title="Bookings"
        subtitle={`Staff desk · ${windowLabel} · ${total} matching. Click a row for more, then Edit if you need to change it.`}
        actions={
          <>
            <a
              href={csvHref({ q: sp.q, island, date, from, to, pay, include_cancelled: includeCancelled ? "1" : "", show: showFilter, all: allDates ? "1" : "" })}
              className={SHOW_OPS_GHOST_BTN}
            >
              Download CSV
            </a>
            <ShowOpsNewBookingButton />
          </>
        }
      />
      <div className="flex flex-wrap gap-2">
        <ShowOpsPill href={`/dashboard/show-ops/bookings?date=${today}`} on={tonightOnly}>
          Tonight
        </ShowOpsPill>
        <ShowOpsPill href="/dashboard/show-ops/bookings" on={fourWeeks}>
          4 weeks
        </ShowOpsPill>
        <ShowOpsPill href="/dashboard/show-ops/bookings?all=1" on={allDates}>
          All dates
        </ShowOpsPill>
      </div>
      {sp.created ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Created {sp.created}</p>
      ) : null}
      {sp.cancelled ? (
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-800">Booking cancelled.</p>
      ) : null}

      <ShowOpsLiveFilterForm
        action="/dashboard/show-ops/bookings"
        className="print:hidden sticky top-0 z-10 rounded-2xl bg-white/95 p-4 shadow-sm ring-1 ring-slate-200/80 backdrop-blur"
      >
        {/* Narrow screens keep the swipeable strip; from lg up the controls wrap
            onto a second row so every filter is visible without scrolling. */}
        <div className="flex gap-3 overflow-x-auto pb-1 lg:overflow-x-visible">
          <div className="flex min-w-max items-end gap-3 lg:min-w-0 lg:flex-wrap lg:gap-x-3 lg:gap-y-2">
        <label className="text-xs font-medium text-slate-600">
          Search
          <input
            name="q"
            type="search"
            defaultValue={sp.q || ""}
            placeholder="Name, ref, show, partner, hotel, stop, email…"
            className="mt-1 block min-w-[16rem] rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs font-medium text-slate-600">
          From
          <input
            name="from"
            type="date"
            defaultValue={from}
            className="mt-1 block rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs font-medium text-slate-600">
          To
          <input
            name="to"
            type="date"
            defaultValue={to}
            className="mt-1 block rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs font-medium text-slate-600">
          Show
          <select
            name="show"
            defaultValue={showFilter}
            className="mt-1 block min-w-[12rem] rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          >
            <option value="">All shows</option>
            {showOptions.map((s) => (
              <option key={s.name} value={s.name}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">
          Island
          <select
            name="island"
            defaultValue={island}
            className="mt-1 block min-w-[10rem] rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          >
            <option value="">All islands</option>
            {ctx.config.islands.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">
          Pay
          <select
            name="pay"
            defaultValue={pay}
            className="mt-1 block min-w-[9rem] rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          >
            <option value="">All</option>
            <option value="unpaid">Unpaid</option>
            <option value="partial">Part paid</option>
            <option value="paid">Paid</option>
            <option value="invoice">Invoice</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">
          Door
          <select
            name="door"
            defaultValue={door}
            className="mt-1 block min-w-[9rem] rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          >
            <option value="">All</option>
            <option value="in">Turned up</option>
            <option value="cash">Paid cash</option>
            <option value="unpaid">Still to collect</option>
            <option value="absent">Absent</option>
          </select>
        </label>
        {tonightOnly ? <input type="hidden" name="date" value={date} /> : null}
        {allDates ? <input type="hidden" name="all" value="1" /> : null}
        {sp.sort ? <input type="hidden" name="sort" value={sp.sort} /> : null}
        {sp.dir ? <input type="hidden" name="dir" value={sp.dir} /> : null}
        <button type="submit" className="rounded-xl bg-[var(--show-ops-primary,#7c3aed)] px-4 py-2 text-sm font-semibold text-white shadow-sm">
          Filter
        </button>
        {filteredAway ? (
          <Link href="/dashboard/show-ops/bookings" className="text-sm text-slate-500 underline">
            Clear
          </Link>
        ) : null}
          </div>
        </div>
      </ShowOpsLiveFilterForm>

      <TicketScanner />

      <BookingsDeskTable rows={deskRows} sort={sort} />

      {total > PAGE_SIZE ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
          <p>
            {fromIdx + 1}–{Math.min(toIdx + 1, total)} of {total}
          </p>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link href={filterQs({ page: String(page - 1) })} className="underline">
                Previous
              </Link>
            ) : null}
            {page < lastPage ? (
              <Link href={filterQs({ page: String(page + 1) })} className="underline">
                Next
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
