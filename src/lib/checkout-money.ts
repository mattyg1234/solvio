/** Stripe Checkout currency for guest deposits (platform default: GBP for UK launch). */
export function checkoutCurrency(): string {
  const raw = process.env.SOLVIO_CHECKOUT_CURRENCY?.trim().toLowerCase();
  if (raw === "eur" || raw === "gbp" || raw === "usd") return raw;
  return "gbp";
}

export function moneySymbol(currency = checkoutCurrency()): string {
  if (currency === "gbp") return "£";
  if (currency === "eur") return "€";
  if (currency === "usd") return "$";
  return "£";
}

export function formatMoney(cents: number, currency = checkoutCurrency()): string {
  const sym = moneySymbol(currency);
  const major = cents / 100;
  const decimals = cents % 100 === 0 ? 0 : 2;
  return `${sym}${major.toFixed(decimals)}`;
}

/** Client-safe display helper (matches server default). */
export function formatMoneyDisplay(cents: number): string {
  return formatMoney(cents, "gbp");
}
