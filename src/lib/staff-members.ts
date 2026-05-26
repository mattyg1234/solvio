export type StaffMember = {
  id: string;
  name: string;
  /** 0=Sun … 6=Sat. Omit = available every day. */
  weekdays?: number[];
};

/** Mon-first labels for staff schedule grid. */
export const STAFF_SCHEDULE_WEEKDAYS: { weekday: number; label: string; short: string }[] = [
  { weekday: 1, label: "Monday", short: "Mon" },
  { weekday: 2, label: "Tuesday", short: "Tue" },
  { weekday: 3, label: "Wednesday", short: "Wed" },
  { weekday: 4, label: "Thursday", short: "Thu" },
  { weekday: 5, label: "Friday", short: "Fri" },
  { weekday: 6, label: "Saturday", short: "Sat" },
  { weekday: 0, label: "Sunday", short: "Sun" },
];

function parseWeekdays(raw: unknown): number[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const days = raw.filter((d): d is number => typeof d === "number" && Number.isInteger(d) && d >= 0 && d <= 6);
  return days.length ? [...new Set(days)].sort((a, b) => a - b) : undefined;
}

export function parseStaffMembers(raw: unknown): StaffMember[] {
  if (!Array.isArray(raw)) return [];
  const out: StaffMember[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const o = row as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id.trim() : "";
    const name = typeof o.name === "string" ? o.name.trim() : "";
    if (!id || !name) continue;
    const weekdays = parseWeekdays(o.weekdays);
    out.push(weekdays ? { id, name, weekdays } : { id, name });
  }
  return out;
}

export function newStaffMember(name: string): StaffMember {
  return {
    id: crypto.randomUUID(),
    name: name.trim(),
    weekdays: [1, 2, 3, 4, 5],
  };
}

/** Days this staff member is scheduled to work. Omit weekdays = all days. */
export function staffWeekdays(member: StaffMember): number[] {
  if (Array.isArray(member.weekdays)) {
    return [...new Set(member.weekdays)].filter((d) => d >= 0 && d <= 6);
  }
  return [0, 1, 2, 3, 4, 5, 6];
}

export function isStaffWorkingOnWeekday(member: StaffMember, weekday: number): boolean {
  return staffWeekdays(member).includes(weekday);
}

export function toggleStaffWeekday(member: StaffMember, weekday: number, working: boolean): StaffMember {
  const current = new Set(staffWeekdays(member));
  if (working) current.add(weekday);
  else current.delete(weekday);
  const next = [...current].sort((a, b) => a - b);
  if (next.length === 7) return { id: member.id, name: member.name };
  return { id: member.id, name: member.name, weekdays: next };
}
