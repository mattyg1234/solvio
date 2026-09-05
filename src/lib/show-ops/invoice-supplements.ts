import { recalcInvoiceLine, type RecalcInvoiceLineResult } from "@/lib/show-ops/invoice";

export function bookingExtrasSummary(raw: unknown): string {
  if (!Array.isArray(raw)) return "";
  return raw.filter((line) => typeof line?.name === "string" && Number(line.quantity) > 0)
    .map((line) => `${line.name} × ${Number(line.quantity)}`).join("; ");
}

/** Separate invoice rows preserve the agreed extra charge without unit division rounding. */
export function invoiceSupplements(input: {
  extras: unknown; infantNett: number; infants: number; booked: number;
  missing: number; writeOff: boolean; vatRate: number;
}): Array<{ description: string; money: RecalcInvoiceLineResult }> {
  const ratio = input.writeOff && input.booked > 0 ? Math.max(0, (input.booked - input.missing) / input.booked) : 1;
  const charges: Array<{ description: string; amount: number }> = [];
  if (input.infantNett > 0) charges.push({ description: `Infant tickets × ${input.infants}`, amount: input.infantNett });
  if (Array.isArray(input.extras)) {
    for (const line of input.extras) {
      if (typeof line?.name !== "string" || !Number.isFinite(Number(line.nett_total)) || Number(line.nett_total) < 0) {
        throw new Error("A booked extra has invalid invoice evidence. Check the booking before invoicing.");
      }
      charges.push({ description: `${line.name} × ${Number(line.quantity)}`, amount: Number(line.nett_total) });
    }
  }
  return charges.map((charge) => ({ description: charge.description, money: recalcInvoiceLine({ quantity: 1, unitPrice: charge.amount * ratio, vatRate: input.vatRate }) }));
}
