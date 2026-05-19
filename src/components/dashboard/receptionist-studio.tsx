"use client";

import { useState, useTransition } from "react";
import { Loader2, Mic2, Save, Sparkles } from "lucide-react";

import { saveReceptionistStudioAction } from "@/app/dashboard/setup/receptionist-actions";
import { composeVoiceAgentPromptAction } from "@/app/dashboard/setup/voice-prompt-actions";
import { VoiceLiveTrial } from "@/components/dashboard/voice-live-trial";
import { buttonVariants } from "@/components/ui/button";
import type { VoiceReceptionistClientDetails } from "@/lib/voice-receptionist";
import { cn } from "@/lib/utils";

const tones: {
  id: VoiceReceptionistClientDetails["greeting_style"];
  label: string;
}[] = [
  { id: "warm", label: "Warm professional" },
  { id: "casual", label: "Casual neighborhood" },
  { id: "luxury", label: "Quiet luxury" },
];

type ReceptionistStudioProps = {
  businessId: string;
  businessName: string;
  initialDetails: VoiceReceptionistClientDetails;
  voiceComplete: boolean;
  platformVoiceId: string;
  platformVoiceSource: "env" | "marketing_vapi" | "none";
  publicBookingUrl: string | null;
  bookingFlowSummary: string;
  guestBookingModesLabel: string | null;
};

export function ReceptionistStudio({
  businessId,
  businessName,
  initialDetails,
  voiceComplete,
  platformVoiceId,
  platformVoiceSource,
  publicBookingUrl,
  bookingFlowSummary,
  guestBookingModesLabel,
}: ReceptionistStudioProps) {
  const [receptionistName, setReceptionistName] = useState(
    initialDetails.receptionist_name ?? initialDetails.vapi_assistant_name?.split(" — ").pop() ?? "",
  );
  const [agentFirstMessage, setAgentFirstMessage] = useState(initialDetails.agent_first_message ?? "");
  const [receptionScope, setReceptionScope] = useState(initialDetails.reception_scope ?? "");
  const [intakePriorities, setIntakePriorities] = useState(initialDetails.caller_intake_priorities ?? "");
  const [agentGoal, setAgentGoal] = useState(initialDetails.agent_goal ?? "");
  const [languagesNote, setLanguagesNote] = useState(initialDetails.languages_note ?? "");
  const [escalationPhone, setEscalationPhone] = useState(initialDetails.escalation_phone ?? "");
  const [tone, setTone] = useState(initialDetails.greeting_style);
  const [agentPromptCustom, setAgentPromptCustom] = useState(initialDetails.agent_prompt_custom ?? "");
  const [showAdvancedPrompt, setShowAdvancedPrompt] = useState(Boolean(initialDetails.agent_prompt_custom?.trim()));
  const [vapiAssistantId, setVapiAssistantId] = useState(initialDetails.vapi_assistant_id ?? "");
  const [vapiAssistantName] = useState(initialDetails.vapi_assistant_name ?? "");

  const [genPromptPending, setGenPromptPending] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState<boolean | null>(null);
  const [pending, startTransition] = useTransition();

  async function handleBuildPrompt() {
    setGenPromptPending(true);
    try {
      const text = await composeVoiceAgentPromptAction({
        businessName,
        receptionistName,
        receptionScope,
        callerIntakePriorities: intakePriorities,
        agentGoal,
        greetingStyle: tone,
        languagesNote,
        agentFirstMessage,
      });
      setAgentPromptCustom(text);
      setShowAdvancedPrompt(true);
    } finally {
      setGenPromptPending(false);
    }
  }

  function handleSave() {
    setSaveMsg(null);
    setSaveOk(null);
    startTransition(() => {
      void (async () => {
        const res = await saveReceptionistStudioAction({
          businessId,
          businessName,
          greeting_style: tone,
          receptionist_name: receptionistName.trim() || undefined,
          agent_first_message: agentFirstMessage.trim() || undefined,
          reception_scope: receptionScope.trim() || undefined,
          caller_intake_priorities: intakePriorities.trim() || undefined,
          agent_goal: agentGoal.trim() || undefined,
          languages_note: languagesNote.trim() || undefined,
          escalation_phone: escalationPhone.trim() || undefined,
          agent_prompt_custom: showAdvancedPrompt ? agentPromptCustom.trim() || undefined : undefined,
          vapi_assistant_id: vapiAssistantId.trim() || undefined,
          vapi_assistant_name: vapiAssistantName.trim() || undefined,
        });
        setSaveOk(res.ok);
        setSaveMsg(res.message);
        if (res.ok && "assistantId" in res) {
          setVapiAssistantId(res.assistantId);
        }
      })();
    });
  }

  const trialName = receptionistName.trim() || vapiAssistantName || "Your receptionist";

  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-28">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f5f3ff] text-[#7c3aed] ring-1 ring-[#ebe7f7]">
            <Mic2 className="h-6 w-6" aria-hidden />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[#0f172a]">Your AI receptionist</h1>
            <p className="text-sm text-[#64748b]">
              Name them, say what they should do, then save. Every receptionist uses the same Solvio voice as the
              homepage — live purple mic, no browser fallback.
            </p>
          </div>
          {voiceComplete ? (
            <span className="ml-auto rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-800 ring-1 ring-emerald-100">
              Saved
            </span>
          ) : (
            <span className="ml-auto rounded-full bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-900 ring-1 ring-amber-100">
              Draft
            </span>
          )}
        </div>
      </header>

      <div className="space-y-6">
        <section className="rounded-[24px] border border-[#ebe7f7] bg-white p-6 shadow-sm md:p-8">
          <h2 className="text-lg font-semibold text-[#0f172a]">Name & voice</h2>
          <p className="mt-1 text-sm text-[#64748b]">How callers will know who they&apos;re speaking with.</p>

          <div className="mt-6 space-y-5">
            <div className="space-y-2">
              <label htmlFor="recv-name" className="text-sm font-semibold text-[#0f172a]">
                Receptionist name
              </label>
              <input
                id="recv-name"
                value={receptionistName}
                onChange={(e) => setReceptionistName(e.target.value)}
                placeholder='e.g. "Riley" or "Front desk"'
                className="h-11 w-full rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-4 text-[15px] text-[#0f172a] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
              />
            </div>

            <div className="rounded-xl border border-[#ede9fe] bg-[#faf7ff] px-4 py-4">
              <p className="text-sm font-semibold text-[#0f172a]">Voice</p>
              <p className="mt-1 text-sm text-[#64748b]">
                Locked to the Solvio platform voice — identical to your homepage receptionist (
                {platformVoiceSource === "env" ? "from env" : "from marketing Vapi agent"}).
              </p>
              {platformVoiceId ? (
                <p className="mt-2 font-mono text-[11px] text-[#5b21b6]">{platformVoiceId}</p>
              ) : (
                <p className="mt-2 text-sm text-rose-700">
                  Platform voice not configured. Set{" "}
                  <code className="font-mono text-xs">SOLVIO_PLATFORM_ELEVENLABS_VOICE_ID</code> on this deployment.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label htmlFor="first-line" className="text-sm font-semibold text-[#0f172a]">
                First spoken line
              </label>
              <p className="text-xs text-[#64748b]">Plays when someone taps the purple mic or calls in.</p>
              <textarea
                id="first-line"
                value={agentFirstMessage}
                onChange={(e) => setAgentFirstMessage(e.target.value)}
                rows={2}
                placeholder={`Hi — thanks for calling ${businessName}. How can I help you today?`}
                className="w-full rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-4 py-3 text-[15px] text-[#0f172a] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="tone-pick" className="text-sm font-semibold text-[#0f172a]">
                Tone
              </label>
              <select
                id="tone-pick"
                value={tone}
                onChange={(e) => setTone(e.target.value as VoiceReceptionistClientDetails["greeting_style"])}
                className="h-11 w-full rounded-xl border border-[#ebe7f7] bg-white px-4 text-[15px] text-[#0f172a] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
              >
                {tones.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <section className="rounded-[24px] border border-[#ebe7f7] bg-white p-6 shadow-sm md:p-8">
          <h2 className="text-lg font-semibold text-[#0f172a]">What they should do</h2>
          <p className="mt-1 text-sm text-[#64748b]">Tell your receptionist how to handle calls for {businessName}.</p>

          <div className="mt-6 space-y-5">
            <div className="space-y-2">
              <label htmlFor="scope" className="text-sm font-semibold text-[#0f172a]">
                Responsibilities
              </label>
              <textarea
                id="scope"
                value={receptionScope}
                onChange={(e) => setReceptionScope(e.target.value)}
                rows={4}
                placeholder="Book tables, quote wait times, explain hours, take event enquiries…"
                className="w-full rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-4 py-3 text-[15px] text-[#0f172a] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="intake" className="text-sm font-semibold text-[#0f172a]">
                What to ask every caller
              </label>
              <textarea
                id="intake"
                value={intakePriorities}
                onChange={(e) => setIntakePriorities(e.target.value)}
                rows={3}
                placeholder="Party size, date/time, name, phone, dietary notes…"
                className="w-full rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-4 py-3 text-[15px] text-[#0f172a] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="goal" className="text-sm font-semibold text-[#0f172a]">
                Goal on every call <span className="font-normal text-[#94a3b8]">(optional)</span>
              </label>
              <textarea
                id="goal"
                value={agentGoal}
                onChange={(e) => setAgentGoal(e.target.value)}
                rows={2}
                placeholder="Book the table, capture the lead, or warm-transfer to a human…"
                className="w-full rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-4 py-3 text-[15px] text-[#0f172a] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
              />
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="langs" className="text-sm font-semibold text-[#0f172a]">
                  Languages
                </label>
                <input
                  id="langs"
                  value={languagesNote}
                  onChange={(e) => setLanguagesNote(e.target.value)}
                  placeholder="English, Spanish…"
                  className="h-11 w-full rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-4 text-[15px] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="escalation" className="text-sm font-semibold text-[#0f172a]">
                  Escalation phone
                </label>
                <input
                  id="escalation"
                  value={escalationPhone}
                  onChange={(e) => setEscalationPhone(e.target.value)}
                  placeholder="+34 …"
                  className="h-11 w-full rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-4 text-[15px] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-3 border-t border-[#f1eefc] pt-5">
              <button
                type="button"
                disabled={genPromptPending}
                onClick={() => void handleBuildPrompt()}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "rounded-full px-4 font-semibold")}
              >
                {genPromptPending ? (
                  <>
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden />
                    Building…
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 inline h-4 w-4" aria-hidden />
                    Preview full prompt
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowAdvancedPrompt((v) => !v)}
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "rounded-full px-4 font-semibold")}
              >
                {showAdvancedPrompt ? "Hide custom prompt" : "Edit custom prompt"}
              </button>
            </div>

            {showAdvancedPrompt ? (
              <div className="space-y-2">
                <label htmlFor="custom-prompt" className="text-sm font-semibold text-[#0f172a]">
                  System prompt (sent to Vapi)
                </label>
                <textarea
                  id="custom-prompt"
                  value={agentPromptCustom}
                  onChange={(e) => setAgentPromptCustom(e.target.value)}
                  rows={10}
                  className="w-full rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-4 py-3 font-mono text-[13px] leading-relaxed text-[#0f172a] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
                />
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-[24px] border border-[#ddd6fe] bg-[#faf7ff]/80 p-6 shadow-sm md:p-8">
          <h2 className="text-lg font-semibold text-[#0f172a]">Test as a guest</h2>
          <p className="mt-1 text-sm text-[#64748b]">
            Save first, then use the purple mic below. Pretend you&apos;re a customer calling to book — your
            receptionist uses your personalised prompt plus your {bookingFlowSummary} setup.
          </p>

          <ul className="mt-4 space-y-2 text-sm text-[#475569]">
            <li className="rounded-xl border border-[#ebe7f7] bg-white px-4 py-3">
              Try saying: &ldquo;Hi, I&apos;d like a table for four this Friday around eight.&rdquo;
            </li>
            <li className="rounded-xl border border-[#ebe7f7] bg-white px-4 py-3">
              Or: &ldquo;Do you have anything Saturday lunch? It&apos;s a birthday.&rdquo;
            </li>
            {guestBookingModesLabel ? (
              <li className="rounded-xl border border-[#ebe7f7] bg-white px-4 py-3">
                Your public page accepts: {guestBookingModesLabel}.
              </li>
            ) : null}
          </ul>

          {publicBookingUrl ? (
            <p className="mt-4 text-sm text-[#64748b]">
              After the call, guests can also book online at{" "}
              <a href={publicBookingUrl} className="font-semibold text-[#7c3aed] underline-offset-2 hover:underline">
                {publicBookingUrl.replace(/^https?:\/\//, "")}
              </a>
              . Submit there to see the enquiry in Dashboard → Bookings.
            </p>
          ) : (
            <p className="mt-4 text-sm text-amber-900">
              Publish a booking link under Dashboard → Bookings so guests can complete table requests online after your
              receptionist captures details on a call.
            </p>
          )}

          <div className="mt-6">
            <h3 className="text-sm font-semibold text-[#0f172a]">Live voice — {trialName}</h3>
            <div className="mt-4">
              <VoiceLiveTrial
                vapiAssistantId={vapiAssistantId}
                vapiAssistantName={trialName}
                firstMessage={agentFirstMessage}
              />
            </div>
            {vapiAssistantId ? (
              <p className="mt-4 text-[11px] font-mono text-[#64748b]">Vapi assistant: {vapiAssistantId}</p>
            ) : (
              <p className="mt-4 text-sm text-[#64748b]">Save once to create your Vapi assistant, then the mic goes live.</p>
            )}
          </div>
        </section>
      </div>

      <div className="fixed bottom-16 left-0 right-0 z-30 border-t border-[#ebe7f7]/90 bg-white/95 px-4 py-4 backdrop-blur-xl md:bottom-0 md:pl-64">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-h-[1.25rem] text-sm">
            {saveMsg ? (
              <p className={saveOk ? "font-medium text-emerald-700" : "font-medium text-rose-700"} role="status">
                {saveMsg}
              </p>
            ) : (
              <p className="text-[#64748b]">Changes apply to Vapi when you save.</p>
            )}
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={handleSave}
            className={cn(
              buttonVariants({ variant: "default", size: "lg" }),
              "h-12 rounded-full px-8 font-semibold shadow-lg shadow-[#7c3aed]/20",
            )}
          >
            {pending ? (
              <>
                <Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden />
                Saving…
              </>
            ) : (
              <>
                <Save className="mr-2 inline h-4 w-4" aria-hidden />
                Save receptionist
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
