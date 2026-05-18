/** Feature flags saved after onboarding wizard. Empty backend object = legacy full nav. */

export type PlatformCapabilityKey =
  | "appointments"
  | "events"
  | "tables"
  | "ai_receptionist"
  | "lead_generation";

export type ResolvedPlatformCapabilities = Record<PlatformCapabilityKey, boolean>;

const ALL_TRUE: ResolvedPlatformCapabilities = {
  appointments: true,
  events: true,
  tables: true,
  ai_receptionist: true,
  lead_generation: true,
};

/**
 * `{}` from DB or legacy rows → show entire product surface until the wizard explicitly saves booleans.
 */
export function resolvePlatformCapabilities(raw: unknown): ResolvedPlatformCapabilities {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...ALL_TRUE };
  }

  const o = raw as Record<string, unknown>;
  const keys = Object.keys(o);
  const known = keys.filter((k): k is PlatformCapabilityKey =>
    ["appointments", "events", "tables", "ai_receptionist", "lead_generation"].includes(k),
  );
  if (known.length === 0) {
    return { ...ALL_TRUE };
  }

  return {
    appointments: Boolean(o.appointments ?? false),
    events: Boolean(o.events ?? false),
    tables: Boolean(o.tables ?? false),
    ai_receptionist: Boolean(o.ai_receptionist ?? false),
    lead_generation: Boolean(o.lead_generation ?? false),
  };
}

export function businessNeedsOnboarding(primaryBusiness: { onboarding_completed_at: string | null } | null): boolean {
  return Boolean(primaryBusiness && !primaryBusiness.onboarding_completed_at);
}
