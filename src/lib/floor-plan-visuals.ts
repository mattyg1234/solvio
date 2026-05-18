/** Persisted shapes for dashboard + public booking floor preview. Matches `floor_plan_tables.shape` check constraint. */

export type FloorPlanTableShape = "square" | "rectangle" | "circle";

export const FLOOR_PLAN_TABLE_SHAPE_OPTIONS: FloorPlanTableShape[] = ["rectangle", "square", "circle"];

export function coerceFloorPlanShape(v: unknown): FloorPlanTableShape {
  if (v === "square" || v === "rectangle" || v === "circle") return v;
  return "rectangle";
}

/** Clamp and force equal sides for square / circle footprints. */
export function normalizeFloorTableDimensions(
  shape: FloorPlanTableShape,
  width: number,
  height: number,
): { width: number; height: number } {
  const w = Math.round(Math.max(48, Number.isFinite(width) ? width : 120));
  const h = Math.round(Math.max(48, Number.isFinite(height) ? height : 80));
  if (shape === "square" || shape === "circle") {
    const s = Math.max(48, Math.min(w, h));
    return { width: s, height: s };
  }
  return { width: w, height: h };
}

/** Normalize optional hex (#RGB or #RRGGBB) for Postgres `fill_color`; empty / invalid → null. */
export function normalizeFloorTableFillColor(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = raw.trim();
  if (!s.length) return null;
  if (/^#[0-9a-f]{3}$/i.test(s)) {
    const r = s[1],
      g = s[2],
      b = s[3];
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  if (/^#[0-9a-f]{6}$/i.test(s)) {
    return s.toUpperCase();
  }
  return null;
}
