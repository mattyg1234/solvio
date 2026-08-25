import { formatShowOpsMoney, paxTotal, round2 } from "@/lib/show-ops/calc";
import type { ShowOpsCurrency } from "@/lib/show-ops/types";

export type ShowOpsAlert = {
  tone: "danger" | "warning" | "info";
  title: string;
  href?: string;
};

export type ShowOpsMover = {
  name: string;
  pax: number;
  revenue: number;
};

export type ShowOpsTonightIsland = {
  island: string;
  bookings: number;
  pax: number;
  busPax: number;
  seatsOrdered: number | null;
  seatsLeft: number | null;
};

export type ShowOpsShowFill = "full" | "almost" | "open";

export type ShowOpsTonightShow = {
  island: string;
  productId: string | null;
  name: string;
  bookings: number;
  pax: number;
  adults: number;
  children: number;
  infants: number;
  busPax: number;
  capacity: number | null;
  seatsLeft: number | null;
  fill: ShowOpsShowFill;
};

export type ShowOpsAttentionItem = {
  title: string;
  detail: string;
  href: string;
};

export type ShowOpsMonthKpis = {
  tickets: number;
  netSales: number;
  noShows: number;
  outstanding: number;
};

export type ShowOpsTonightArea = {
  island: string;
  resort: string;
  bookings: number;
  busPax: number;
  seatsOrdered: number | null;
  seatsLeft: number | null;
};

export type ShowOpsDashboardModel = {
  today: string;
  tonightBookings: number;
  tonightPax: number;
  tonightBusPax: number;
  islands: ShowOpsTonightIsland[];
  shows: ShowOpsTonightShow[];
  areas: ShowOpsTonightArea[];
  unpaidDepositsCount: number;
  unpaidDepositsAmount: number;
  overdueInvoicesCount: number;
  overdueInvoicesAmount: number;
  topPartners: ShowOpsMover[];
  lowPartners: ShowOpsMover[];
  alerts: ShowOpsAlert[];
  month: ShowOpsMonthKpis;
  attention: ShowOpsAttentionItem[];
};

type BookingRow = {
  show_date: string;
  island: string;
  adults: number;
  children: number;
  infants: number;
  transport_required: boolean;
  billing_mode: string;
  payment_status: string;
  balance_remaining: number;
  total_cost: number;
  nett_total?: number | null;
  supplier_name: string | null;
  product_id: string | null;
  show_name: string;
  pickup_stop_id?: string | null;
  no_show?: boolean | null;
};

export function showOpsFill(pax: number, capacity: number | null): ShowOpsShowFill {
  if (capacity == null || capacity <= 0) return "open";
  if (pax >= capacity) return "full";
  if (pax / capacity >= 0.85) return "almost";
  return "open";
}

type BusOrderRow = {
  show_date: string;
  island: string;
  seats_ordered: number;
};

type InvoiceRow = {
  total_amount: number;
  due_date: string | null;
  paid: boolean;
  supplier_name?: string | null;
};

type ProductRow = {
  id: string;
  name: string;
  island: string;
  capacity: number | null;
  active?: boolean | null;
};

type StopRow = {
  id: string;
  island: string;
  resort: string;
};

export function buildShowOpsDashboard(input: {
  today: string;
  weekStart: string;
  weekEnd: string;
  currency: ShowOpsCurrency;
  bookings: BookingRow[];
  unpaidDeposits: Array<{ balance_remaining: number; deposit_amount?: number; payment_status?: string }>;
  busOrders: BusOrderRow[];
  invoices: InvoiceRow[];
  products: ProductRow[];
  stops?: StopRow[];
  stripeReady: boolean;
  guestStripeEnabled: boolean;
  monthBookings?: BookingRow[];
  uninvoicedCount?: number;
  invoicePeriodLabel?: string;
}): ShowOpsDashboardModel {
  const tonight = input.bookings.filter((b) => b.show_date === input.today);
  const week = input.bookings.filter((b) => b.show_date >= input.weekStart && b.show_date <= input.weekEnd);

  const tonightPax = tonight.reduce((s, b) => s + paxTotal(b.adults, b.children, b.infants), 0);
  const tonightBusPax = tonight
    .filter((b) => b.transport_required)
    .reduce((s, b) => s + paxTotal(b.adults, b.children, b.infants), 0);

  const islandNames = [
    ...new Set([
      ...tonight.map((b) => b.island).filter(Boolean),
      ...input.products.filter((p) => p.active !== false).map((p) => p.island).filter(Boolean),
    ]),
  ].sort();
  const busByIsland = new Map(
    input.busOrders.filter((o) => o.show_date === input.today).map((o) => [o.island, o.seats_ordered]),
  );

  const islands: ShowOpsTonightIsland[] = islandNames.map((island) => {
    const rows = tonight.filter((b) => b.island === island);
    const pax = rows.reduce((s, b) => s + paxTotal(b.adults, b.children, b.infants), 0);
    const busPax = rows
      .filter((b) => b.transport_required)
      .reduce((s, b) => s + paxTotal(b.adults, b.children, b.infants), 0);
    const seatsOrdered = busByIsland.has(island) ? busByIsland.get(island)! : null;
    return {
      island,
      bookings: rows.length,
      pax,
      busPax,
      seatsOrdered,
      seatsLeft: seatsOrdered != null ? seatsOrdered - busPax : null,
    };
  });

  const showKeys = new Map<string, ShowOpsTonightShow>();
  for (const p of input.products.filter((p) => p.active !== false)) {
    const key = `${p.island}|${p.id}`;
    showKeys.set(key, {
      island: p.island,
      productId: p.id,
      name: p.name,
      bookings: 0,
      pax: 0,
      adults: 0,
      children: 0,
      infants: 0,
      busPax: 0,
      capacity: p.capacity,
      seatsLeft: p.capacity,
      fill: showOpsFill(0, p.capacity),
    });
  }
  for (const b of tonight) {
    const key = `${b.island}|${b.product_id || b.show_name}`;
    const cur =
      showKeys.get(key) ||
      ({
        island: b.island,
        productId: b.product_id,
        name: b.show_name,
        bookings: 0,
        pax: 0,
        adults: 0,
        children: 0,
        infants: 0,
        busPax: 0,
        capacity: null,
        seatsLeft: null,
        fill: "open",
      } satisfies ShowOpsTonightShow);
    const pax = paxTotal(b.adults, b.children, b.infants);
    cur.bookings += 1;
    cur.pax += pax;
    cur.adults += Number(b.adults) || 0;
    cur.children += Number(b.children) || 0;
    cur.infants += Number(b.infants) || 0;
    if (b.transport_required) cur.busPax += pax;
    if (cur.capacity != null) cur.seatsLeft = cur.capacity - cur.pax;
    cur.fill = showOpsFill(cur.pax, cur.capacity);
    showKeys.set(key, cur);
  }
  const shows = [...showKeys.values()].sort((a, b) => {
    const i = a.island.localeCompare(b.island);
    if (i !== 0) return i;
    return a.name.localeCompare(b.name);
  });

  const stopById = new Map((input.stops ?? []).map((s) => [s.id, s]));
  const areaMap = new Map<string, ShowOpsTonightArea>();
  for (const b of tonight.filter((row) => row.transport_required)) {
    const stop = b.pickup_stop_id ? stopById.get(b.pickup_stop_id) : null;
    const resort = stop?.resort?.trim() || "No area";
    const island = stop?.island || b.island;
    const key = `${island}|${resort}`;
    const islandSeats = busByIsland.get(island) ?? null;
    const islandBus = islands.find((row) => row.island === island)?.busPax ?? 0;
    const cur =
      areaMap.get(key) ||
      ({
        island,
        resort,
        bookings: 0,
        busPax: 0,
        seatsOrdered: islandSeats,
        seatsLeft: islandSeats != null ? islandSeats - islandBus : null,
      } satisfies ShowOpsTonightArea);
    cur.bookings += 1;
    cur.busPax += paxTotal(b.adults, b.children, b.infants);
    areaMap.set(key, cur);
  }
  const areas = [...areaMap.values()].sort((a, b) => {
    const i = a.island.localeCompare(b.island);
    if (i !== 0) return i;
    return a.resort.localeCompare(b.resort);
  });

  const unpaidDepositsAmount = round2(
    input.unpaidDeposits.reduce((s, b) => {
      const due =
        b.payment_status === "unpaid" ? Number(b.deposit_amount ?? b.balance_remaining ?? 0) : Number(b.balance_remaining || 0);
      return s + due;
    }, 0),
  );

  const overdue = input.invoices.filter((i) => !i.paid && i.due_date && i.due_date < input.today);
  const overdueInvoicesAmount = round2(overdue.reduce((s, i) => s + Number(i.total_amount || 0), 0));

  const byPartner = new Map<string, ShowOpsMover>();
  for (const b of week) {
    const name = b.supplier_name?.trim() || "Direct";
    const cur = byPartner.get(name) || { name, pax: 0, revenue: 0 };
    cur.pax += paxTotal(b.adults, b.children, b.infants);
    cur.revenue += Number(b.total_cost || 0);
    byPartner.set(name, cur);
  }
  const ranked = [...byPartner.values()].sort((a, b) => b.pax - a.pax);
  const topPartners = ranked.slice(0, 3);
  const lowPartners = ranked.length > 3 ? [...ranked].reverse().slice(0, 3) : [];

  const alerts: ShowOpsAlert[] = [];
  for (const row of islands) {
    if (row.busPax > 0 && row.seatsOrdered == null) {
      alerts.push({
        tone: "danger",
        title: `No bus ordered for ${row.island} tonight (${row.busPax} bus pax)`,
        href: "/dashboard/show-ops/master?tab=hotels",
      });
    } else if (row.seatsLeft != null && row.seatsLeft < 0) {
      alerts.push({
        tone: "danger",
        title: `${row.island} bus over capacity by ${Math.abs(row.seatsLeft)}`,
        href: "/dashboard/show-ops/outlook",
      });
    }
  }

  const capByProduct = new Map(input.products.map((p) => [p.id, Number(p.capacity) || 0]));
  const paxByShow = new Map<string, { cap: number; pax: number; name: string }>();
  for (const b of tonight) {
    const cap = b.product_id ? capByProduct.get(b.product_id) || 0 : 0;
    if (cap <= 0) continue;
    const key = `${b.island}|${b.product_id}`;
    const cur = paxByShow.get(key) || { cap, pax: 0, name: b.show_name };
    cur.pax += paxTotal(b.adults, b.children, b.infants);
    paxByShow.set(key, cur);
  }
  for (const v of paxByShow.values()) {
    if (v.pax > v.cap) {
      alerts.push({
        tone: "warning",
        title: `${v.name} is over capacity (${v.pax} / ${v.cap})`,
        href: "/dashboard/show-ops/outlook",
      });
    }
  }

  if (overdue.length) {
    alerts.push({
      tone: "warning",
      title: `${overdue.length} overdue invoice${overdue.length === 1 ? "" : "s"} · ${formatShowOpsMoney(overdueInvoicesAmount, input.currency)}`,
      href: "/dashboard/show-ops/invoices?view=overdue",
    });
  }

  const tonightUnpaid = tonight.filter(
    (b) => b.billing_mode === "deposit" && b.payment_status !== "paid" && b.payment_status !== "n_a",
  );
  if (tonightUnpaid.length) {
    alerts.push({
      tone: "warning",
      title: `${tonightUnpaid.length} unpaid deposit${tonightUnpaid.length === 1 ? "" : "s"} for tonight`,
      href: "/dashboard/show-ops/payments",
    });
  }

  if (input.guestStripeEnabled && !input.stripeReady) {
    alerts.push({
      tone: "info",
      title: "Connect Stripe to email guests a payment link",
      href: "/dashboard/payments",
    });
  }

  const monthRows = input.monthBookings ?? [];
  const monthTickets = monthRows.reduce((s, b) => s + paxTotal(b.adults, b.children, b.infants), 0);
  const monthNetSales = round2(
    monthRows.reduce((s, b) => {
      const nett = Number(b.nett_total);
      if (b.billing_mode === "invoice" && Number.isFinite(nett) && nett > 0) return s + nett;
      return s + Number(b.total_cost || 0);
    }, 0),
  );
  const monthNoShows = monthRows.filter((b) => Boolean(b.no_show)).length;
  const outstanding = round2(unpaidDepositsAmount + overdueInvoicesAmount);
  const month: ShowOpsMonthKpis = {
    tickets: monthTickets,
    netSales: monthNetSales,
    noShows: monthNoShows,
    outstanding,
  };

  const attention: ShowOpsAttentionItem[] = [];
  const noShowGroups = new Map<string, { date: string; name: string; count: number }>();
  for (const b of monthRows.filter((row) => row.no_show)) {
    const key = `${b.show_date}|${b.show_name}`;
    const cur = noShowGroups.get(key) || { date: b.show_date, name: b.show_name, count: 0 };
    cur.count += 1;
    noShowGroups.set(key, cur);
  }
  const noShowList = [...noShowGroups.values()].sort((a, b) => b.date.localeCompare(a.date));
  if (noShowList.length) {
    const top = noShowList[0];
    const totalNs = noShowList.reduce((s, g) => s + g.count, 0);
    attention.push({
      title: `${totalNs} no-show${totalNs === 1 ? "" : "s"} this month`,
      detail: `Latest: ${top.date.slice(8)}/${top.date.slice(5, 7)} · ${top.name}`,
      href: "/dashboard/show-ops/bookings?all=1&door=absent",
    });
  }
  if (overdue.length) {
    const names = [...new Set(overdue.map((i) => i.supplier_name).filter(Boolean) as string[])].slice(0, 3);
    attention.push({
      title: `${overdue.length} overdue invoice${overdue.length === 1 ? "" : "s"}`,
      detail: `${formatShowOpsMoney(overdueInvoicesAmount, input.currency)}${names.length ? ` · ${names.join(", ")}` : ""}`,
      href: "/dashboard/show-ops/invoices?view=overdue",
    });
  }
  if ((input.uninvoicedCount ?? 0) > 0) {
    attention.push({
      title: `${input.invoicePeriodLabel || "This period"} ready`,
      detail: `${input.uninvoicedCount} booking${input.uninvoicedCount === 1 ? "" : "s"} to invoice`,
      href: "/dashboard/show-ops/invoices?view=generate",
    });
  }

  return {
    today: input.today,
    tonightBookings: tonight.length,
    tonightPax,
    tonightBusPax,
    islands,
    shows,
    areas,
    unpaidDepositsCount: input.unpaidDeposits.length,
    unpaidDepositsAmount,
    overdueInvoicesCount: overdue.length,
    overdueInvoicesAmount,
    topPartners,
    lowPartners,
    alerts,
    month,
    attention,
  };
}
