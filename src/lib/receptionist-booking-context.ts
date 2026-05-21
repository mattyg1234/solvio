export type ReceptionistBookingContext = {
  publicBookingUrl: string | null;
  bookingFlowLabel: string;
  guestBookingModes: string[];
  /** Stripe Connect live — AI can create bookings and text deposit links on calls. */
  depositSmsEnabled?: boolean;
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
    ctx.depositSmsEnabled
      ? "Deposits are live — you can secure bookings on this call and text a Stripe payment link (never read URLs aloud)."
      : ctx.publicBookingUrl
        ? `Public booking page (only if they insist on self-serve): ${ctx.publicBookingUrl}`
        : "No public booking link is published yet — capture details on the call and tell the team you logged the enquiry.",
    "",
    "When someone wants a table or appointment:",
    "- Ask party size, preferred date and time, name, phone, and any notes (allergies, occasion, accessibility).",
    "- Repeat details back before ending the call.",
    ctx.depositSmsEnabled
      ? [
          "- When they agree to pay a deposit to confirm, call send_deposit_payment_link with their name, date (YYYY-MM-DD), time, party size, and notes.",
          "- That creates their booking and texts them a secure payment link with all details — do NOT read URLs or tell them to visit a website.",
          "- Say: 'I've texted you your booking details and a secure payment link — open the text when you're ready.'",
        ].join("\n")
      : "- Offer the booking page link when they want to confirm online or pay a deposit.",
    "- Never invent availability or prices — if unsure, offer to have the team call back.",
    "",
    "Dashboard purple-mic preview: role-play as a guest (e.g. “table for four Friday at eight”) so the venue owner hears how you handle their flow.",
  ];

  return `${trimmed}\n\n${lines.filter((l) => l !== null).join("\n")}`;
}
