export type ShowTicketType = {
  id: string;
  business_id: string;
  product_id: string;
  name: string;
  description: string | null;
  adult_price: number;
  child_price: number;
  infant_price: number;
  adult_price_no_transport: number | null;
  child_price_no_transport: number | null;
  infant_price_no_transport: number | null;
  adult_nett: number | null;
  child_nett: number | null;
  transport_available: boolean;
  active: boolean;
};
export function applyTicketType<
  T extends { name: string; transport_available: boolean },
>(product: T, type: ShowTicketType | null): T {
  if (!type) return product;
  return {
    ...product,
    name: `${product.name} · ${type.name}`,
    adult_price: type.adult_price,
    child_price: type.child_price,
    infant_price: type.infant_price,
    adult_price_no_transport: type.adult_price_no_transport,
    child_price_no_transport: type.child_price_no_transport,
    infant_price_no_transport: type.infant_price_no_transport,
    adult_nett: type.adult_nett,
    child_nett: type.child_nett,
    transport_available:
      product.transport_available && type.transport_available,
  };
}
export function parseTicketTypeFields(fd: FormData) {
  const name = String(fd.get("name") ?? "").trim();
  if (!name || name.length > 100)
    throw new Error("Ticket name must be between 1 and 100 characters.");
  const description = String(fd.get("description") ?? "").trim();
  if (description.length > 1000)
    throw new Error("Description must be 1,000 characters or fewer.");
  const amount = (key: string, optional = false) => {
    const raw = String(fd.get(key) ?? "").trim();
    if (!raw && optional) return null;
    const n = Number(raw);
    if (!raw || !Number.isFinite(n) || n < 0 || n > 1000000)
      throw new Error("Prices must be valid amounts between 0 and 1,000,000.");
    return Math.round(n * 100) / 100;
  };
  return {
    name,
    description: description || null,
    adult_price: amount("adult_price")!,
    child_price: amount("child_price")!,
    infant_price: amount("infant_price")!,
    adult_price_no_transport: null,
    child_price_no_transport: null,
    infant_price_no_transport: null,
    transport_available: fd.get("transport_available") === "1",
    active: fd.get("active") !== "0",
  };
}

/** A non-money edit must leave the stored rates and booked ticket wording intact. */
export function ticketBookingSnapshotPatch<T>(
  existing: { show_name: string; ticket_type_name: string | null },
  fresh: {
    show_name: string;
    ticket_type_name: string | null;
    pricing_snapshot: T;
  },
  moneyTouched: boolean,
) {
  return moneyTouched
    ? fresh
    : {
        show_name: existing.show_name,
        ticket_type_name: existing.ticket_type_name,
      };
}

export function ticketTransportAvailable(
  availableNow: boolean,
  productId: string | null | undefined,
  ticketTypeId: string | null | undefined,
  existing?: {
    product_id?: string | null;
    ticket_type_id?: string | null;
    transport_required?: boolean | null;
  },
): boolean {
  return (
    availableNow ||
    Boolean(
      existing?.transport_required &&
      existing.product_id === productId &&
      (existing.ticket_type_id || null) === (ticketTypeId || null),
    )
  );
}
