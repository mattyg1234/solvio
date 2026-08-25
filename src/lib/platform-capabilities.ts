/** Feature flags saved after onboarding wizard. Empty backend object = legacy full nav. */

export type PlatformCapabilityKey =
  | "appointments"
  | "events"
  | "tables"
  | "ai_receptionist"
  | "lead_generation"
  | "show_ops";

export type ResolvedPlatformCapabilities = Record<PlatformCapabilityKey, boolean>;

const ALL_TRUE: ResolvedPlatformCapabilities = {
  appointments: true,
  events: true,
  tables: true,
  ai_receptionist: true,
  lead_generation: true,
  show_ops: false, // opt-in product — venues don't see Show Ops until enabled
};

const KNOWN: PlatformCapabilityKey[] = [
  "appointments",
  "events",
  "tables",
  "ai_receptionist",
  "lead_generation",
  "show_ops",
];

/**
 * `{}` from DB or legacy rows → show entire venue product surface until the wizard explicitly saves booleans.
 * Show Ops stays off unless `show_ops` is true or `show_ops_enabled` is set on the business (checked in nav).
 */
export function resolvePlatformCapabilities(raw: unknown): ResolvedPlatformCapabilities {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...ALL_TRUE };
  }

  const o = raw as Record<string, unknown>;
  const keys = Object.keys(o);
  const known = keys.filter((k): k is PlatformCapabilityKey => KNOWN.includes(k as PlatformCapabilityKey));
  if (known.length === 0) {
    return { ...ALL_TRUE };
  }

  return {
    appointments: Boolean(o.appointments ?? false),
    events: Boolean(o.events ?? false),
    tables: Boolean(o.tables ?? false),
    ai_receptionist: Boolean(o.ai_receptionist ?? false),
    lead_generation: Boolean(o.lead_generation ?? false),
    show_ops: Boolean(o.show_ops ?? false),
  };
}

export function businessNeedsOnboarding(primaryBusiness: { onboarding_completed_at: string | null } | null): boolean {
  return Boolean(primaryBusiness && !primaryBusiness.onboarding_completed_at);
}
