export type ReportPeriod =
  | "today"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "this_year"
  | "all"
  | "custom"
  | "month";

export type ReportRange = {
  period: ReportPeriod;
  start: string | null;
  end: string | null;
  label: string;
  prevStart: string | null;
  prevEnd: string | null;
  prevLabel: string | null;
};

const PERIODS: ReportPeriod[] = [
  "today",
  "this_week",
  "last_week",
  "this_month",
  "last_month",
  "this_year",
  "all",
  "custom",
  "month",
];

export const REPORT_PERIOD_OPTIONS: Array<{ id: Exclude<ReportPeriod, "custom" | "month">; label: string }> = [
  { id: "today", label: "Today" },
  { id: "this_week", label: "This week" },
  { id: "last_week", label: "Last week" },
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "this_year", label: "This year" },
  { id: "all", label: "All time" },
];

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function utcNoon(isoDate: string): Date {
  return new Date(`${isoDate}T12:00:00Z`);
}

function addDays(isoDate: string, days: number): string {
  const d = utcNoon(isoDate);
  d.setUTCDate(d.getUTCDate() + days);
  return iso(d);
}

function monthStart(ym: string): string {
  return `${ym}-01`;
}

function monthEnd(ym: string): string {
  const d = utcNoon(`${ym}-01`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return iso(d);
}

function shiftMonth(ym: string, delta: number): string {
  const d = utcNoon(`${ym}-01`);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return d.toISOString().slice(0, 7);
}

/** Monday of the UTC week containing `isoDate`. */
export function startOfUtcWeek(isoDate: string): string {
  const d = utcNoon(isoDate);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return iso(d);
}

function parsePeriod(raw: string | undefined): ReportPeriod {
  return PERIODS.includes(raw as ReportPeriod) ? (raw as ReportPeriod) : "this_month";
}

function isYmd(raw: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(raw);
}

export function resolveReportRange(input: {
  period?: string;
  month?: string;
  from?: string;
  to?: string;
  today?: string;
}): ReportRange {
  const today = input.today || new Date().toISOString().slice(0, 10);
  const thisYm = today.slice(0, 7);
  let period = parsePeriod(input.period);

  if (!input.period && input.month) period = "month";
  if (!input.period && input.from && input.to) period = "custom";

  const from = input.from && isYmd(input.from) ? input.from : "";
  const to = input.to && isYmd(input.to) ? input.to : "";

  if (period === "custom") {
    const start = from || to || today;
    const end = to || from || today;
    const [a, b] = start <= end ? [start, end] : [end, start];
    const days = Math.round((utcNoon(b).getTime() - utcNoon(a).getTime()) / 86400000) + 1;
    const prevEnd = addDays(a, -1);
    const prevStart = addDays(prevEnd, -(days - 1));
    return {
      period: "custom",
      start: a,
      end: b,
      label: a === b ? a : `${a} → ${b}`,
      prevStart,
      prevEnd,
      prevLabel: `${prevStart} → ${prevEnd}`,
    };
  }

  if (period === "month") {
    const ym = /^\d{4}-\d{2}$/.test(input.month || "") ? input.month! : thisYm;
    const prev = shiftMonth(ym, -1);
    const d = utcNoon(`${ym}-01`);
    const label = d.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
    return {
      period: "month",
      start: monthStart(ym),
      end: monthEnd(ym),
      label,
      prevStart: monthStart(prev),
      prevEnd: monthEnd(prev),
      prevLabel: prev,
    };
  }

  if (period === "today") {
    return {
      period,
      start: today,
      end: today,
      label: "Today",
      prevStart: addDays(today, -1),
      prevEnd: addDays(today, -1),
      prevLabel: "Yesterday",
    };
  }

  if (period === "this_week") {
    const start = startOfUtcWeek(today);
    const end = addDays(start, 6);
    const prevStart = addDays(start, -7);
    return {
      period,
      start,
      end,
      label: "This week",
      prevStart,
      prevEnd: addDays(prevStart, 6),
      prevLabel: "Last week",
    };
  }

  if (period === "last_week") {
    const thisStart = startOfUtcWeek(today);
    const start = addDays(thisStart, -7);
    const end = addDays(start, 6);
    const prevStart = addDays(start, -7);
    return {
      period,
      start,
      end,
      label: "Last week",
      prevStart,
      prevEnd: addDays(prevStart, 6),
      prevLabel: "Week before",
    };
  }

  if (period === "last_month") {
    const ym = shiftMonth(thisYm, -1);
    const prev = shiftMonth(ym, -1);
    return {
      period,
      start: monthStart(ym),
      end: monthEnd(ym),
      label: utcNoon(`${ym}-01`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }),
      prevStart: monthStart(prev),
      prevEnd: monthEnd(prev),
      prevLabel: prev,
    };
  }

  if (period === "this_year") {
    const y = today.slice(0, 4);
    const prevY = String(Number(y) - 1);
    return {
      period,
      start: `${y}-01-01`,
      end: `${y}-12-31`,
      label: y,
      prevStart: `${prevY}-01-01`,
      prevEnd: `${prevY}-12-31`,
      prevLabel: prevY,
    };
  }

  if (period === "all") {
    return {
      period,
      start: null,
      end: null,
      label: "All time",
      prevStart: null,
      prevEnd: null,
      prevLabel: null,
    };
  }

  const prev = shiftMonth(thisYm, -1);
  return {
    period: "this_month",
    start: monthStart(thisYm),
    end: monthEnd(thisYm),
    label: utcNoon(`${thisYm}-01`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }),
    prevStart: monthStart(prev),
    prevEnd: monthEnd(prev),
    prevLabel: prev,
  };
}

export function reportPeriodHref(
  base: string,
  next: { period: string; from?: string; to?: string; month?: string; island?: string; partner_type?: string },
): string {
  const p = new URLSearchParams();
  p.set("period", next.period);
  if (next.period === "custom") {
    if (next.from) p.set("from", next.from);
    if (next.to) p.set("to", next.to);
  }
  if (next.period === "month" && next.month) p.set("month", next.month);
  if (next.island) p.set("island", next.island);
  if (next.partner_type) p.set("partner_type", next.partner_type);
  const q = p.toString();
  return q ? `${base}?${q}` : base;
}
