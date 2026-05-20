export type StaffMember = {
  id: string;
  name: string;
};

export function parseStaffMembers(raw: unknown): StaffMember[] {
  if (!Array.isArray(raw)) return [];
  const out: StaffMember[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const o = row as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id.trim() : "";
    const name = typeof o.name === "string" ? o.name.trim() : "";
    if (!id || !name) continue;
    out.push({ id, name });
  }
  return out;
}

export function newStaffMember(name: string): StaffMember {
  return {
    id: crypto.randomUUID(),
    name: name.trim(),
  };
}
