"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { ArrivalPaxForm } from "@/components/show-ops/arrival-pax-form";
import { ListFlagButton } from "@/components/show-ops/list-flag-button";
import { cn } from "@/lib/utils";
import type { ShowOpsArrivalMark } from "@/lib/show-ops/calc";

export type BookingsDeskRow = {
  id: string;
  bookingRef: string;
  guestName: string;
  guestMobile: string | null;
  guestEmail: string | null;
  showName: string;
  island: string;
  showDate: string;
  dayName: string | null;
  hotelName: string | null;
  pickupStop: string | null;
  pickupTime: string | null;
  pax: string;
  arrival: ShowOpsArrivalMark;
  price: string;
  paid: string;
  outstanding: string;
  statusLabel: string;
  statusClass: string;
  doorLabel: string;
  diet: string | null;
  comments: string | null;
  ticket: string | null;
  supplier: string | null;
  channel: string | null;
  transport: boolean;
  deposit: string;
  billing: string;
  cancelled: boolean;
  arrived: boolean;
  doorPay: string | null;
  noShow: boolean;
  alreadyPaid: boolean;
};

export type BookingsDeskSort = { href: string; active: boolean; dir: "asc" | "desc" | null };

export function BookingsDeskTable({
  rows,
  sort,
}: {
  rows: BookingsDeskRow[];
  sort: Record<string, BookingsDeskSort>;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const groups = useMemo(() => {
    const out: { date: string; dayName: string | null; rows: BookingsDeskRow[] }[] = [];
    for (const row of rows) {
      const last = out[out.length - 1];
      if (!last || last.date !== row.showDate) {
        out.push({ date: row.showDate, dayName: row.dayName, rows: [row] });
      } else {
        last.rows.push(row);
      }
    }
    return out;
  }, [rows]);

  const doorCount = useMemo(() => {
    const live = rows.filter((r) => !r.cancelled);
    return {
      total: live.length,
      marked: live.filter((r) => r.arrival.status !== "pending").length,
      inPax: live.reduce((n, r) => n + (r.arrival.arrived ?? 0), 0),
      bookedPax: live.reduce((n, r) => n + r.arrival.booked, 0),
    };
  }, [rows]);

  return (
    <>
      {/* ── Door mode: phones + iPads ─────────────────── */}
      <div className="lg:hidden">
        <div className="sticky top-0 z-20 mb-2 flex items-center justify-between gap-3 rounded-xl bg-slate-900 px-4 py-2.5 text-white shadow-sm">
          <span className="text-sm font-semibold">
            {doorCount.inPax} / {doorCount.bookedPax} people in
          </span>
          <span className="text-xs text-white/60">
            {doorCount.marked} of {doorCount.total} bookings marked
          </span>
        </div>
        <div className="space-y-3">
          {groups.map((group) => (
            <div key={group.date}>
              <p className="sticky top-14 z-10 mb-1.5 rounded-lg bg-slate-100/95 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600 backdrop-blur">
                {group.dayName ? `${group.dayName} · ` : ""}
                {group.date}
                <span className="ml-2 font-normal normal-case text-slate-500">
                  {group.rows.length} booking{group.rows.length === 1 ? "" : "s"}
                </span>
              </p>
              <div className="space-y-2">
                {group.rows.map((r) => (
                  <DoorCard key={r.id} row={r} open={openId === r.id} onToggle={() => setOpenId((c) => (c === r.id ? null : r.id))} />
                ))}
              </div>
            </div>
          ))}
          {!rows.length ? (
            <p className="rounded-2xl bg-white px-4 py-10 text-center text-sm text-slate-500 ring-1 ring-slate-200">
              No bookings in this window.
            </p>
          ) : null}
        </div>
      </div>

      {/* ── Desk mode: laptop and up ──────────────────── */}
      <div className="hidden overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200 lg:block">
      <div className="max-h-[min(70vh,52rem)] overflow-auto">
        <table className="min-w-[60rem] w-full text-left text-sm">
          <thead className="sticky top-0 z-20 border-b bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="w-8 px-2 py-2" />
              <SortTh col={sort.ref} label="Ref" />
              <SortTh col={sort.name} label="Name" />
              <SortTh col={sort.show} label="Show" />
              <SortTh col={sort.date} label="Date" />
              <SortTh col={sort.stop} label="Pick-up" />
              <th className="px-2 py-2">Pax</th>
              <SortTh col={sort.price} label="Price" right />
              <th className="px-2 py-2 text-right">Paid</th>
              <SortTh col={sort.outstanding} label="Outstanding" right />
              <th className="px-2 py-2">Status</th>
              <th className="px-2 py-2">Door</th>
              <th className="px-2 py-2 print:hidden">Mark</th>
              <SortTh col={sort.supplier} label="Supplier" />
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <DateGroup
                key={group.date}
                group={group}
                openId={openId}
                onToggle={(id) => setOpenId((cur) => (cur === id ? null : id))}
              />
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={15} className="px-3 py-8 text-center text-slate-500">
                  No bookings in this window.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      </div>
    </>
  );
}

/** One booking as a tappable card — this is what the door and the bus guides use. */
function DoorCard({ row, open, onToggle }: { row: BookingsDeskRow; open: boolean; onToggle: () => void }) {
  const tone =
    row.cancelled
      ? "bg-slate-50 ring-slate-200 opacity-60"
      : row.arrival.status === "all_in"
        ? "bg-emerald-50 ring-emerald-200"
        : row.arrival.status === "partial"
          ? "bg-amber-50 ring-amber-200"
          : row.arrival.status === "absent"
            ? "bg-rose-50 ring-rose-200"
            : "bg-white ring-slate-200";
  const settled = row.alreadyPaid || Boolean(row.doorPay);
  return (
    <div className={cn("rounded-2xl px-4 py-3 shadow-sm ring-1", tone)}>
      <button type="button" onClick={onToggle} className="flex w-full items-start justify-between gap-3 text-left">
        <span className="min-w-0">
          <span className={cn("block truncate text-base font-semibold text-slate-900", row.cancelled && "line-through")}>
            {row.guestName}
          </span>
          <span className="mt-0.5 block truncate text-xs text-slate-500">
            {row.showName}
            {row.pickupStop ? ` · ${row.pickupTime || "—"} ${row.pickupStop}` : " · own way"}
          </span>
          {row.diet ? (
            <span className="mt-1 inline-block rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-800">
              {row.diet}
            </span>
          ) : null}
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-lg font-semibold tabular-nums text-slate-900">{row.pax}</span>
          <span
            className={cn(
              "block text-[11px] font-semibold",
              row.arrival.status === "pending" && "text-slate-400",
              row.arrival.status === "partial" && "text-amber-800",
              row.arrival.status === "all_in" && "text-emerald-800",
              row.arrival.status === "absent" && "text-rose-700",
            )}
          >
            {row.arrival.status === "pending" ? "not marked" : row.arrival.shortLabel}
          </span>
        </span>
      </button>

      {row.cancelled ? (
        <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Cancelled</p>
      ) : (
        <div className="mt-3 space-y-2">
          <ArrivalPaxForm key={`${row.id}:${row.arrival.arrived}`} bookingId={row.id} mark={row.arrival} big />
          <div className="flex flex-wrap gap-2">
            <ListFlagButton bookingId={row.id} flag="cash" label="Paid cash" hide={settled} big />
            <ListFlagButton bookingId={row.id} flag="card" label="Paid card" hide={settled} tone="sky" big />
            <ListFlagButton bookingId={row.id} flag="cash" label="Undo cash" hide={row.doorPay !== "cash"} undo big />
            <ListFlagButton bookingId={row.id} flag="card" label="Undo card" hide={row.doorPay !== "card"} undo big />
          </div>
        </div>
      )}

      {open ? (
        <div className="mt-3 space-y-2 border-t border-slate-200/70 pt-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <Detail label="Ref" value={row.bookingRef} />
            <Detail label="Pax" value={row.pax} />
            <Detail label="Hotel" value={row.hotelName} />
            <Detail label="Pick-up" value={row.pickupStop ? `${row.pickupTime || "—"} · ${row.pickupStop}` : "Own way"} />
            <Detail label="Mobile" value={row.guestMobile} />
            <Detail label="Supplier" value={row.supplier} />
            <Detail label="Outstanding" value={row.outstanding} />
            <Detail label="Ticket #" value={row.ticket} />
          </div>
          {row.comments ? <Detail label="Office notes" value={row.comments} /> : null}
          <div className="flex gap-2 pt-1">
            {row.guestMobile ? (
              <a
                href={`tel:${row.guestMobile.replace(/\s+/g, "")}`}
                className="flex min-h-[44px] flex-1 items-center justify-center rounded-lg bg-white px-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-200"
              >
                Call guest
              </a>
            ) : null}
            <Link
              href={`/dashboard/show-ops/bookings/${row.id}`}
              className="flex min-h-[44px] flex-1 items-center justify-center rounded-lg px-3 text-sm font-semibold text-white"
              style={{ backgroundColor: "var(--show-ops-primary,#7c3aed)" }}
            >
              Edit booking
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DateGroup({
  group,
  openId,
  onToggle,
}: {
  group: { date: string; dayName: string | null; rows: BookingsDeskRow[] };
  openId: string | null;
  onToggle: (id: string) => void;
}) {
  return (
    <>
      <tr className="sticky top-9 z-10 bg-slate-100/95">
        <td colSpan={15} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
          {group.dayName ? `${group.dayName} · ` : ""}
          {group.date}
          <span className="ml-2 font-normal normal-case text-slate-500">
            {group.rows.length} booking{group.rows.length === 1 ? "" : "s"}
          </span>
        </td>
      </tr>
      {group.rows.map((r) => (
        <BookingRows key={r.id} row={r} open={openId === r.id} onToggle={() => onToggle(r.id)} />
      ))}
    </>
  );
}

function BookingRows({
  row,
  open,
  onToggle,
}: {
  row: BookingsDeskRow;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className={cn(
          "cursor-pointer border-b border-slate-100 hover:bg-slate-50",
          row.cancelled && "text-slate-400 line-through",
          open && "bg-teal-50/40 hover:bg-teal-50/40",
          !row.cancelled && row.arrival.status === "partial" && !open && "bg-amber-50/70",
          !row.cancelled && row.arrival.status === "all_in" && !open && "bg-emerald-50/40",
          !row.cancelled && row.arrival.status === "absent" && !open && "bg-slate-100 text-slate-500",
        )}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a,button,form,input,select,textarea,label")) return;
          onToggle();
        }}
      >
        <td className="px-2 py-2">
          <button
            type="button"
            aria-expanded={open}
            aria-label={open ? "Hide booking details" : "Show booking details"}
            className="grid h-7 w-7 place-items-center rounded-md text-slate-500 hover:bg-slate-200"
            onClick={onToggle}
          >
            <span className={cn("block text-xs transition-transform", open && "rotate-90")}>▶</span>
          </button>
        </td>
        <td className="px-2 py-2 font-mono text-xs">{row.bookingRef}</td>
        <td className="px-2 py-2 font-medium text-slate-900">
          {row.guestName}
          {row.hotelName ? <span className="block text-xs font-normal text-slate-500">{row.hotelName}</span> : null}
        </td>
        <td className="px-2 py-2">
          {row.showName}
          <span className="block text-xs text-slate-500">{row.island}</span>
        </td>
        <td className="px-2 py-2 whitespace-nowrap">
          {row.showDate}
          <span className="block text-xs text-slate-500">{row.dayName}</span>
        </td>
        <td className="max-w-[11rem] px-2 py-2 text-xs">
          {row.pickupStop ? (
            <>
              {row.pickupTime ? <span className="font-semibold whitespace-nowrap">{row.pickupTime}</span> : "—"}
              <span className="block text-slate-500">{row.pickupStop}</span>
            </>
          ) : (
            <span className="text-slate-400">own way</span>
          )}
        </td>
        <td className="px-2 py-2 whitespace-nowrap">
          <span className="font-medium text-slate-900">{row.pax}</span>
          {row.arrival.status === "pending" ? (
            <span className="block text-[11px] text-slate-400">not marked</span>
          ) : (
            <span
              className={cn(
                "block text-[11px] font-semibold",
                row.arrival.status === "partial" && "text-amber-800",
                row.arrival.status === "all_in" && "text-emerald-800",
                row.arrival.status === "absent" && "text-rose-700",
              )}
            >
              {row.arrival.shortLabel}
              {row.arrival.status === "partial" && row.arrival.missing ? ` · ${row.arrival.missing} missing` : ""}
            </span>
          )}
        </td>
        <td className="px-2 py-2 text-right tabular-nums">{row.price}</td>
        <td className="px-2 py-2 text-right tabular-nums">{row.paid}</td>
        <td className="px-2 py-2 text-right tabular-nums font-medium">
          {row.outstanding}
          {row.statusLabel === "Invoice" ? (
            <span className="block text-[10px] font-normal uppercase tracking-wide text-slate-400">nett</span>
          ) : null}
        </td>
        <td className="px-2 py-2">
          <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-medium", row.statusClass)}>
            {row.statusLabel}
          </span>
          {row.diet ? <span className="mt-1 block text-[11px] text-amber-800">{row.diet}</span> : null}
        </td>
        <td className="px-2 py-2 whitespace-nowrap text-xs">{row.doorLabel}</td>
        <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
          {row.cancelled ? null : (
            <StaffMarks
              bookingId={row.id}
              arrival={row.arrival}
              doorPay={row.doorPay}
              alreadyPaid={row.alreadyPaid}
            />
          )}
        </td>
        <td className="px-2 py-2">{row.supplier ?? "—"}</td>
        <td className="px-2 py-2 text-right">
          <Link
            href={`/dashboard/show-ops/bookings/${row.id}`}
            className="text-xs font-medium text-[var(--show-ops-primary,#7c3aed)] underline"
          >
            Edit
          </Link>
        </td>
      </tr>
      {open ? (
        <tr className="border-b border-slate-200 bg-slate-50/80">
          <td colSpan={15} className="px-4 py-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Detail label="Mobile" value={row.guestMobile} />
              <Detail label="Email" value={row.guestEmail} />
              <Detail label="Hotel" value={row.hotelName} />
              <Detail label="Pick-up" value={row.pickupStop ? `${row.pickupTime || "—"} · ${row.pickupStop}` : "Own way"} />
              <Detail label="Transport" value={row.transport ? "Bus" : "No transport"} />
              <Detail label="Ticket #" value={row.ticket} />
              <Detail label="Channel" value={row.channel} />
              <Detail label="Billing" value={`${row.billing} · deposit ${row.deposit}`} />
              <Detail label="Diet" value={row.diet} className="sm:col-span-2" />
              <Detail label="Showed up" value={row.arrival.status === "pending" ? "Not marked yet" : row.arrival.doorLabel + (row.arrival.status === "partial" && row.arrival.missing ? ` · ${row.arrival.missing} missing` : "")} />
              <Detail label="Office notes" value={row.comments} className="sm:col-span-2" />
            </div>
            <div className="mt-4">
              <Link
                href={`/dashboard/show-ops/bookings/${row.id}`}
                className="inline-flex rounded-xl bg-[var(--show-ops-primary,#7c3aed)] px-3 py-1.5 text-sm font-semibold text-white"
              >
                Edit booking
              </Link>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function SortTh({ col, label, right = false }: { col?: BookingsDeskSort; label: string; right?: boolean }) {
  if (!col) return <th className={cn("px-2 py-2", right && "text-right")}>{label}</th>;
  return (
    <th className={cn("px-2 py-2", right && "text-right")}>
      <Link href={col.href} className={col.active ? "text-slate-900 underline" : "hover:underline"}>
        {label}
        {col.active ? (col.dir === "asc" ? " ↑" : " ↓") : ""}
      </Link>
    </th>
  );
}

function Detail({
  label,
  value,
  className,
}: {
  label: string;
  value: string | null | undefined;
  className?: string;
}) {
  return (
    <p className={className}>
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <span className="text-sm text-slate-900">{value?.trim() ? value : "—"}</span>
    </p>
  );
}

function StaffMarks({
  bookingId,
  arrival,
  doorPay,
  alreadyPaid,
}: {
  bookingId: string;
  arrival: ShowOpsArrivalMark;
  doorPay: string | null;
  alreadyPaid: boolean;
}) {
  const settled = alreadyPaid || Boolean(doorPay);
  const absent = arrival.status === "absent";
  return (
    <div className="flex min-w-[9.5rem] flex-col gap-1.5">
      <ArrivalPaxForm key={`${bookingId}:${arrival.arrived}`} bookingId={bookingId} mark={arrival} />
      <div className="flex flex-wrap gap-1">
        <ListFlagButton bookingId={bookingId} flag="cash" label="Paid cash" hide={settled || absent} />
        <ListFlagButton bookingId={bookingId} flag="card" label="Paid on card" hide={settled || absent} tone="sky" />
        <ListFlagButton bookingId={bookingId} flag="cash" label="Undo cash" hide={doorPay !== "cash"} undo />
        <ListFlagButton bookingId={bookingId} flag="card" label="Undo on card" hide={doorPay !== "card"} undo />
      </div>
    </div>
  );
}
