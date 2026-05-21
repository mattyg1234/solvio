/**
 * Post-call AI extraction for campaign leads.
 *
 * After a campaign call ends we pass the transcript + success criteria to GPT
 * and ask it to pull out structured contact info (name, email, address, interest
 * level) plus a short notes summary.  Results are written back to the lead row.
 */

import { getSolvioOpenAiApiKey } from "@/lib/voice-platform-env";

export type LeadInterestLevel = "hot" | "warm" | "cold" | "not_interested";

export type LeadIntakeExtraction = {
  /** Confirmed name from call (null if not mentioned). */
  name: string | null;
  /** Email address if they gave one. */
  email: string | null;
  /** Street address line if given. */
  address_line1: string | null;
  /** City or town. */
  city: string | null;
  /** Postcode / ZIP. */
  postcode: string | null;
  /** Country if mentioned, otherwise null. */
  country: string | null;
  /** Interest level inferred from tone + explicit signals. */
  interest_level: LeadInterestLevel | null;
  /** One or two sentence human-readable summary of what was learned. */
  intake_notes: string | null;
  /** Any additional key/value pairs extracted (e.g. preferred time, occasion). */
  extra: Record<string, string>;
};

const EXTRACTION_SYSTEM_PROMPT = `You are a data extraction assistant for an AI outbound calling platform.
Given a call transcript, extract structured contact intake information.
Output a single JSON object with these exact keys (use null for anything not mentioned):
  name, email, address_line1, city, postcode, country,
  interest_level ("hot" | "warm" | "cold" | "not_interested"),
  intake_notes (string: 1-2 sentences about the call outcome — what did the person say?),
  extra (object: any additional key/value facts captured, e.g. {"preferred_time":"evenings","occasion":"birthday"}).

Rules:
- interest_level: hot = ready to book / strong interest, warm = interested but not immediate, cold = uncertain/not now, not_interested = explicitly declined
- Extract only what was clearly stated; do not invent or infer addresses from context
- intake_notes should be actionable for a follow-up (e.g. "Said they're interested in a table for Saturday evening for 4 people.")
- If the call was voicemail or unanswered, set interest_level null and intake_notes "No answer / voicemail."
- Keep email lowercase
- Postcode uppercase
- Output only the JSON object, no markdown, no commentary`;

export async function extractLeadIntakeFromTranscript(params: {
  transcript: string;
  successCriteria?: string;
  campaignGoal?: string;
}): Promise<LeadIntakeExtraction | null> {
  const apiKey = getSolvioOpenAiApiKey();
  if (!apiKey) return null;

  const transcript = params.transcript.trim();
  if (transcript.length < 30) return null;

  const userContent = [
    params.campaignGoal?.trim() ? `Campaign goal: ${params.campaignGoal.trim()}` : null,
    params.successCriteria?.trim() ? `Success criteria: ${params.successCriteria.trim()}` : null,
    "",
    "TRANSCRIPT:",
    transcript.slice(0, 8000),
  ]
    .filter((l) => l !== null)
    .join("\n");

  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
      }),
      cache: "no-store",
    });
  } catch {
    return null;
  }

  if (!res.ok) return null;

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return null;
  }

  const raw =
    (body as { choices?: { message?: { content?: string } }[] })?.choices?.[0]?.message?.content?.trim() ?? "";
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    const str = (k: string): string | null => {
      const v = parsed[k];
      return typeof v === "string" && v.trim() ? v.trim() : null;
    };

    const level = str("interest_level");
    const interest_level: LeadInterestLevel | null =
      level === "hot" || level === "warm" || level === "cold" || level === "not_interested" ? level : null;

    const extra: Record<string, string> = {};
    const rawExtra = parsed["extra"];
    if (rawExtra && typeof rawExtra === "object" && !Array.isArray(rawExtra)) {
      for (const [k, v] of Object.entries(rawExtra as Record<string, unknown>)) {
        if (typeof v === "string" && v.trim()) extra[k] = v.trim();
      }
    }

    return {
      name: str("name"),
      email: str("email"),
      address_line1: str("address_line1"),
      city: str("city"),
      postcode: str("postcode"),
      country: str("country"),
      interest_level,
      intake_notes: str("intake_notes"),
      extra,
    };
  } catch {
    return null;
  }
}
