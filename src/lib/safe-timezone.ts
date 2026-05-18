/**
 * `Intl` throws `RangeError` for unknown time zone strings (abbreviations like "BST",
 * malformed IANA IDs, legacy labels). Normalize anything untrusted before formatting.
 */

export function coerceValidIanaTimeZone(raw: unknown): string {
  if (typeof raw !== "string") return "UTC";
  const tz = raw.trim();
  if (!tz) return "UTC";
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz }).format(new Date());
    return tz;
  } catch {
    return "UTC";
  }
}
