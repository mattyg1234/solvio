/** Format stored cents for an editable € field (empty when zero). */
export function centsToEuroInputValue(cents: number): string {
  if (!Number.isFinite(cents) || cents <= 0) return "";
  const euros = cents / 100;
  return Number.isInteger(euros) ? String(euros) : euros.toFixed(2);
}

/** While typing: digits, one decimal point, up to 2 decimal places. Empty allowed. */
export function sanitizeEuroInput(raw: string): string {
  const normalized = raw.replace(/,/g, ".");
  let out = "";
  let seenDot = false;
  let decimals = 0;

  for (const ch of normalized) {
    if (ch >= "0" && ch <= "9") {
      if (seenDot) {
        if (decimals >= 2) continue;
        decimals += 1;
      }
      out += ch;
      continue;
    }
    if (ch === "." && !seenDot) {
      seenDot = true;
      out += ch;
    }
  }

  return out;
}

/** Parse on save — empty or lone "." → 0 cents. */
export function parseEuroInputToCents(raw: string): number {
  const trimmed = raw.trim().replace(/,/g, ".");
  if (!trimmed || trimmed === ".") return 0;
  const n = Number.parseFloat(trimmed);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

/** Optional prices (e.g. free tickets) — empty → null. */
export function parseOptionalEuroInputToCents(raw: string): number | null {
  const trimmed = raw.trim().replace(/,/g, ".");
  if (!trimmed || trimmed === ".") return null;
  const n = Number.parseFloat(trimmed);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}
