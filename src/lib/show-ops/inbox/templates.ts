/**
 * WhatsApp templates the Hub sends on its own, one per kind of message.
 * WhatsApp only allows free text within 24 hours of the guest's last message;
 * after that, a Meta-approved template (a Twilio Content SID, HX…) is the only
 * way to reach them. Each kind has fixed numbered blanks, so the template in
 * Twilio must use {{1}}, {{2}}… in exactly this order. The booking and transport
 * wording is MHT's own (Joel's handover, 27 Oct). Nothing here touches the database.
 */

export type TemplateKind = "booking" | "booking_transport" | "pickup" | "reopen";

export type TemplateSpec = {
  kind: TemplateKind;
  /** Where the HX… SID lives in show_ops_integrations.meta. */
  metaKey: "booking_content_sid" | "booking_transport_content_sid" | "pickup_content_sid" | "reopen_content_sid";
  title: string;
  /** When the Hub sends it. */
  when: string;
  /** Name in Twilio / Meta. Meta sends approved templates by this name. */
  name: string;
  /** What each numbered blank holds, with the sample Meta asks for. */
  blanks: Array<{ label: string; sample: string }>;
  /** The wording as approved. */
  wording: string;
};

const SIGN_OFF = "Queen Bee of MHT, Miss Shona & The MHT Guest Support Team xx";

export const TEMPLATE_SPECS: readonly TemplateSpec[] = [
  {
    kind: "booking",
    metaKey: "booking_content_sid",
    title: "Booking confirmed, making own way",
    when: "Sent when a booking without transport is made. Needs the venue address and Maps link for the island (below).",
    name: "mht_booking_no_transport",
    blanks: [
      { label: "First name", sample: "Sarah" },
      { label: "Island", sample: "Tenerife" },
      { label: "Show date", sample: "Friday 6 November" },
      { label: "Number of guests", sample: "4" },
      { label: "Venue address", sample: "Calle Ejemplo 1, 38660 Costa Adeje" },
      { label: "Google Maps link", sample: "https://maps.app.goo.gl/example" },
    ],
    wording: [
      "Hi {{1}},",
      "",
      "Thank you for booking MHT in {{2}} on {{3}} for {{4}} guests!",
      "",
      "Our venue is located at:",
      "{{5}}",
      "",
      "Google Maps: {{6}}",
      "",
      "Please arrive at 7.00pm for check-in. All guests should be seated by 7.30pm.",
      "",
      "If you need any assistance before your visit, simply reply to this message and our team will be happy to help.",
      "",
      "We look forward to welcoming you for a fabulous evening!",
      "",
      SIGN_OFF,
    ].join("\n"),
  },
  {
    kind: "booking_transport",
    metaKey: "booking_transport_content_sid",
    title: "Booking confirmed, with transport",
    when: "Sent when a booking with a bus or private pick-up is made.",
    name: "mht_booking_with_transport",
    blanks: [
      { label: "First name", sample: "Sarah" },
      { label: "Island", sample: "Tenerife" },
      { label: "Show date", sample: "Friday 6 November" },
      { label: "Number of guests", sample: "4" },
      { label: "Pick-up time", sample: "18:30" },
      { label: "Pick-up point", sample: "Hotel Bahia del Duque, main entrance" },
    ],
    wording: [
      "Hi {{1}},",
      "",
      "Thank you for booking MHT in {{2}} on {{3}} for {{4}} guests, including transport!",
      "",
      "Your transport details are:",
      "",
      "Pick-up time: {{5}}",
      "Pick-up point: {{6}}",
      "",
      "Please arrive at your pick-up point 10 minutes early and look out for a coach or minibus displaying the MHT sign.",
      "",
      "If there are any significant delays, our team will contact you on the night.",
      "",
      "Need any assistance? Simply reply to this message.",
      "",
      "We look forward to seeing you!",
      "",
      SIGN_OFF,
    ].join("\n"),
  },
  {
    kind: "pickup",
    metaKey: "pickup_content_sid",
    title: "Transport confirmed / changed",
    when: "Sent from the bus list when a guest's pick-up time or stop is confirmed or changes.",
    name: "mht_transport_confirmation",
    blanks: [
      { label: "First name", sample: "Sarah" },
      { label: "Island", sample: "Tenerife" },
      { label: "Pick-up time", sample: "18:30" },
      { label: "Pick-up point", sample: "Hotel Bahia del Duque, main entrance" },
    ],
    wording: [
      "Hi {{1}},",
      "",
      "We're looking forward to welcoming you to tonight's MHT Show in {{2}}!",
      "",
      "Now that our transport arrangements are finalised, we're confirming your pick-up details:",
      "",
      "Pick-up time: {{3}}",
      "Pick-up point: {{4}}",
      "",
      "Please be at your pick-up point 10 minutes early and look out for a coach or minibus displaying the MHT sign.",
      "",
      "If there are any significant delays, our team will contact you.",
      "",
      "If you have any questions, simply reply to this message.",
      "",
      "See you tonight!",
      "",
      SIGN_OFF,
    ].join("\n"),
  },
  {
    kind: "reopen",
    metaKey: "reopen_content_sid",
    title: "Chat follow-up",
    when: "Sent from the inbox to message a guest after 24 hours.",
    name: "chat_follow_up",
    blanks: [{ label: "First name (optional)", sample: "Sarah" }],
    wording:
      "Hi {{1}}, this is MHT with an update about your booking. Please reply to this message so we can continue the chat.",
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
