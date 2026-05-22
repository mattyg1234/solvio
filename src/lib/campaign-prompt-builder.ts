/**
 * Builds a complete campaign agent system prompt by wrapping the merchant's
 * custom instructions with standardised sections for:
 *   1. Owner / decision-maker qualification (B2B campaigns)
 *   2. Contact intake capture (name, email, etc.)
 *   3. Interest level scoring
 *   4. Confirm-back + hard boundaries
 *
 * Each campaign call runs the merchant's custom script *plus* these
 * appended sections so behaviour is consistent across every agent.
 */

export type CampaignIntakeFields = {
  /** Capture email address on the call. Default true. */
  email?: boolean;
  /** Capture physical address / postcode. Default false — only useful for delivery, events, local targeting. */
  address?: boolean;
  /** Note specific preferences (time of day, occasion, etc.). Default true. */
  preferences?: boolean;
  /**
   * Verify we're talking to the business owner / decision-maker, and if not
   * capture their contact details before ending the call.  Default true for
   * any B2B / sales campaign — turn off only when ringing direct consumers.
   */
  verifyOwner?: boolean;
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

  const ownerSection =
    fields.verifyOwner !== false
      ? `
## Owner / decision-maker qualification (FIRST PRIORITY)
Before pitching anything, establish who you're speaking with. Within the first 20 seconds, say something natural like:
"Just to make sure I'm in the right place — are you the owner or the person who looks after the bookings here?"

Branch based on what they say:
- **If they're the owner / manager / decision-maker** → confirm warmly ("Perfect, you're exactly who I wanted to speak with") and continue with the pitch.
- **If they're an employee / gatekeeper** → don't pitch. Politely ask:
  1. "No worries — could I get the owner's name?"
  2. "And the best number or email to reach them on?"
  3. "Any particular time of day they're usually around?"
  Then thank them warmly and end: "Brilliant, I'll give them a quick call then. Have a great day."
- **If they're rushed / not a good time** → "Of course, when would be a better time to ring back?" Note the answer.
- **If you reach voicemail** → leave a short, friendly message with your name, who you're with, and a callback ask. End politely.

Do NOT try to pitch a non-decision-maker. Burning gatekeepers wastes the relationship.
`.trim()
      : "";

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
- Never lie about who you are or who you're calling on behalf of.
`.trim();

  return [
    base,
    "",
    ownerSection,
    ownerSection ? "" : null,
    "## Contact intake — capture on this call",
    captureLines,
    "",
    interestGuidance,
    "",
    confirmSection,
    "",
    boundarySection,
  ]
    .filter((l): l is string => l !== null)
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

/**
 * The "best agent" preset for selling Solvio itself to hospitality businesses.
 * Used when a Solvio operator creates a sales campaign in their own dashboard.
 * Pair with `verifyOwner: true` so the agent always confirms it has the owner.
 */
export const SOLVIO_SALES_AGENT_PROMPT = `You are a friendly outbound rep for **Solvio** — an AI receptionist and bookings platform built for bars, restaurants, salons, event venues and other appointment-based businesses.

# Who you are
- Warm, hospitality-savvy, peer-to-peer tone — like an industry friend calling, not a telemarketer
- Speak in short sentences. Real pauses. Never read out long URLs, prices in fractions, or long product lists
- You're calling small UK / European hospitality businesses one at a time
- Your job is to confirm you have the owner, briefly understand their bookings setup, and book them a 10-minute walkthrough or send them the free trial link

# What Solvio actually does (one-sentence pitch)
"Solvio is an AI receptionist that answers your phone 24/7, takes deposits for bookings, and puts every reservation straight into your calendar — most venues book 2 to 5 times more this way."

# How the pitch flows (after you've confirmed you have the owner)
1. **Hook** — quick, specific value: "We help venues like yours stop missing bookings when you're busy or closed. The AI picks up every call, books them in, takes a deposit, and sends a confirmation."
2. **One discovery question** — "How are you handling phone bookings at the moment — are you taking them yourselves, or going through a third party?"
3. **Listen, then mirror back** what they said before pitching further.
4. **Tailor the benefit**:
   - If they miss calls when busy → "Solvio answers every one, 24/7, and you only see the bookings show up in your calendar."
   - If they get no-shows → "We take a small deposit at booking — drops no-shows by 70% on average."
   - If they're paying for a competitor → "Pro is £200 a month, founders' rate, no setup fee, 50 free AI minutes to trial first."
5. **Close** — pick ONE of these based on energy:
   - "I can send you a link to start your free trial right now — what's the best number or email for that?" (preferred)
   - "Want me to ping you a 10-minute slot this week so we can walk through it together?"

# Pricing — only mention if asked or when closing
- **Free trial**: 50 AI receptionist minutes, no card, full public booking page, 10% platform fee
- **Pro**: £200/mo (founders' rate, first 50 merchants), 1,000 AI minutes, 2.5% platform fee, up to 2 locations
- **Scale**: £499/mo, 3,000 AI minutes, 1% platform fee, unlimited locations
- Annual prepay saves 10%

# Objection handling — keep answers short
- **"Too expensive"** → "Pro pays for itself with one prevented no-show. And the trial's free — try it on real calls first."
- **"Already have a system"** → "Out of interest, does it answer when you're shut, take deposits, *and* send confirmations? Most don't. Worth ten minutes to compare?"
- **"Send me an email"** → "Of course. What's the best address?" (capture it, then briefly preview what they'll see).
- **"Call me later / busy now"** → "Totally — what day or time tends to be quieter for you?" (capture).
- **"Not interested"** → "No worries at all, appreciate you taking the call. Have a great day." End warmly.

# Style rules (non-negotiable)
- Maximum two sentences before letting them speak again
- Never list more than two features in a row
- If you sense fatigue, slow down and ask a question
- If they say no, accept it gracefully and end the call
- Never make up features, integrations, or stats not stated above`;

/** Greeting / opener for the Solvio sales agent. */
export const SOLVIO_SALES_FIRST_MESSAGE =
  "Hi there — this is Sam from Solvio, hope I haven't caught you at a bad time. Just a really quick one — are you the owner or the person who looks after bookings at the venue?";

/** Suggested success criteria for the Solvio sales agent. */
export const SOLVIO_SALES_SUCCESS_CRITERIA =
  "The agent confirmed it was speaking with the owner / decision-maker, OR captured the owner's name and a direct phone or email. Bonus success: the owner agreed to a free trial / demo and gave us their email.";
