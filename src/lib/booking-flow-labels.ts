/** Human labels for `businesses.booking_flow_kind` (dashboard + public copy). */
export const BOOKING_FLOW_KIND_LABELS: Record<string, string> = {
  restaurant_tables: "Table bookings",
  hosted_events: "Events",
  salon_appointments: "Appointments",
  walk_in_waitlist: "Walk-in enquiries",
  mixed: "Mixed operations",
};

export function bookingFlowKindLabel(kind: string | null | undefined): string | null {
  if (!kind) return null;
  return BOOKING_FLOW_KIND_LABELS[kind] ?? kind;
}
