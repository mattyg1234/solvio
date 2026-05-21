/**
 * Builds a complete campaign agent system prompt by wrapping the merchant's
 * custom instructions with a standardised intake-capture section.
 *
 * Every campaign call will:
 *   1. Run the merchant's custom script / goal
 *   2. Politely capture contact details (name, email, address if relevant)
 *   3. Gauge interest level
 *   4. Confirm details back before hanging up
 */

export type CampaignIntakeFields = {
  /** Capture email address on the call. Default true. */
  email?: boolean;
  /** Capture physical address / postcode. Default false — only useful for delivery, events, local targeting. */
  address?: boolean;
  /** Note specific preferences (time of day, occasion, etc.). Default true. */
  preferences?: boolean;
};

export function buildCampaignSystemPrompt(params: {
  basePrompt: string;
  businessName: string;
  agentName?: string;
  intakeFields?: CampaignIntakeFields;
}): string {
  const base = params.basePrompt.trim();
  const biz = params.businessName.trim() || "the business";
  const agent = params.agentName?.trim();
  const fields = params.intakeFields ?? {};

  const captureLines = [
    `- **Name** — confirm how they'd like to be addressed`,
    fields.email !== false
      ? `- **Email** — "Could I take an email address so we can follow up with details?"`
      : null,
    fields.address === true
      ? `- **Address** — only if relevant to the conversation (e.g. delivery, local area event). "What area are you in?" is enough to start.`
      : null,
    fields.preferences !== false
      ? `- **Preferences** — note any specific requests: preferred time, occasion, party size, or anything else relevant to ${biz}`
      : null,
  ]
    .filter((l): l is string => l !== null)
    .join("\n");

  const interestGuidance = `
When the conversation is wrapping up, mentally note their interest level:
- **Hot** — actively ready to book or buy now
- **Warm** — genuinely interested, just not right now
- **Cold** — polite but non-committal
- **Not interested** — explicitly declined

Do not narrate the interest level aloud. It is captured automatically.
`.trim();

  const confirmSection = `
Before ending the call, briefly confirm back what you captured:
"Just to confirm I have that right — your name is [name]${fields.email !== false ? ", and I can reach you at [email]" : ""}. Is there anything else before I let you go?"

If they correct anything, update and confirm again. Then close warmly.
`.trim();

  const boundarySection = `
## Hard boundaries
- If they ask to be removed from the list, say "Of course — I'll make sure you're not contacted again" and end politely. Never argue.
- Never read out URLs, codes, or long reference numbers — offer to send via text or email instead.
- If they're busy, offer to call back at a better time and note it.
- Never make promises ${agent ? `"${agent}"` : "you"} cannot fulfil (pricing, availability, guarantees).
`.trim();

  return [
    base,
    "",
    "## Contact intake — capture on this call",
    captureLines,
    "",
    interestGuidance,
    "",
    confirmSection,
    "",
    boundarySection,
  ]
    .join("\n")
    .trim();
}

/** Generates a strong outbound opening message if the merchant hasn't written one. */
export function buildCampaignFirstMessage(params: {
  agentName?: string;
  businessName: string;
  goal?: string;
}): string {
  const agent = params.agentName?.trim() || "your team";
  const biz = params.businessName.trim();
  const goalHint = params.goal?.trim();

  if (goalHint) {
    const lower = goalHint.toLowerCase();
    if (/book|reserv|table|appointment/.test(lower)) {
      return `Hi there — this is ${agent} from ${biz}. I'm reaching out about a quick booking opportunity. Have you got thirty seconds?`;
    }
    if (/event|night|show|ticke/.test(lower)) {
      return `Hi, it's ${agent} from ${biz}. We've got something coming up I think you'd love — is now a good moment?`;
    }
    if (/offer|deal|promo|discount/.test(lower)) {
      return `Hi — ${agent} here from ${biz}. I've got something exclusive for you if you've got a moment?`;
    }
  }
  return `Hi there — this is ${agent} from ${biz}. Hope I haven't caught you at a bad time. I just wanted to reach out quickly — do you have thirty seconds?`;
}
