/**
 * WhatsApp templates the Hub sends on its own, one per kind of message.
 * WhatsApp only allows free text within 24 hours of the guest's last message;
 * after that, a Meta-approved template (a Twilio Content SID, HX…) is the only
 * way to reach them. Each kind has fixed numbered blanks, so the wording made in
 * Twilio must use {{1}}, {{2}}… in exactly this order. Nothing here touches the database.
 */

export type TemplateKind = "ticket" | "pickup" | "reopen";

export type TemplateSpec = {
  kind: TemplateKind;
  /** Where the HX… SID lives in show_ops_integrations.meta. */
  metaKey: "ticket_content_sid" | "pickup_content_sid" | "reopen_content_sid";
  title: string;
  /** When the Hub sends it. */
  when: string;
  /** Suggested name in Twilio's Content Template Builder. */
  twilioName: string;
  /** What each numbered blank holds, with the sample Meta asks for. */
  blanks: Array<{ label: string; sample: string }>;
  /** The wording to paste into Twilio. */
  wording: (businessName: string) => string;
};

export const TEMPLATE_SPECS: readonly TemplateSpec[] = [
  {
    kind: "ticket",
    metaKey: "ticket_content_sid",
    title: "Booking confirmed",
    when: "Sent with the ticket when a booking is made.",
    twilioName: "booking_confirmed",
    blanks: [
      { label: "First name", sample: "Sarah" },
      { label: "Show", sample: "Dinner Show (Evening show)" },
      { label: "Date", sample: "Friday 2026-10-30" },
      { label: "Guests", sample: "2 adults" },
      { label: "Getting there", sample: "Bus from Hotel Bahia at 18:30" },
      { label: "To pay on the night", sample: "€40.00" },
      { label: "Booking ref", sample: "MHT-100001" },
      { label: "Ticket link", sample: "https://mht.solviosystems.com/ticket/0b1c2d3e" },
    ],
    wording: (b) =>
      [
        `Hi {{1}}, your booking with ${b} is confirmed.`,
        "",
        "Show: {{2}}",
        "Date: {{3}}",
        "Guests: {{4}}",
        "Getting there: {{5}}",
        "To pay on the night: {{6}}",
        "Booking ref: {{7}}",
        "",
        "Your ticket with the QR code for the door: {{8}}",
        "",
        "Reply to this message if you have any questions.",
      ].join("\n"),
  },
  {
    kind: "pickup",
    metaKey: "pickup_content_sid",
    title: "Pick-up changed",
    when: "Sent from the bus list when a guest's pick-up time or stop changes.",
    twilioName: "pickup_changed",
    blanks: [
      { label: "First name", sample: "Sarah" },
      { label: "Show", sample: "Dinner Show (Evening show)" },
      { label: "Date", sample: "Friday 2026-10-30" },
      { label: "Getting there", sample: "Bus from Hotel Bahia at 18:45" },
      { label: "Booking ref", sample: "MHT-100001" },
      { label: "Ticket link", sample: "https://mht.solviosystems.com/ticket/0b1c2d3e" },
    ],
    wording: (b) =>
      [
        `Hi {{1}}, this is ${b}. Your pick-up details for {{2}} on {{3}} have changed.`,
        "",
        "Getting there: {{4}}",
        "Booking ref: {{5}}",
        "",
        "Your ticket: {{6}}",
        "",
        "Reply to this message if you have any questions.",
      ].join("\n"),
  },
  {
    kind: "reopen",
    metaKey: "reopen_content_sid",
    title: "Chat follow-up",
    when: "Sent from the inbox to message a guest after 24 hours.",
    twilioName: "chat_follow_up",
    blanks: [{ label: "First name (optional)", sample: "Sarah" }],
    wording: (b) =>
      `Hi {{1}}, this is ${b} with an update about your booking. Please reply to this message so we can continue the chat.`,
  },
];

export function templateSpec(kind: TemplateKind): TemplateSpec {
  return TEMPLATE_SPECS.find((s) => s.kind === kind)!;
}

/**
 * One blank's value as WhatsApp accepts it: no new lines, tabs or runs of
 * spaces, never empty, and short enough to stay readable.
 */
export function templateValue(raw: unknown, max = 200): string {
  const flat = String(raw ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return (flat || "-").slice(0, max);
}

/** Values in blank order → Twilio's ContentVariables ({"1": …, "2": …}). */
export function templateVariables(values: readonly unknown[]): Record<string, string> {
  const out: Record<string, string> = {};
  values.forEach((v, i) => {
    out[String(i + 1)] = templateValue(v);
  });
  return out;
}
