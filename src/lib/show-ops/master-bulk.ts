/** IDs that were ticked and also present on this form. Never falls back to every row. */
export function masterBulkTargets(ticked: string[], formIds: string[]): string[] {
  const allowed = new Set(formIds.filter(Boolean));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ticked) {
    if (!id || !allowed.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function masterBulkTickError(targets: string[]): string | null {
  if (!targets.length) return "Tick the rows to change, or Tick all, then Apply.";
  return null;
}

export function masterRowSaveTargets(intent: string, formIds: string[]): string[] {
  if (intent.startsWith("save:")) {
    const id = intent.slice(5);
    return id && formIds.includes(id) ? [id] : [];
  }
  if (intent === "save_all") return formIds.filter(Boolean);
  return [];
}
