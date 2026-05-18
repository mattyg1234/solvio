/**
 * Expand `business_events` rows into occurrence chips for merchant calendar UI,
 * respecting optional `skipped_dates` and `instance_overrides` on `recurrence` JSON.
 */

import { coerceValidIanaTimeZone } from "@/lib/safe-timezone";

const WEEK_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export type ExpandedOccurrence = {
  /** YYYY-MM-DD in venue time zone */
  dateYmd: string;
  starts_at: string;
  ends_at: string;
  skipped: boolean;
  override: boolean;
};

export type ParsedRecurrenceExtras = {
  skipped: Set<string>;
  overrides: Map<string, { starts_at: string; ends_at: string }>;
};

function isYmd(raw: unknown): raw is string {
  return typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.trim());
}

export function parseRecurrenceExtras(rec: unknown): ParsedRecurrenceExtras {
  const skipped = new Set<string>();
  const overrides = new Map<string, { starts_at: string; ends_at: string }>();
  const o = rec && typeof rec === "object" && !Array.isArray(rec) ? (rec as Record<string, unknown>) : null;
  const rawSkipped = o?.skipped_dates ?? o?.skippedDates;
  if (Array.isArray(rawSkipped)) {
    for (const x of rawSkipped) {
      if (isYmd(x)) skipped.add(x.trim());
    }
  }
  const rawOv = o?.instance_overrides ?? o?.instanceOverrides;
  if (Array.isArray(rawOv)) {
    for (const row of rawOv) {
      const r = row && typeof row === "object" && !Array.isArray(row) ? (row as Record<string, unknown>) : null;
      const ds = typeof r?.date === "string" ? r.date.trim() : "";
      const sa = typeof r?.starts_at === "string" ? r.starts_at : typeof r?.startsAt === "string" ? r.startsAt : "";
      const ea = typeof r?.ends_at === "string" ? r.ends_at : typeof r?.endsAt === "string" ? r.endsAt : "";
      if (!isYmd(ds) || !sa || !ea) continue;
      const s = Date.parse(sa);
      const e = Date.parse(ea);
      if (Number.isNaN(s) || Number.isNaN(e)) continue;
      overrides.set(ds, { starts_at: new Date(s).toISOString(), ends_at: new Date(e).toISOString() });
    }
  }
  return { skipped, overrides };
}

export function recurrenceCoreForWrite(rec: unknown): Record<string, unknown> {
  const base =
    rec && typeof rec === "object" && !Array.isArray(rec) ? ({ ...(rec as Record<string, unknown>) } as Record<string, unknown>) : { type: "once" };

  delete base.skipped_dates;
  delete base.skippedDates;
  delete base.instance_overrides;
  delete base.instanceOverrides;
  return base;
}

export function addSkippedDate(recurrence: Record<string, unknown>, dateYmd: string): Record<string, unknown> {
  const { skipped } = parseRecurrenceExtras(recurrence);
  skipped.add(dateYmd.trim());
  return { ...recurrence, skipped_dates: [...skipped].sort() };
}

export function removeSkippedDate(recurrence: Record<string, unknown>, dateYmd: string): Record<string, unknown> {
  const { skipped } = parseRecurrenceExtras(recurrence);
  skipped.delete(dateYmd.trim());
  const next = [...skipped].sort();
  if (next.length === 0) {
    const { skipped_dates: _sd, skippedDates: _sd2, ...rest } = recurrence;
    void _sd;
    void _sd2;
    return { ...rest };
  }
  return { ...recurrence, skipped_dates: next };
}

export function setInstanceOverride(
  recurrence: Record<string, unknown>,
  dateYmd: string,
  startsIso: string,
  endsIso: string,
): Record<string, unknown> {
  const { overrides } = parseRecurrenceExtras(recurrence);
  overrides.set(dateYmd.trim(), { starts_at: startsIso, ends_at: endsIso });
  const merged = [...overrides.entries()]
    .map(([date, pair]) => ({ date, starts_at: pair.starts_at, ends_at: pair.ends_at }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return { ...recurrence, instance_overrides: merged };
}

export function clearInstanceOverride(recurrence: Record<string, unknown>, dateYmd: string): Record<string, unknown> {
  const { overrides } = parseRecurrenceExtras(recurrence);
  overrides.delete(dateYmd.trim());
  const merged = [...overrides.entries()]
    .map(([date, pair]) => ({ date, starts_at: pair.starts_at, ends_at: pair.ends_at }))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (merged.length === 0) {
    const {
      instance_overrides: _io,
      instanceOverrides: _io2,
      ...rest
    } = recurrence;
    void _io;
    void _io2;
    return { ...rest };
  }
  return { ...recurrence, instance_overrides: merged };
}

export function formatYmdInTimeZone(date: Date, timeZone: string): string {
  const zone = coerceValidIanaTimeZone(timeZone);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** 0 = Sunday … 6 = Saturday, evaluated in `timeZone`. */
export function dowSunday0(date: Date, timeZone: string): number {
  const zone = coerceValidIanaTimeZone(timeZone);
  const wd = date.toLocaleDateString("en-US", { weekday: "short", timeZone: zone });
  const idx = (WEEK_SHORT as readonly string[]).indexOf(wd);
  return idx >= 0 ? idx : 0;
}

function parseYmdToUtcMidday(ymd: string): number {
  const [y, m, d] = ymd.split("-").map((x) => Number(x));
  if (!y || !m || !d) return NaN;
  return Date.UTC(y, m - 1, d, 12, 0, 0);
}

function diffDaysYmdUtc(aYmd: string, bYmd: string): number {
  const a = parseYmdToUtcMidday(aYmd);
  const b = parseYmdToUtcMidday(bYmd);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
}

const DAY_MS = 86400000;

function recurType(rec: Record<string, unknown>): string {
  const t = rec.type;
  return typeof t === "string" ? t : "once";
}

/** Cap how far ahead we synthesize occurrences — keeps UI predictable. */
const MAX_EXPAND_DAYS = 370;

export function expandBusinessEventOccurrences(
  startsAtIso: string,
  endsAtIso: string,
  recurrenceUnknown: unknown,
  timeZone: string,
  rangeStart: Date,
  rangeEnd: Date,
): ExpandedOccurrence[] {
  const start = Date.parse(startsAtIso);
  const endAnchor = Date.parse(endsAtIso);
  if (Number.isNaN(start) || Number.isNaN(endAnchor)) return [];

  const durationMs = Math.max(0, endAnchor - start);
  const rec =
    recurrenceUnknown && typeof recurrenceUnknown === "object" && !Array.isArray(recurrenceUnknown)
      ? (recurrenceUnknown as Record<string, unknown>)
      : ({ type: "once" } as Record<string, unknown>);
  const { skipped, overrides } = parseRecurrenceExtras(rec);
  const type = recurType(rec);

  const rs = rangeStart.getTime();
  const re = rangeEnd.getTime();

  const outMap = new Map<string, ExpandedOccurrence>();

  const commitOccurrence = (dateYmd: string, anchorStartMs: number) => {
    const ov = overrides.get(dateYmd);
    let sMs = ov ? Date.parse(ov.starts_at) : anchorStartMs;
    let eMs = ov ? Date.parse(ov.ends_at) : anchorStartMs + durationMs;
    if (Number.isNaN(sMs) || Number.isNaN(eMs)) {
      sMs = anchorStartMs;
      eMs = anchorStartMs + durationMs;
    }
    if (Number.isNaN(sMs)) return;
    if (Number.isNaN(eMs)) eMs = sMs + durationMs;
    if (eMs < sMs) eMs = sMs + durationMs;
    if (sMs < rs || sMs > re) return;
    outMap.set(dateYmd, {
      dateYmd,
      starts_at: new Date(sMs).toISOString(),
      ends_at: new Date(eMs).toISOString(),
      skipped: skipped.has(dateYmd),
      override: Boolean(ov),
    });
  };

  if (type === "once") {
    const ymdOnce = formatYmdInTimeZone(new Date(start), timeZone);
    commitOccurrence(ymdOnce, start);
    return [...outMap.values()].sort((a, b) => a.dateYmd.localeCompare(b.dateYmd));
  }

  const anchorYmd = formatYmdInTimeZone(new Date(start), timeZone);
  const anchorStartUtc = start;

  if (type === "daily" || type === "weekly") {
    const weekdays =
      type === "weekly"
        ? Array.isArray(rec.weekdays)
          ? rec.weekdays.filter((x): x is number => typeof x === "number" && Number.isFinite(x))
          : []
        : null;

    const scanStartMs = Math.min(rs, anchorStartUtc) - DAY_MS * 21;
    const scanEndMs = Math.max(re, anchorStartUtc) + DAY_MS * MAX_EXPAND_DAYS;

    for (let tMs = scanStartMs; tMs <= scanEndMs; tMs += DAY_MS) {
      const probeYmd = formatYmdInTimeZone(new Date(tMs), timeZone);
      const dayDiff = diffDaysYmdUtc(anchorYmd, probeYmd);
      if (dayDiff < 0) continue;

      const occMs = anchorStartUtc + dayDiff * DAY_MS;
      if (weekdays && weekdays.length) {
        if (!weekdays.includes(dowSunday0(new Date(occMs), timeZone))) continue;
      }

      commitOccurrence(probeYmd, occMs);
    }

    /** Extra dates modeled only via overrides stay visible */
    for (const [ymd, pair] of overrides) {
      const s = Date.parse(pair.starts_at);
      if (!Number.isNaN(s) && s >= rs && s <= re) {
        commitOccurrence(ymd, s);
      }
    }

    return [...outMap.values()].sort((a, b) => a.dateYmd.localeCompare(b.dateYmd));
  }

  /** Unknown recurrence shapes — fallback to treating as one-off-ish anchor */
  const fallbackYmd = formatYmdInTimeZone(new Date(start), timeZone);
  commitOccurrence(fallbackYmd, start);
  return [...outMap.values()].sort((a, b) => a.dateYmd.localeCompare(b.dateYmd));
}
