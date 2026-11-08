/**
 * Year on year (Joel, 8 Nov 2026). Last year's pax per show night and island,
 * imported from Joel's night tracker or the old booking system, live in
 * show_last_year_pax. For any night/island with an imported figure, that figure
 * is used; otherwise Hub bookings on that night count (so once the Hub has a
 * full year of its own, nothing needs importing).
 */

export type LastYearImportRow = { show_date: string; island: string; pax: number };

const ISLAND_ALIASES: Record<string, string> = {
  ace: "Lanzarote",
  lanzarote: "Lanzarote",
  tfs: "Tenerife",
  tenerife: "Tenerife",
  lpa: "Gran Canaria",
  gc: "Gran Canaria",
  "gran canaria": "Gran Canaria",
  uk: "UK Tour",
  "uk tour": "UK Tour",
};

/** ACE / TFS / LPA / GC / island names → the Hub's island name, or null. */
export function lastYearIsland(raw: string, knownIslands: readonly string[] = []): string | null {
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  const known = knownIslands.find((i) => i.toLowerCase() === v);
  return known ?? ISLAND_ALIASES[v] ?? null;
}

/** 2025-11-08, 08/11/2025, 8/11/25 (UK day-first) → 2025-11-08, or null. */
export function lastYearDate(raw: string): string | null {
  const v = raw.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
  let y: number, mo: number, d: number;
  if (m) {
    [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else {
    m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(v);
    if (!m) return null;
    [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (y < 100) y += 2000;
  }
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (c === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else quoted = !quoted;
    } else if ((c === "," || c === ";" || c === "\t") && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/**
 * Reads "date, island, pax" lines (header optional, any column order when a
 * header names them). Same night + island twice is added together. Returns the
 * rows and the line numbers it could not read.
 */
export function parseLastYearCsv(
  text: string,
  knownIslands: readonly string[] = [],
): { rows: LastYearImportRow[]; skipped: number[] } {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  let cols = { date: 0, island: 1, pax: 2 };
  let start = 0;
  const head = splitCsvLine(lines[0] ?? "").map((h) => h.toLowerCase());
  const find = (...names: string[]) => head.findIndex((h) => names.some((n) => h === n || h.includes(n)));
  const hd = find("date", "night"), hi = find("island", "office", "location"), hp = find("pax", "total", "guests");
  if (hd >= 0 && hi >= 0 && hp >= 0) {
    cols = { date: hd, island: hi, pax: hp };
    start = 1;
  } else if (!lastYearDate(splitCsvLine(lines[0] ?? "")[0] ?? "")) {
    start = 1; // unrecognised header line
  }
  const sum = new Map<string, LastYearImportRow>();
  const skipped: number[] = [];
  for (let i = start; i < lines.length; i += 1) {
    if (!lines[i].trim()) continue;
    const cells = splitCsvLine(lines[i]);
    const date = lastYearDate(cells[cols.date] ?? "");
    const island = lastYearIsland(cells[cols.island] ?? "", knownIslands);
    const paxRaw = String(cells[cols.pax] ?? "").replace(/[^\d-]/g, "");
    const pax = paxRaw === "" ? NaN : Number(paxRaw);
    if (!date || !island || !Number.isInteger(pax) || pax < 0) {
      skipped.push(i + 1);
      continue;
    }
    const key = `${date}|${island}`;
    const prev = sum.get(key);
    sum.set(key, { show_date: date, island, pax: (prev?.pax ?? 0) + pax });
  }
  return { rows: [...sum.values()], skipped };
}

/**
 * Last year's pax per night ("YYYY-MM-DD" of last year → pax), all islands in
 * scope added together. Imported figures win for their night + island; Hub
 * bookings fill the rest.
 */
export function lastYearPaxByNight(
  hubRows: Array<{ show_date: string; island: string; pax: number }>,
  imported: LastYearImportRow[],
): Map<string, number> {
  const importedKeys = new Set(imported.map((r) => `${r.show_date}|${r.island}`));
  const out = new Map<string, number>();
  for (const r of imported) out.set(r.show_date, (out.get(r.show_date) ?? 0) + r.pax);
  for (const r of hubRows) {
    if (importedKeys.has(`${r.show_date}|${r.island}`)) continue;
    out.set(r.show_date, (out.get(r.show_date) ?? 0) + r.pax);
  }
  return out;
}

/** +12% style change vs last year, or null when there is nothing to compare with. */
export function yearOnYearPct(now: number, lastYear: number | null): number | null {
  if (lastYear == null || lastYear <= 0) return null;
  return Math.round(((now - lastYear) / lastYear) * 1000) / 10;
}
