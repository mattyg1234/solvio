import type { ShowOpsBillingMode, ShowOpsCurrency, ShowProduct, ShowSupplier } from "@/lib/show-ops/types";

export type ShowOpsPriceProduct = Pick<
  ShowProduct,
  | "adult_price"
  | "child_price"
  | "infant_price"
  | "adult_nett"
  | "child_nett"
  | "adult_price_no_transport"
  | "child_price_no_transport"
  | "infant_price_no_transport"
>;

function num(n: unknown, fallback = 0): number {
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
}

function pickUnit(withTransport: number, noTransport: number | null | undefined, transportRequired: boolean): number {
  if (transportRequired) return round2(num(withTransport));
  if (noTransport == null) return round2(num(withTransport));
  return round2(num(noTransport));
}

/** Supplier % wins when it is not 100. Product nett is the 100% fallback. */
export function unitNett(gross: number, productNett: number | null | undefined, invoiceNettPercent: number): number {
  const pct = Number.isFinite(invoiceNettPercent) ? invoiceNettPercent : 100;
  if (pct !== 100) return round2(gross * (pct / 100));
  if (productNett != null && Number.isFinite(Number(productNett))) {
    return round2(Number(productNett));
  }
  return round2(gross);
}

export function computeBookingMoney(input: {
  adults: number;
  children: number;
  infants: number;
  product: ShowOpsPriceProduct | null;
  supplier: Pick<ShowSupplier, "billing_mode" | "deposit_percent" | "invoice_nett_percent"> | null;
  billingMode?: ShowOpsBillingMode;
  transportRequired?: boolean;
}) {
  const adults = Math.max(0, input.adults);
  const children = Math.max(0, input.children);
  const infants = Math.max(0, input.infants);
  const transport = Boolean(input.transportRequired);

  const adultPrice = pickUnit(
    num(input.product?.adult_price),
    input.product?.adult_price_no_transport,
    transport,
  );
  const childPrice = pickUnit(
    num(input.product?.child_price),
    input.product?.child_price_no_transport,
    transport,
  );
  const infantPrice = pickUnit(
    num(input.product?.infant_price),
    input.product?.infant_price_no_transport,
    transport,
  );
  const total = round2(adults * adultPrice + children * childPrice + infants * infantPrice);

  const mode = input.billingMode ?? input.supplier?.billing_mode ?? "deposit";
  const depositPct = num(input.supplier?.deposit_percent, 30);
  const nettPct = num(input.supplier?.invoice_nett_percent, 100);

  const adultNettUnit = unitNett(adultPrice, input.product?.adult_nett, nettPct);
  const childNettUnit = unitNett(childPrice, input.product?.child_nett, nettPct);
  const adult_nett_total = round2(adults * adultNettUnit);
  const child_nett_total = round2(children * childNettUnit);
  const nett_total = round2(adult_nett_total + child_nett_total);

  if (mode === "invoice") {
    return {
      billing_mode: "invoice" as const,
      total_cost: total,
      deposit_amount: 0,
      balance_remaining: 0,
      nett_total,
      adult_nett_total,
      child_nett_total,
      payment_status: "n_a" as const,
    };
  }

  const deposit_amount = round2(total * (depositPct / 100));
  return {
    billing_mode: "deposit" as const,
    total_cost: total,
    deposit_amount,
    balance_remaining: total,
    nett_total,
    adult_nett_total,
    child_nett_total,
    payment_status: "unpaid" as const,
  };
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function surnameKey(guestName: string): string {
  const parts = guestName.trim().split(/\s+/);
  return (parts[parts.length - 1] || guestName).toLowerCase();
}

export function addDaysIso(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function paxTotal(adults: number, children: number, infants: number): number {
  return Math.max(0, adults) + Math.max(0, children) + Math.max(0, infants);
}

export type ShowOpsArrivalStatus = "pending" | "all_in" | "partial" | "absent";

export type ShowOpsArrivalMark = {
  booked: number;
  arrived: number | null;
  missing: number | null;
  status: ShowOpsArrivalStatus;
  shortLabel: string;
  doorLabel: string;
};

/** Count who showed. Legacy arrived_at / no_show still resolve if arrived_pax was never stored. */
export function resolveArrivedPax(input: {
  adults: number;
  children: number;
  infants: number;
  arrivedPax?: number | null;
  arrivedAt?: string | null;
  noShow?: boolean | null;
}): { booked: number; arrived: number | null } {
  const booked = paxTotal(input.adults, input.children, input.infants);
  if (input.arrivedPax != null && Number.isFinite(Number(input.arrivedPax))) {
    const n = Math.trunc(Number(input.arrivedPax));
    return { booked, arrived: Math.max(0, Math.min(booked, n)) };
  }
  if (input.noShow) return { booked, arrived: 0 };
  if (input.arrivedAt) return { booked, arrived: booked };
  return { booked, arrived: null };
}

export function showOpsArrivalMark(input: {
  adults: number;
  children: number;
  infants: number;
  arrivedPax?: number | null;
  arrivedAt?: string | null;
  noShow?: boolean | null;
}): ShowOpsArrivalMark {
  const { booked, arrived } = resolveArrivedPax(input);
  if (arrived == null) {
    return { booked, arrived: null, missing: null, status: "pending", shortLabel: "", doorLabel: "—" };
  }
  if (arrived <= 0) {
    return {
      booked,
      arrived: 0,
      missing: booked,
      status: "absent",
      shortLabel: `0 / ${booked} showed`,
      doorLabel: "Absent",
    };
  }
  if (arrived >= booked) {
    return {
      booked,
      arrived: booked,
      missing: 0,
      status: "all_in",
      shortLabel: `${booked} / ${booked} showed`,
      doorLabel: "All in",
    };
  }
  const missing = booked - arrived;
  return {
    booked,
    arrived,
    missing,
    status: "partial",
    shortLabel: `${arrived} / ${booked} showed`,
    doorLabel: `${arrived} of ${booked} showed`,
  };
}

export function arrivalFlagPatch(
  arrivedPax: number | null,
  booked: number,
  now: string,
  currentArrivedAt: string | null,
): { arrived_pax: number | null; arrived_at: string | null; no_show: boolean } {
  if (arrivedPax == null) {
    return { arrived_pax: null, arrived_at: null, no_show: false };
  }
  const n = Math.max(0, Math.min(Math.max(0, booked), Math.trunc(arrivedPax)));
  if (n === 0) return { arrived_pax: 0, arrived_at: null, no_show: true };
  return { arrived_pax: n, arrived_at: currentArrivedAt || now, no_show: false };
}

export function parsePaxCount(raw: unknown, label: string): { ok: true; value: number } | { ok: false; error: string } {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    return { ok: false, error: `${label} must be a whole number of 0 or more.` };
  }
  return { ok: true, value: n };
}

export type ShowOpsNoShowCharge = "charge" | "write_off";

export function resolveNoShowCharge(
  chosen: string | null | undefined,
  partnerDefault: string | null | undefined,
): ShowOpsNoShowCharge {
  if (chosen === "charge" || chosen === "write_off") return chosen;
  if (partnerDefault === "write_off") return "write_off";
  return "charge";
}

export type ShowOpsNoShowBilling = {
  missing: number;
  needsDecision: boolean;
  charge: ShowOpsNoShowCharge | null;
  billedTotalCost: number;
  billedNett: number;
  billedAdultNett: number;
  billedChildNett: number;
  invoiceNote: string | null;
};

/** Invoice / analytics amounts after a no-show decision. Booked pax and stored totals stay as history. */
export function applyNoShowBilling(input: {
  booked: number;
  arrived: number | null;
  totalCost: number;
  nettTotal: number;
  adultNettTotal: number;
  childNettTotal: number;
  charge?: ShowOpsNoShowCharge | null;
}): ShowOpsNoShowBilling {
  const booked = Math.max(0, Math.trunc(Number(input.booked) || 0));
  const arrived = input.arrived == null ? null : Math.max(0, Math.min(booked, Math.trunc(Number(input.arrived) || 0)));
  const missing = arrived == null ? 0 : Math.max(0, booked - arrived);
  const charge = input.charge === "charge" || input.charge === "write_off" ? input.charge : null;
  const full = {
    missing,
    needsDecision: false,
    charge,
    billedTotalCost: round2(input.totalCost),
    billedNett: round2(input.nettTotal),
    billedAdultNett: round2(input.adultNettTotal),
    billedChildNett: round2(input.childNettTotal),
    invoiceNote: null as string | null,
  };
  if (arrived == null || missing <= 0 || booked <= 0) return full;
  if (!charge) return { ...full, needsDecision: true };
  if (charge === "charge") {
    return {
      ...full,
      invoiceNote:
        arrived <= 0
          ? `No-show — charged (${booked} pax)`
          : `No-show — charged (${missing} of ${booked} missing)`,
    };
  }
  const ratio = arrived / booked;
  return {
    missing,
    needsDecision: false,
    charge,
    billedTotalCost: round2(input.totalCost * ratio),
    billedNett: round2(input.nettTotal * ratio),
    billedAdultNett: round2(input.adultNettTotal * ratio),
    billedChildNett: round2(input.childNettTotal * ratio),
    invoiceNote:
      arrived <= 0
        ? `No-show — written off (${booked} pax)`
        : `No-show — ${missing} of ${booked} written off`,
  };
}

export function showOpsCurrencySymbol(currency: ShowOpsCurrency): string {
  if (currency === "gbp") return "£";
  if (currency === "usd") return "$";
  return "€";
}

export function formatShowOpsMoney(amount: number, currency: ShowOpsCurrency = "eur"): string {
  const n = Number.isFinite(amount) ? amount : 0;
  const body = round2(n).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${showOpsCurrencySymbol(currency)}${body}`;
}

export function showOpsAmountToCents(amount: number): number {
  return Math.max(0, Math.round(round2(amount) * 100));
}

export function paymentStatusAfter(totalCost: number, paidSum: number): {
  paid: number;
  balance: number;
  payment_status: "unpaid" | "partial" | "paid";
} {
  const paid = round2(paidSum);
  const balance = round2(Math.max(0, Number(totalCost) - paid));
  const payment_status = balance <= 0 ? "paid" : paid > 0 ? "partial" : "unpaid";
  return { paid, balance, payment_status };
}

export function showOpsAmountDue(input: {
  billingMode: ShowOpsBillingMode;
  totalCost: number;
  depositAmount: number;
  paidSum: number;
}): { amount: number; kind: "deposit" | "balance" | "none" } {
  if (input.billingMode === "invoice") return { amount: 0, kind: "none" };
  const { balance, payment_status } = paymentStatusAfter(input.totalCost, input.paidSum);
  if (payment_status === "paid" || balance <= 0) return { amount: 0, kind: "none" };
  if (input.paidSum <= 0) {
    const deposit = round2(Math.max(0, num(input.depositAmount)));
    if (deposit > 0) return { amount: Math.min(deposit, balance), kind: "deposit" };
  }
  return { amount: balance, kind: "balance" };
}

export function formatShowOpsPax(adults: number, children: number, infants: number): string {
  const parts: string[] = [];
  if (adults > 0) parts.push(`${adults} ad`);
  if (children > 0) parts.push(`${children} ch`);
  if (infants > 0) parts.push(`${infants} inf`);
  return parts.length ? parts.join(" ") : "0";
}

/** Desk labels for the all-bookings view — never raw `n_a`. */
export function showOpsBookingPayView(input: {
  billingMode: string;
  totalCost: number;
  balanceRemaining: number;
  nettTotal: number | null;
  paymentStatus: string;
  cancelledAt: string | null;
}): {
  label: "Cancelled" | "Invoice" | "Paid" | "Part paid" | "Unpaid";
  paidAmount: number | null;
  outstandingAmount: number | null;
} {
  if (input.cancelledAt) {
    return { label: "Cancelled", paidAmount: null, outstandingAmount: null };
  }
  if (input.billingMode === "invoice") {
    return {
      label: "Invoice",
      paidAmount: null,
      outstandingAmount: round2(Number(input.nettTotal ?? 0)),
    };
  }
  const total = round2(Number(input.totalCost) || 0);
  const outstanding = round2(Math.max(0, Number(input.balanceRemaining) || 0));
  const paid = round2(Math.max(0, total - outstanding));
  if (input.paymentStatus === "paid" || outstanding <= 0) {
    return { label: "Paid", paidAmount: total, outstandingAmount: 0 };
  }
  if (input.paymentStatus === "partial" || paid > 0) {
    return { label: "Part paid", paidAmount: paid, outstandingAmount: outstanding };
  }
  return { label: "Unpaid", paidAmount: 0, outstandingAmount: outstanding };
}

/** Weekday name for a YYYY-MM-DD show date, UTC-pinned so it never shifts across timezones. */
export function showOpsDayName(iso: string, style: "long" | "short" = "long"): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString("en-GB", { weekday: style, timeZone: "UTC" });
}

/** Door clock for a scan / arrived_at timestamp (Canaries). */
export function formatShowOpsDoorTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Atlantic/Canary",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/** Door copy: English is "paid on card", never "in card". */
export function showOpsDoorPayPhrase(method: string | null | undefined): string {
  if (method === "card") return "paid on card";
  if (method === "cash") return "paid cash";
  return method ? String(method) : "";
}
