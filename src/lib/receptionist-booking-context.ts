export type ReceptionistBookingContext = {
  publicBookingUrl: string | null;
  bookingFlowLabel: string;
  guestBookingModes: string[];
};

const MODE_LABELS: Record<string, string> = {
  table: "table reservations",
  appointment: "appointments",
  walk_in: "walk-in enquiries",
  event: "hosted events",
};

export function labelGuestBookingModes(modes: string[]): string {
  const labels = modes.map((m) => MODE_LABELS[m] ?? m).filter(Boolean);
  if (!labels.length) return "bookings";
  return labels.join(", ");
}

export function bookingFlowKindLabel(kind: string | null | undefined): string {
  switch (kind) {
    case "restaurant_tables":
      return "restaurant table bookings";
    case "salon_appointments":
      return "salon-style appointments";
    case "hosted_events":
      return "hosted events and ticketed listings";
    case "walk_in_waitlist":
      return "walk-in enquiries";
    case "mixed":
      return "mixed bookings (tables, appointments, events)";
    default:
      return "guest bookings";
  }
}

/** Appended to every merchant Vapi system prompt so voice trials match their public booking page. */
export function appendBookingContextToPrompt(base: string, ctx: ReceptionistBookingContext): string {
  const trimmed = base.trim();
  if (!trimmed) return trimmed;

  const lines = [
    "## Solvio booking context",
    ctx.bookingFlowLabel ? `This venue runs ${ctx.bookingFlowLabel}.` : null,
    ctx.guestBookingModes.length
      ? `Online guests can request: ${labelGuestBookingModes(ctx.guestBookingModes)}.`
      : null,
    ctx.publicBookingUrl
      ? `Public booking page (share with callers who prefer self-serve): ${ctx.publicBookingUrl}`
      : "No public booking link is published yet — capture details on the call and tell the team you logged the enquiry.",
    "",
    "When someone wants a table or appointment:",
    "- Ask party size, preferred date and time, name, phone, and any notes (allergies, occasion, accessibility).",
    "- Repeat details back before ending the call.",
    "- Offer the booking page link when they want to confirm online or pay a deposit.",
    "- Never invent availability or prices — if unsure, offer to have the team call back.",
    "",
    "Dashboard purple-mic preview: role-play as a guest (e.g. “table for four Friday at eight”) so the venue owner hears how you handle their flow.",
  ];

  return `${trimmed}\n\n${lines.filter((l) => l !== null).join("\n")}`;
}
