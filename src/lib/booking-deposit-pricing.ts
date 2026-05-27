import type { BookingPublicContextPayload, PublicFloorTable } from "@/lib/booking-public-context";

function resolveTable(
  ctx: BookingPublicContextPayload,
  preferredTableLabel: string,
): PublicFloorTable | undefined {
  const want = preferredTableLabel.trim();
  if (want.length) {
    return ctx.tables.find((t) => t.label.trim() === want);
  }
  if (ctx.tables.length === 1) return ctx.tables[0];
  return undefined;
}

function centsFromTablePricing(
  table: Pick<PublicFloorTable, "pricing_mode" | "price_cents"> & { group_pricing?: unknown },
  guestCount: number,
): number | null {
  if (table.price_cents <= 0) return null;
  const guests = Math.max(1, Math.min(999, Math.floor(guestCount)));
  const mode = table.pricing_mode.trim().toLowerCase();

  if (mode === "person") return table.price_cents * guests;

  if (mode === "group_tier" && table.group_pricing && typeof table.group_pricing === "object") {
    const gp = table.group_pricing as Record<string, unknown>;
    const threshold =
      typeof gp.thresholdPeople === "number"
        ? gp.thresholdPeople
        : Number.parseInt(String(gp.thresholdPeople ?? ""), 10);
    const atOrAbove =
      typeof gp.atOrAboveCents === "number" ? gp.atOrAboveCents : Number.parseInt(String(gp.atOrAboveCents ?? ""), 10);
    const below =
      typeof gp.belowCents === "number" ? gp.belowCents : table.price_cents;
    if (Number.isFinite(threshold) && Number.isFinite(atOrAbove) && atOrAbove > 0) {
      return guests >= threshold ? atOrAbove : below > 0 ? below : table.price_cents;
    }
  }

  return table.price_cents;
}

/** Ticket total for hosted events (price × party size), in cents. */
export function computeEventTicketCents(args: {
  ticketPriceCents: number | null | undefined;
  guestCount: number;
}): number | null {
  const unit = args.ticketPriceCents;
  if (typeof unit !== "number" || unit <= 0) return null;
  const guests = Math.max(1, Math.min(999, Math.floor(args.guestCount)));
  return unit * guests;
}

/** Guide deposit for table enquiries from public booking context (cents). */
export function computeTableDepositCents(args: {
  ctx: BookingPublicContextPayload;
  preferredTableLabel: string;
  guestCount: number;
}): number | null {
  const table = resolveTable(args.ctx, args.preferredTableLabel);
  if (!table) return null;
  return centsFromTablePricing(table, args.guestCount);
}

/** Same pricing rules using raw floor-plan row fields (dashboard / inbox). */
export function computeTableDepositCentsFromTableRow(args: {
  ctx?: BookingPublicContextPayload;
  preferredTableLabel?: string;
  guestCount: number;
  pricingMode?: string;
  priceCents?: number;
  groupPricing?: unknown;
}): number | null {
  if (args.ctx) {
    return computeTableDepositCents({
      ctx: args.ctx,
      preferredTableLabel: args.preferredTableLabel ?? "",
      guestCount: args.guestCount,
    });
  }
  if (args.priceCents == null || args.priceCents <= 0) return null;
  return centsFromTablePricing(
    {
      pricing_mode: args.pricingMode ?? "table",
      price_cents: args.priceCents,
      group_pricing: args.groupPricing,
    },
    args.guestCount,
  );
}
