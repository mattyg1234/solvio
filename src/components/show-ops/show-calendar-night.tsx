import Link from "next/link";

import { closeSaleAction, reopenSaleAction, upsertBusOrderAction } from "@/app/dashboard/show-ops/actions";
import { FillPill } from "@/components/show-ops/ops-home-widgets";
import { SHOW_OPS_PRIMARY_BTN } from "@/components/show-ops/show-ops-page-header";
import { SubmitOnce } from "@/components/show-ops/submit-once";
import { NumberInput } from "@/components/ui/number-input";
import type { CalendarDay } from "@/lib/show-ops/calendar";
import { formatShowOpsMoney, round2, showOpsDayName } from "@/lib/show-ops/calc";
import type { ShowOpsCurrency } from "@/lib/show-ops/types";

export type NightBookingRow = {
  id: string;
  booking_ref: string | null;
  guest_name: string;
  show_name: string | null;
  supplier_name: string | null;
  hotel_name: string | null;
  pickup_stop_name: string | null;
  adults: number;
  children: number;
  infants: number;
  transport_required: boolean;
  island: string;
};

export type NightCloseRow = {
  id: string;
  show_date: string;
  island: string;
  product_id: string | null;
  close_kind: "part" | "full";
};

export function calendarCellSummary(day: CalendarDay) {
  const names = [...new Set(day.islands.flatMap((i) => i.shows.map((s) => s.name)))];
  const title =
    names.length === 0 ? (day.hasShow ? "Show" : "—") : names.length === 1 ? names[0] : `${names[0]} +${names.length - 1}`;
  const capacity =
    day.islands.length === 1 && day.islands[0]?.shows.length === 1 ? day.islands[0].shows[0].capacity : null;
  const busLeft = day.islands.reduce<number | null>((sum, i) => {
    if (i.busLeft == null) return sum;
    return (sum ?? 0) + i.busLeft;
  }, null);
  const closed = day.islands.some((i) => i.closeKind === "full" || i.shows.some((s) => s.closeKind === "full"))
    ? "full"
    : day.islands.some((i) => i.closeKind === "part" || i.shows.some((s) => s.closeKind === "part"))
      ? "part"
      : null;
  return { title, pax: day.pax, capacity, busLeft, closed, showCount: names.length };
}

export function ShowCalendarNight({
  day,
  nextUrl,
  island,
  canClose,
  emailsLive,
  currency,
  bookings,
  closes,
  busOrders,
}: {
  day: CalendarDay;
  nextUrl: string;
  island: string;
  canClose: boolean;
  emailsLive?: boolean;
  currency: ShowOpsCurrency;
  bookings: NightBookingRow[];
  closes: NightCloseRow[];
  busOrders: Array<{ show_date: string; island: string; seats_ordered: number; bus_count?: number | null; cost_total: number | null }>;
}) {
  const money = (n: number) => formatShowOpsMoney(n, currency);
  const islandQuery = island ? `&island=${encodeURIComponent(island)}` : "";

  return (
    <section id="night-fold" className="scroll-mt-20 border-t border-violet-200 bg-violet-50/80 px-3 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-800">
            {showOpsDayName(day.iso)} {day.iso}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {day.pax} pax on shows · {day.busPax} on the bus · {bookings.length}{" "}
            {bookings.length === 1 ? "booking" : "bookings"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link
            href={`/dashboard/show-ops/bookings?date=${day.iso}${islandQuery}`}
            className="rounded-full bg-white px-3 py-1.5 ring-1 ring-slate-200"
          >
            Bookings
          </Link>
          <Link
            href={`/dashboard/show-ops/buses?date=${day.iso}${islandQuery}`}
            className="rounded-full bg-white px-3 py-1.5 ring-1 ring-slate-200"
          >
            Bus board
          </Link>
          <Link href={`/dashboard/show-ops/lists?date=${day.iso}`} className="rounded-full bg-white px-3 py-1.5 ring-1 ring-slate-200">
            Night lists
          </Link>
        </div>
      </div>

      {!day.islands.length ? (
        <p className="mt-4 text-sm text-slate-500">No show scheduled this night. Set run nights under Shows, or add a bus order below.</p>
      ) : null}

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {day.islands.map((isl) => {
          const order = busOrders.find((o) => o.show_date === day.iso && o.island === isl.island);
          const islandCloses = closes.filter((c) => c.show_date === day.iso && c.island === isl.island);
          return (
            <article key={isl.island} className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-slate-900">{isl.island}</h3>
                <p className="text-xs font-semibold text-slate-600">
                  Bus {isl.busPax}
                  {isl.seatsOrdered != null
                    ? ` · ${Math.max(1, Number(order?.bus_count) || 1)} bus${Math.max(1, Number(order?.bus_count) || 1) === 1 ? "" : "es"} · ${isl.seatsOrdered} seats ordered · ${isl.busLeft} left`
                    : " · not ordered yet"}
                  {isl.busCost
                    ? ` · ${money(isl.busCost)}${isl.busPax ? ` · ${money(round2(isl.busCost / isl.busPax))}/head` : ""}`
                    : ""}
                </p>
              </div>

              <ul className="mt-3 space-y-2">
                {isl.shows.map((sh) => {
                  const showClose = islandCloses.find((c) => c.product_id === sh.productId);
                  const islandClose = islandCloses.find((c) => c.product_id == null);
                  const close = showClose || islandClose;
                  return (
                    <li key={sh.productId} className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-medium text-slate-900">{sh.name}</p>
                          <p className="text-xs text-slate-500">
                            {sh.pax} sold{sh.capacity != null ? ` / ${sh.capacity}` : ""}
                            {sh.capacity != null ? ` · ${Math.max(0, sh.capacity - sh.pax)} left` : ""}
                          </p>
                        </div>
                        {sh.closeKind ? (
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${sh.closeKind === "full" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-900"}`}>
                            {sh.closeKind === "full" ? "Closed" : "Part closed"}
                          </span>
                        ) : <FillPill fill={sh.fill} />}
                      </div>
                      {close ? (
                        canClose ? (
                          <form action={reopenSaleAction} className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                            <input type="hidden" name="id" value={close.id} />
                            <input type="hidden" name="show_date" value={day.iso} />
                            <input type="hidden" name="island" value={isl.island} />
                            <input type="hidden" name="next" value={nextUrl} />
                            <span className="rounded-full bg-rose-100 px-2 py-0.5 font-semibold text-rose-800">
                              {close.close_kind === "full" ? "Full close" : "Part close"}
                            </span>
                            <SubmitOnce className="rounded-lg bg-white px-2 py-1 font-medium text-slate-700 ring-1 ring-slate-200 disabled:opacity-60">
                              {showClose && islandClose ? "Remove show closure" : islandClose ? "Reopen island" : "Reopen"}
                            </SubmitOnce>
                          </form>
                        ) : (
                          <p className="mt-2 text-xs font-semibold text-rose-800">
                            {close.close_kind === "full" ? "Full close — partners cannot book" : "Part close — last seats only"}
                          </p>
                        )
                      ) : canClose ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {(["part", "full"] as const).map((kind) => (
                            <form key={kind} action={closeSaleAction}>
                              <input type="hidden" name="show_date" value={day.iso} />
                              <input type="hidden" name="island" value={isl.island} />
                              <input type="hidden" name="product_id" value={sh.productId} />
                              <input type="hidden" name="close_kind" value={kind} />
                              <input type="hidden" name="next" value={nextUrl} />
                              <SubmitOnce
                                className={`rounded-lg px-2.5 py-1 text-xs font-semibold disabled:opacity-60 ${
                                  kind === "full" ? "bg-rose-700 text-white" : "bg-amber-100 text-amber-950"
                                }`}
                              >
                                {kind === "full" ? (emailsLive ? "Full close + email" : "Full close") : emailsLive ? "Part close + email" : "Part close"}
                              </SubmitOnce>
                            </form>
                          ))}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>

              <form action={upsertBusOrderAction} className="mt-4 flex flex-wrap items-end gap-2 text-xs">
                <input type="hidden" name="show_date" value={day.iso} />
                <input type="hidden" name="island" value={isl.island} />
                <input type="hidden" name="next" value={nextUrl} />
                <label className="font-medium text-slate-600">
                  Buses
                  <NumberInput
                    min={1}
                    name="bus_count"
                    defaultValue={order ? Math.max(1, Number(order.bus_count) || 1) : 1}
                    className="mt-1 block w-16 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="font-medium text-slate-600">
                  Seats ordered
                  <NumberInput
                    min={0}
                    name="seats_ordered"
                    defaultValue={isl.seatsOrdered ?? ""}
                    className="mt-1 block w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="font-medium text-slate-600">
                  Bus cost
                  <NumberInput
                    min={0}
                    name="cost_total"
                    defaultValue={order ? Number(order.cost_total) : ""}
                    className="mt-1 block w-28 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                  />
                </label>
                <SubmitOnce className={`${SHOW_OPS_PRIMARY_BTN} text-xs`}>Save bus for this night</SubmitOnce>
              </form>
            </article>
          );
        })}
      </div>

      {bookings.length > 0 ? (
        <div className="mt-4 overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Ref</th>
                <th className="px-3 py-2">Guest</th>
                <th className="px-3 py-2">Show</th>
                <th className="px-3 py-2">Partner</th>
                <th className="px-3 py-2">Hotel / pick-up</th>
                <th className="px-3 py-2 text-right">Pax</th>
                <th className="px-3 py-2">Bus</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-mono text-[11px]">
                    <Link href={`/dashboard/show-ops/bookings/${row.id}`} className="text-violet-800 hover:underline">
                      {row.booking_ref || row.id.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="px-3 py-2 font-medium text-slate-900">{row.guest_name}</td>
                  <td className="px-3 py-2 text-slate-600">{row.show_name ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-600">{row.supplier_name ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-600">
                    {[row.hotel_name, row.pickup_stop_name].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-800">
                    {row.adults + row.children + row.infants}
                    <span className="ml-1 text-slate-400">
                      ({row.adults}a{row.children ? ` ${row.children}c` : ""}
                      {row.infants ? ` ${row.infants}i` : ""})
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-500">{row.transport_required ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-500">No bookings on this date yet.</p>
      )}
    </section>
  );
}
