export const NIGHT_LIST_VIEWS = ["office", "bus", "meals", "door", "sales"] as const;
export type NightListView = (typeof NIGHT_LIST_VIEWS)[number];

export const NIGHT_LIST_CHIPS: Array<{ id: NightListView; label: string; hint: string }> = [
  { id: "office", label: "Office list", hint: "Diet, tickets, refs — check people off" },
  { id: "bus", label: "Bus pick-ups", hint: "Stops, times, move a booking" },
  { id: "meals", label: "Special meals", hint: "Dietary only" },
  { id: "door", label: "Door", hint: "Arrived / cash / card" },
];

const VIEW_SET = new Set<string>(NIGHT_LIST_VIEWS);

export function parseNightListViews(input: { views?: string; tab?: string; diet?: string }): NightListView[] {
  const fromViews = (input.views || "")
    .split(",")
    .map((v) => v.trim())
    .filter((v): v is NightListView => VIEW_SET.has(v));
  if (fromViews.length) return [...new Set(fromViews)];
  if (input.diet === "1" && (!input.tab || input.tab === "office")) return ["meals"];
  if (input.tab && VIEW_SET.has(input.tab)) return [input.tab as NightListView];
  return ["office"];
}

export function toggleNightListView(current: NightListView[], id: NightListView): NightListView[] {
  if (current.includes(id)) {
    const next = current.filter((v) => v !== id);
    return next.length ? next : [id];
  }
  return [...current, id];
}

const SORT_KEYS = new Set(["supplier", "name", "hotel", "show", "time", "diet", "ticket", "ref"]);

export function parseNightListSort(raw: string | undefined, fallback: string[]): string[] {
  const keys = (raw || "")
    .split(",")
    .map((k) => k.trim())
    .filter((k) => SORT_KEYS.has(k));
  return keys.length ? keys : fallback;
}

/** Click a column: add it, or move it to the front if it is already in the list. */
export function clickNightListSort(current: string[], key: string): string[] {
  if (!SORT_KEYS.has(key)) return current;
  if (current[0] === key) return current;
  return [key, ...current.filter((k) => k !== key)];
}
