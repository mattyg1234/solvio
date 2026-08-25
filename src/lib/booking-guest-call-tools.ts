import { vapiToolServerUrl } from "@/lib/deployment-site-url";

export type GuestCallPaymentContext = {
  businessName: string;
  defaultAmountEuro?: number;
};

export const CHECK_BOOKING_AVAILABILITY_TOOL_NAME = "check_booking_availability";
export const CREATE_BOOKING_REQUEST_TOOL_NAME = "create_booking_request";
export const SEND_DEPOSIT_PAYMENT_LINK_TOOL_NAME = "send_deposit_payment_link";

const toolServer = () => ({ url: vapiToolServerUrl() });

export function buildCheckBookingAvailabilityTool() {
  return {
    type: "function",
    function: {
      name: CHECK_BOOKING_AVAILABILITY_TOOL_NAME,
      description:
        "Check live availability against this venue's booking calendar — same rules as their public /book page. Call BEFORE promising a slot. For appointments returns open slots; for tables checks date and time against the diary; for events lists or validates show nights.",
      parameters: {
        type: "object",
        properties: {
          bookingKind: {
            type: "string",
            enum: ["table", "appointment", "event", "walk_in"],
            description: "Type of booking — default table for restaurants.",
          },
          dateYmd: { type: "string", description: "Date to check, YYYY-MM-DD." },
          timeLocal: {
            type: "string",
            description: 'Optional time (e.g. "8pm", "19:30") — required before creating table bookings.',
          },
          partySize: { type: "number", description: "Guests / party size when relevant." },
          preferredTable: { type: "string", description: "Optional table label from the floor plan." },
          serviceName: { type: "string", description: "Appointment service name, if the venue lists services." },
          staffName: { type: "string", description: "Preferred stylist or team member, if offered." },
          hostedEventId: { type: "string", description: "UUID of hosted event — from a prior availability check." },
          hostedOccurrenceStartsAt: {
            type: "string",
            description: "ISO start time of the show occurrence — from check_booking_availability.",
          },
        },
        required: ["bookingKind", "dateYmd"],
      },
    },
    server: toolServer(),
    messages: [
      { type: "request-start", content: "One moment — I'm checking our live diary." },
      { type: "request-failed", content: "I couldn't reach the booking calendar just now — try again in a moment." },
    ],
  };
}

export function buildCreateBookingRequestTool() {
  return {
    type: "function",
    function: {
      name: CREATE_BOOKING_REQUEST_TOOL_NAME,
      description:
        "Create a booking in Solvio after check_booking_availability succeeded and the guest confirmed their details. Free bookings auto-confirm to the diary; deposit bookings return pending_deposit — then call send_deposit_payment_link.",
      parameters: {
        type: "object",
        properties: {
          guestName: { type: "string", description: "Guest full name." },
          guestEmail: { type: "string", description: "Guest email if provided." },
          dateYmd: { type: "string", description: "Booking date YYYY-MM-DD." },
          timeLocal: { type: "string", description: "Time or appointment slot value from availability check." },
          partySize: { type: "number", description: "Party size / guest count." },
          bookingKind: {
            type: "string",
            enum: ["table", "appointment", "event", "walk_in"],
            description: "Booking type.",
          },
          notes: { type: "string", description: "Allergies, occasion, accessibility, etc." },
          preferredTable: { type: "string", description: "Table label when bookingKind is table." },
          serviceName: { type: "string", description: "Service name for appointments." },
          staffName: { type: "string", description: "Preferred staff member." },
          hostedEventId: { type: "string", description: "Hosted event UUID for event bookings." },
          hostedOccurrenceStartsAt: { type: "string", description: "Show occurrence ISO start from availability check." },
        },
        required: ["guestName", "dateYmd", "partySize", "bookingKind"],
      },
    },
    server: toolServer(),
    messages: [
      { type: "request-start", content: "Perfect — I'm adding that to the diary now." },
      { type: "request-failed", content: "That booking couldn't be saved — double-check availability and try again." },
    ],
  };
}

export function buildDepositPaymentLinkTool() {
  return {
    type: "function",
    function: {
      name: SEND_DEPOSIT_PAYMENT_LINK_TOOL_NAME,
      description:
        "Text a Stripe deposit link after create_booking_request returned pending_deposit, or create+text in one step if bookingRequestId is omitted. Never read URLs aloud.",
      parameters: {
        type: "object",
        properties: {
          bookingRequestId: {
            type: "string",
            description: "Booking request id from create_booking_request when deposit is required.",
          },
          guestName: {
            type: "string",
            description: "Guest full name as confirmed on the call.",
          },
          guestEmail: {
            type: "string",
            description: "Guest email if they gave one (optional — a placeholder is used for Stripe if omitted).",
          },
          dateYmd: {
            type: "string",
            description: "Booking date as YYYY-MM-DD (e.g. 2026-06-20).",
          },
          timeLocal: {
            type: "string",
            description: 'Preferred time (e.g. "8pm", "20:00", "7:30 PM").',
          },
          partySize: {
            type: "number",
            description: "Number of guests / party size.",
          },
          bookingKind: {
            type: "string",
            enum: ["table", "appointment", "walk_in", "event"],
            description: "Type of booking — default table for restaurants.",
          },
          notes: {
            type: "string",
            description: "Allergies, occasion, seating preferences, or other notes.",
          },
          amountEuro: {
            type: "number",
            description:
              "Deposit amount in pounds (e.g. 20 for £20). Optional if table pricing is configured — omit to use the venue default.",
          },
        },
        required: ["guestName", "dateYmd", "timeLocal", "partySize"],
      },
    },
    server: toolServer(),
    messages: [
      {
        type: "request-start",
        content: "One moment — I'm creating your booking and texting you a secure payment link now.",
      },
      {
        type: "request-complete",
        content: "Done — check your texts for the booking summary and payment link.",
      },
      {
        type: "request-failed",
        content: "I couldn't send the payment link just now — the team will follow up shortly.",
      },
    ],
  };
}

/** Live booking + optional deposit tools for merchant receptionist assistants. */
export function buildMerchantReceptionistTools(options: { bookingEnabled: boolean; depositSmsEnabled: boolean }) {
  const tools: Record<string, unknown>[] = [];
  if (options.bookingEnabled) {
    tools.push(buildCheckBookingAvailabilityTool(), buildCreateBookingRequestTool());
  }
  if (options.depositSmsEnabled) {
    tools.push(buildDepositPaymentLinkTool());
  }
  return tools;
}

export function appendPaymentCollectionPrompt(basePrompt: string, ctx: GuestCallPaymentContext): string {
  const defaultAmt =
    ctx.defaultAmountEuro != null && ctx.defaultAmountEuro >= 0.5
      ? ` Default deposit is about £${ctx.defaultAmountEuro.toFixed(2)} unless they agree a different amount.`
      : "";

  return [
    basePrompt,
    "",
    "## Collecting a deposit on this call",
    `This venue (${ctx.businessName}) can take deposits through their own Stripe account.${defaultAmt}`,
    "When the guest is ready to secure their booking:",
    "- Confirm their name, date, time, party size, and any notes (allergies, occasion). Repeat details back before sending payment.",
    `- Call ${CREATE_BOOKING_REQUEST_TOOL_NAME} first if not done — when status is pending_deposit, call ${SEND_DEPOSIT_PAYMENT_LINK_TOOL_NAME} with bookingRequestId.`,
    "- NEVER read URLs, links, or web addresses aloud on the phone. Say: 'I've just texted you your booking details and a secure payment link — open the text when you're ready.'",
    "- Do NOT tell them to visit the website or spell out a link. The text message has the payment link.",
    "- If they already paid, do not send another link.",
    "- Stay on the line briefly if they have questions about the text or deposit amount.",
  ].join("\n");
}
