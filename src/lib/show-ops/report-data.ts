export class ReportLoadError extends Error {}

/** Keep leap-day comparisons within the previous year's calendar month. */
export function previousYearDate(iso: string | null): string | null {
  if (!iso) return null;
  const [year, month, day] = iso.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year - 1, month, 0)).getUTCDate();
  return `${year - 1}-${String(month).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

/** Offset pagination for authenticated report queries. Order each query by a unique key.
 * Read until empty, not until short: the server may cap below our requested page size.
 * Oversized reports fail explicitly instead of returning misleading partial totals.
 */
export async function loadReportRows<T>(
  label: string,
  fetchPage: (offset: number, limit: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  maxRows = 100_000,
): Promise<{ data: T[] }> {
  const rows: T[] = [];
  for (;;) {
    const result = await fetchPage(rows.length, 500);
    if (result.error || !result.data) throw new ReportLoadError(`Could not load ${label}. Please refresh and try again.`);
    if (!result.data.length) return { data: rows };
    if (rows.length + result.data.length > maxRows) {
      throw new ReportLoadError(`Too many records for ${label}. Choose a shorter report period or one island.`);
    }
    rows.push(...result.data);
  }
}
