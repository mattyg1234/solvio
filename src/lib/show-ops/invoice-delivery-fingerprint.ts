import { createHash } from "node:crypto";

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]));
  return value;
}

/** Detect invoice or evidence changes between staff preview and the actual send. */
export function invoiceDeliveryFingerprint(invoice: unknown, lines: unknown, evidence: unknown): string {
  return createHash("sha256").update(JSON.stringify(stable({ invoice, lines, evidence }))).digest("hex");
}

export function assertInvoiceDeliveryReviewed(input: { expected: string; actual: string; reviewed: boolean; missingCount: number; missingAcknowledged: boolean }): void {
  if (!input.expected || input.expected !== input.actual) throw new Error("Invoice or ticket photos changed since this preview. Refresh and review before sending.");
  if (!input.reviewed) throw new Error("Review the invoice and ticket attachments before sending.");
  if (input.missingCount && !input.missingAcknowledged) throw new Error(`There are ${input.missingCount} bookings without a ticket photo. Confirm you want to send without those photos.`);
}
