export type ExtraChargeBasis = "per_booking" | "per_person" | "quantity";
export type ShowExtra = {
  id: string;
  business_id: string;
  product_id: string;
  name: string;
  description: string | null;
  unit_price: number;
  charge_basis: ExtraChargeBasis;
  commissionable: boolean;
  active: boolean;
};
export type ExtraSelection = { id: string; quantity: number };
export type ExtraSnapshot = ExtraSelection & {
  name: string;
  unit_price: number;
  charge_basis: ExtraChargeBasis;
  gross_total: number;
  nett_total: number;
  commissionable: boolean;
};
const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export function parseExtraSelections(raw: unknown): ExtraSelection[] {
  let parsed: unknown;
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw || "[]") : (raw ?? []);
  } catch {
    throw new Error("Invalid extras selection.");
  }
  if (!Array.isArray(parsed) || parsed.length > 30)
    throw new Error("Choose up to 30 extras.");
  const seen = new Set<string>();
  return parsed.map((item) => {
    if (
      !item ||
      typeof item !== "object" ||
      typeof item.id !== "string" ||
      !item.id ||
      typeof item.quantity !== "number" ||
      !Number.isInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > 100 ||
      seen.has(item.id)
    )
      throw new Error(
        "Extra quantities must be whole numbers from 1 to 100, without duplicates.",
      );
    seen.add(item.id);
    return { id: item.id, quantity: item.quantity };
  });
}
export function sameExtraSelection(
  a: ExtraSelection[],
  b: ExtraSelection[],
): boolean {
  const signature = (lines: ExtraSelection[]) =>
    JSON.stringify(
      lines
        .map(({ id, quantity }) => ({ id, quantity }))
        .sort((x, y) => x.id.localeCompare(y.id)),
    );
  return signature(a) === signature(b);
}
export function calculateExtras(
  catalogue: ShowExtra[],
  selection: ExtraSelection[],
  pax: number,
  invoiceNettPercent: number,
  options?: { allowArchived?: boolean },
): ExtraSnapshot[] {
  return parseExtraSelections(selection).map(({ id, quantity: requested }) => {
    const item = catalogue.find((extra) => extra.id === id);
    if (!item || (!item.active && !options?.allowArchived))
      throw new Error(
        "An extra is unavailable for this show. Review your selection.",
      );
    const price = Number(item.unit_price);
    if (!Number.isFinite(price) || price < 0 || price > 1000000)
      throw new Error("An extra has an invalid price.");
    const quantity =
      item.charge_basis === "per_person"
        ? pax
        : item.charge_basis === "per_booking"
          ? 1
          : requested;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100000)
      throw new Error("Invalid passenger quantity for extras.");
    const gross_total = round(price * quantity);
    const pct = item.commissionable ? invoiceNettPercent : 100;
    if (!Number.isFinite(pct) || pct < 0 || pct > 100)
      throw new Error("Invalid partner rate for extras.");
    return {
      id,
      name: item.name,
      unit_price: price,
      charge_basis: item.charge_basis,
      quantity,
      gross_total,
      nett_total: round((gross_total * pct) / 100),
      commissionable: item.commissionable,
    };
  });
}
export function parseExtraFields(fd: FormData) {
  const name = String(fd.get("name") ?? "").trim();
  const description = String(fd.get("description") ?? "").trim();
  const raw = String(fd.get("unit_price") ?? "").trim();
  const price = Number(raw);
  const basis = String(fd.get("charge_basis") ?? "");
  if (!name || name.length > 100)
    throw new Error("Extra name must be between 1 and 100 characters.");
  if (description.length > 1000)
    throw new Error("Description must be 1,000 characters or fewer.");
  if (!raw || !Number.isFinite(price) || price < 0 || price > 1000000)
    throw new Error("Price must be between 0 and 1,000,000.");
  if (!["per_booking", "per_person", "quantity"].includes(basis))
    throw new Error("Choose how this extra is charged.");
  return {
    name,
    description: description || null,
    unit_price: round(price),
    charge_basis: basis as ExtraChargeBasis,
    commissionable: fd.get("commissionable") === "1",
    active: fd.get("active") !== "0",
  };
}
