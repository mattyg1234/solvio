import { vapiToolServerUrl } from "@/lib/deployment-site-url";

export type GuestCallPaymentContext = {
  businessName: string;
  defaultAmountEuro?: number;
};

export const SEND_DEPOSIT_PAYMENT_LINK_TOOL_NAME = "send_deposit_payment_link";

export function buildDepositPaymentLinkTool() {
  return {
    type: "function",
    function: {
      name: SEND_DEPOSIT_PAYMENT_LINK_TOOL_NAME,
      description:
        "Create the guest's booking, generate a secure Stripe deposit link, and text it to their mobile with all booking details. Use once they agree to pay a deposit to confirm. Never read the URL aloud — this tool sends everything by SMS.",
      parameters: {
        type: "object",
        properties: {
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
              "Deposit amount in euros (e.g. 20 for €20). Optional if table pricing is configured — omit to use the venue default.",
          },
        },
        required: ["guestName", "dateYmd", "timeLocal", "partySize"],
      },
    },
    server: {
      url: vapiToolServerUrl(),
    },
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

export function appendPaymentCollectionPrompt(basePrompt: string, ctx: GuestCallPaymentContext): string {
  const defaultAmt =
    ctx.defaultAmountEuro != null && ctx.defaultAmountEuro >= 0.5
      ? ` Default deposit is about €${ctx.defaultAmountEuro.toFixed(2)} unless they agree a different amount.`
      : "";

  return [
    basePrompt,
    "",
    "## Collecting a deposit on this call",
    `This venue (${ctx.businessName}) can take deposits through their own Stripe account.${defaultAmt}`,
    "When the guest is ready to secure their booking:",
    "- Confirm their name, date, time, party size, and any notes (allergies, occasion). Repeat details back before sending payment.",
    `- Call ${SEND_DEPOSIT_PAYMENT_LINK_TOOL_NAME} with those details — it creates their booking in the diary and texts them a secure Stripe link with everything on it.`,
    "- NEVER read URLs, links, or web addresses aloud on the phone. Say: 'I've just texted you your booking details and a secure payment link — open the text when you're ready.'",
    "- Do NOT tell them to visit the website or spell out a link. The text message has the payment link.",
    "- If they already paid, do not send another link.",
    "- Stay on the line briefly if they have questions about the text or deposit amount.",
  ].join("\n");
}
