import type { BookingPublicContextPayload, PublicFloorTable } from "@/lib/booking-public-context";

/** Guide deposit for table enquiries from floor-plan pricing (cents). */
export function computeTableDepositCents(args: {
  ctx: BookingPublicContextPayload;
  preferredTableLabel: string;
  guestCount: number;
}): number | null {
  const guests = Math.max(1, Math.min(999, Math.floor(args.guestCount)));
  let table: PublicFloorTable | undefined;

  const want = args.preferredTableLabel.trim();
  if (want.length) {
    table = args.ctx.tables.find((t) => t.label.trim() === want);
  }
  if (!table && args.ctx.tables.length === 1) {
    table = args.ctx.tables[0];
  }
  if (!table || table.price_cents <= 0) return null;

  const mode = table.pricing_mode.trim().toLowerCase();
  if (mode === "person") return table.price_cents * guests;
  return table.price_cents;
}
