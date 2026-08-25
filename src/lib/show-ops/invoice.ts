import { round2 } from "@/lib/show-ops/calc";

export type ShowOpsInvoiceStatus = "draft" | "issued" | "voided";
export type ShowOpsVerifactuStatus = "not_sent" | "queued" | "recorded" | "error" | "manual";
export type ShowOpsInvoiceLineKind = "booking" | "manual";

export type RecalcInvoiceLineInput = {
  adults?: number;
  children?: number;
  adultUnit?: number;
  childUnit?: number;
  quantity?: number;
  unitPrice?: number;
  vatRate?: number;
};

export type RecalcInvoiceLineResult = {
  adults: number;
  children: number;
  adultUnit: number;
  childUnit: number;
  quantity: number;
  unitPrice: number;
  adultNettTotal: number;
  childNettTotal: number;
  netTotal: number;
  vatRate: number;
  vatAmount: number;
  lineTotal: number;
};

function n(v: unknown, fallback = 0): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

/** Line money: booking (adults/children × unit) or extra (qty × unit). VAT is on the net. */
export function recalcInvoiceLine(input: RecalcInvoiceLineInput): RecalcInvoiceLineResult {
  const vatRate = Math.max(0, n(input.vatRate));
  const hasBookingUnits =
    input.adults != null || input.children != null || input.adultUnit != null || input.childUnit != null;
  const adults = Math.max(0, Math.trunc(n(input.adults)));
  const children = Math.max(0, Math.trunc(n(input.children)));
  const adultUnit = round2(Math.max(0, n(input.adultUnit)));
  const childUnit = round2(Math.max(0, n(input.childUnit)));

  let adultNettTotal = 0;
  let childNettTotal = 0;
  let netTotal = 0;
  let quantity = 0;
  let unitPrice = 0;

  if (hasBookingUnits && (adults > 0 || children > 0 || input.quantity == null)) {
    adultNettTotal = round2(adults * adultUnit);
    childNettTotal = round2(children * childUnit);
    netTotal = round2(adultNettTotal + childNettTotal);
    quantity = adults + children;
    unitPrice = quantity > 0 ? round2(netTotal / quantity) : round2(Math.max(0, n(input.unitPrice)));
  } else {
    quantity = round2(Math.max(0, n(input.quantity)));
    unitPrice = round2(Math.max(0, n(input.unitPrice)));
    netTotal = round2(quantity * unitPrice);
  }

  const vatAmount = round2(netTotal * (vatRate / 100));
  return {
    adults,
    children,
    adultUnit,
    childUnit,
    quantity,
    unitPrice,
    adultNettTotal,
    childNettTotal,
    netTotal,
    vatRate,
    vatAmount,
    lineTotal: round2(netTotal + vatAmount),
  };
}

export function sumInvoiceLines(
  lines: Array<Pick<RecalcInvoiceLineResult, "netTotal" | "vatAmount" | "lineTotal">>,
): { netTotal: number; vatTotal: number; grandTotal: number } {
  const netTotal = round2(lines.reduce((s, l) => s + n(l.netTotal), 0));
  const vatTotal = round2(lines.reduce((s, l) => s + n(l.vatAmount), 0));
  return { netTotal, vatTotal, grandTotal: round2(netTotal + vatTotal) };
}

export function formatInvoiceNumber(series: string, year: number, sequence: number): string {
  const s = (series || "INV").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12) || "INV";
  const seq = Math.max(1, Math.trunc(sequence));
  return `${s}-${year}-${String(seq).padStart(4, "0")}`;
}

export function nextInvoiceSequence(existingNumbers: string[], series: string, year: number): number {
  const prefix = `${(series || "INV").trim().toUpperCase().replace(/[^A-Z0-9]/g, "") || "INV"}-${year}-`;
  let max = 0;
  for (const raw of existingNumbers) {
    const n = String(raw || "");
    if (!n.startsWith(prefix)) continue;
    const seq = Number(n.slice(prefix.length));
    if (Number.isInteger(seq) && seq > max) max = seq;
  }
  return max + 1;
}

export function invoiceIsLocked(input: {
  status: string | null | undefined;
  paid: boolean;
  voided: boolean;
  verifactuStatus?: string | null;
}): boolean {
  if (input.voided || input.paid) return true;
  if (input.status === "issued" || input.status === "voided") return true;
  if (input.verifactuStatus === "recorded") return true;
  return false;
}

export type VerifactuParty = {
  name: string;
  taxId: string;
  address?: string;
};

export type VerifactuLine = {
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  netTotal: number;
  vatAmount: number;
  lineTotal: number;
};

export type VerifactuPayload = {
  invoiceType: "F1";
  series: string;
  number: string;
  invoiceDate: string;
  issuer: VerifactuParty;
  recipient: VerifactuParty;
  currency: string;
  lines: VerifactuLine[];
  totals: { netTotal: number; vatTotal: number; grandTotal: number };
};

export function buildVerifactuPayload(input: {
  series: string;
  invoiceNumber: string;
  invoiceDate: string;
  issuerName: string;
  issuerTaxId: string;
  issuerAddress?: string;
  recipientName: string;
  recipientTaxId: string;
  recipientAddress?: string;
  currency: string;
  lines: VerifactuLine[];
  netTotal: number;
  vatTotal: number;
  grandTotal: number;
}): VerifactuPayload {
  return {
    invoiceType: "F1",
    series: input.series,
    number: input.invoiceNumber,
    invoiceDate: input.invoiceDate,
    issuer: {
      name: input.issuerName,
      taxId: input.issuerTaxId,
      address: input.issuerAddress || undefined,
    },
    recipient: {
      name: input.recipientName,
      taxId: input.recipientTaxId,
      address: input.recipientAddress || undefined,
    },
    currency: (input.currency || "EUR").toUpperCase(),
    lines: input.lines.map((l) => ({
      description: l.description,
      quantity: round2(n(l.quantity)),
      unitPrice: round2(n(l.unitPrice)),
      vatRate: round2(n(l.vatRate)),
      netTotal: round2(n(l.netTotal)),
      vatAmount: round2(n(l.vatAmount)),
      lineTotal: round2(n(l.lineTotal)),
    })),
    totals: {
      netTotal: round2(n(input.netTotal)),
      vatTotal: round2(n(input.vatTotal)),
      grandTotal: round2(n(input.grandTotal)),
    },
  };
}

export function calendarMonthBounds(isoDate = new Date().toISOString().slice(0, 10)): {
  start: string;
  end: string;
} {
  const [y, m] = isoDate.split("-").map(Number);
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { start, end };
}

export function shiftMonth(isoDate: string, delta: number): string {
  const [y, m] = isoDate.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 10);
}
