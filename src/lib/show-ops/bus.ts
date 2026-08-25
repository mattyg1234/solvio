import { isoWeekday } from "@/lib/show-ops/nights";

const DAY_ALIAS: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

/** Parse "Tue,Fri" / "Monday" into UTC weekday numbers (0=Sun). */
export function parseStopRunsOn(runsOn: string | null | undefined): number[] {
  if (!runsOn?.trim()) return [];
  const parts = runsOn.split(/[,&/]+/).map((p) => p.trim().toLowerCase()).filter(Boolean);
  const days: number[] = [];
  for (const part of parts) {
    const key = part.replace(/[^a-z]/g, "");
    const n = DAY_ALIAS[key] ?? DAY_ALIAS[key.slice(0, 3)];
    if (n == null || days.includes(n)) continue;
    days.push(n);
  }
  return days;
}

/** Stops with no runs_on appear every night. Dated stops only appear on those weekdays. */
export function stopRunsOnDate(runsOn: string | null | undefined, showDate: string | null | undefined): boolean {
  const days = parseStopRunsOn(runsOn);
  if (!days.length || !showDate) return true;
  return days.includes(isoWeekday(showDate));
}

type PickupFilterStop = {
  id: string;
  island?: string | null;
  runs_on?: string | null;
};

/** Booking / list dropdown: same island, runs that night, always keep the already-chosen stop. */
export function pickupStopOffered(
  stop: PickupFilterStop,
  opts: { island?: string | null; showDate?: string | null; selectedId?: string | null },
): boolean {
  if (opts.selectedId && stop.id === opts.selectedId) return true;
  if (opts.island && stop.island && stop.island !== opts.island) return false;
  return stopRunsOnDate(stop.runs_on, opts.showDate);
}
