import {
  CHECK_BOOKING_AVAILABILITY_TOOL_NAME,
  CREATE_BOOKING_REQUEST_TOOL_NAME,
  SEND_DEPOSIT_PAYMENT_LINK_TOOL_NAME,
} from "@/lib/booking-guest-call-tools";

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

  const hasBookingPage = Boolean(ctx.publicBookingUrl);

  const lines = [
    "## Solvio booking context",
    ctx.bookingFlowLabel ? `This venue runs ${ctx.bookingFlowLabel}.` : null,
    ctx.guestBookingModes.length
      ? `Online guests can request: ${labelGuestBookingModes(ctx.guestBookingModes)}.`
      : null,
    hasBookingPage
      ? [
          "You have live booking tools wired to the same calendar as the public booking page:",
          `1. ${CHECK_BOOKING_AVAILABILITY_TOOL_NAME} — ALWAYS call this before offering a date or time. Read the JSON message back in plain language.`,
          `2. ${CREATE_BOOKING_REQUEST_TOOL_NAME} — after the guest confirms name, date, time, and party size AND availability was true. Free bookings confirm instantly; deposit bookings return pending_deposit.`,
          ctx.depositSmsEnabled
            ? `3. ${SEND_DEPOSIT_PAYMENT_LINK_TOOL_NAME} — when create_booking_request returns pending_deposit, text the Stripe link (pass bookingRequestId). Never read URLs aloud.`
            : null,
        ]
          .filter(Boolean)
          .join("\n")
      : ctx.depositSmsEnabled
        ? "Deposits are live — capture details on the call; booking page not published yet."
        : "No public booking link is published yet — capture details on the call and tell the team you logged the enquiry.",
    "",
    "Booking flow on every call:",
    "- Ask party size, preferred date and time, name, and any notes (allergies, occasion, accessibility).",
    "- Call check_booking_availability with bookingKind and dateYmd (and timeLocal for tables/appointments).",
    "- Only offer times returned as available — never guess.",
    "- Repeat details back, then call create_booking_request.",
    ctx.depositSmsEnabled
      ? "- If status is pending_deposit, call send_deposit_payment_link with bookingRequestId. Say: 'I've texted you your booking details and a secure payment link — open the text when you're ready.'"
      : "- If no deposit is required, tell them they're confirmed once create_booking_request returns confirmed.",
    "- Never invent availability, prices, or bookings — tools are the source of truth.",
    "",
    "Dashboard purple-mic preview: role-play as a guest (e.g. “table for four Friday at eight”) so the venue owner hears the live calendar flow.",
  ];

  return `${trimmed}\n\n${lines.filter((l) => l !== null).join("\n")}`;
}
