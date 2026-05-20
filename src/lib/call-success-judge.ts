/** LLM-as-judge: score whether an outbound call met its success criteria. */

import { getSolvioOpenAiApiKey } from "@/lib/voice-platform-env";

export type JudgeVerdict = "success" | "fail" | "ambiguous" | "voicemail" | "no_answer";

export type CallJudgeInput = {
  successCriteria: string;
  /** Full transcript text — speaker labels okay, plain text works too. */
  transcript: string;
  /** Optional: outcome label already known from Vapi (e.g. "voicemail", "no_answer"). */
  vapiOutcomeHint?: string;
  /** Optional: end-of-call reason from Vapi (provider feedback). */
  endedReason?: string;
};

export type CallJudgeResult =
  | { ok: true; verdict: JudgeVerdict; reasoning: string }
  | { ok: false; message: string };

function quickHeuristic(input: CallJudgeInput): CallJudgeResult | null {
  const text = input.transcript.trim().toLowerCase();
  const hint = (input.vapiOutcomeHint ?? "").toLowerCase();
  const endedReason = (input.endedReason ?? "").toLowerCase();

  // Vapi outcome / endedReason cover the easy cases without spending an LLM call.
  if (/voicemail|machine-detected|machine|left-message/i.test(hint + " " + endedReason)) {
    return { ok: true, verdict: "voicemail", reasoning: "Call hit voicemail." };
  }
  if (/no-answer|no_answer|did-not-pickup|customer-did-not-answer|busy|customer-busy|no_answer|silence-timed-out/i.test(hint + " " + endedReason)) {
    return { ok: true, verdict: "no_answer", reasoning: "Recipient did not answer." };
  }

  // If transcript is empty or extremely short, treat as no_answer (LLM can't judge nothing).
  if (text.length < 40) {
    return { ok: true, verdict: "no_answer", reasoning: "Transcript too short to evaluate (<40 chars)." };
  }
  return null;
}

export async function judgeCallAgainstCriteria(input: CallJudgeInput): Promise<CallJudgeResult> {
  const fast = quickHeuristic(input);
  if (fast) return fast;

  const apiKey = getSolvioOpenAiApiKey();
  if (!apiKey) {
    return {
      ok: false,
      message:
        "SOLVIO_OPENAI_API_KEY not configured — cannot judge calls. Add it in Vercel env to score conversions automatically.",
    };
  }

  const successCriteria = input.successCriteria.trim() || "(no explicit criteria — judge if the call achieved a clear next step)";

  const userMsg = [
    "You are scoring an outbound AI sales/marketing call against its success criteria.",
    "",
    `SUCCESS CRITERIA: ${successCriteria}`,
    "",
    "TRANSCRIPT:",
    input.transcript.trim().slice(0, 8000),
    "",
    "Respond with a single JSON object on ONE LINE, no commentary, with keys:",
    '  "verdict": one of "success", "fail", "ambiguous"',
    '  "reasoning": one short sentence (max 200 chars) explaining the verdict.',
  ].join("\n");

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
          {
            role: "system",
            content:
              "You are an impartial call-quality judge. Output strict JSON. Never invent transcript content.",
          },
          { role: "user", content: userMsg },
        ],
      }),
      cache: "no-store",
    });
  } catch {
    return { ok: false, message: "Could not reach OpenAI judge." };
  }

  if (!res.ok) return { ok: false, message: `Judge LLM returned ${res.status}.` };
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = body.choices?.[0]?.message?.content?.trim() ?? "";
  if (!raw) return { ok: false, message: "Judge LLM empty response." };

  try {
    const parsed = JSON.parse(raw) as { verdict?: string; reasoning?: string };
    const v = parsed.verdict?.toLowerCase();
    if (v === "success" || v === "fail" || v === "ambiguous") {
      return { ok: true, verdict: v as JudgeVerdict, reasoning: parsed.reasoning?.slice(0, 280) ?? "" };
    }
    return { ok: false, message: `Judge returned unknown verdict "${parsed.verdict}".` };
  } catch {
    return { ok: false, message: "Judge LLM returned malformed JSON." };
  }
}
