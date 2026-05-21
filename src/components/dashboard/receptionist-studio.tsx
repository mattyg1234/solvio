"use client";

import { useMemo, useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Mic2, Save, Sparkles, X } from "lucide-react";

import {
  judgeReceptionistTestCallAction,
  saveReceptionistStudioAction,
} from "@/app/dashboard/setup/receptionist-actions";
import { composeVoiceAgentPromptAction } from "@/app/dashboard/setup/voice-prompt-actions";
import { ReceptionistVoicePicker } from "@/components/dashboard/receptionist-voice-picker";
import { VoiceLiveTrial } from "@/components/dashboard/voice-live-trial";
import { Button, buttonVariants } from "@/components/ui/button";
import type { SolvioVoiceEntry, SubscriptionTier } from "@/lib/solvio-voice-library";
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
  voiceLibrary: {
    demoSentence: string;
    voices: SolvioVoiceEntry[];
    voiceModel: string;
  };
  subscriptionTier: SubscriptionTier;
  defaultVoiceId: string;
  defaultVoiceName: string;
  publicBookingUrl: string | null;
  bookingFlowSummary: string;
  guestBookingModesLabel: string | null;
  vapiPublicKey: string;
};

export function ReceptionistStudio({
  businessId,
  businessName,
  initialDetails,
  voiceComplete,
  platformVoiceId,
  platformVoiceSource,
  voiceLibrary,
  subscriptionTier,
  defaultVoiceId,
  defaultVoiceName,
  publicBookingUrl,
  bookingFlowSummary,
  guestBookingModesLabel,
  vapiPublicKey,
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
  const [selectedVoiceId, setSelectedVoiceId] = useState(
    initialDetails.elevenlabs_voice_id?.trim() || defaultVoiceId,
  );
  const [selectedVoiceName, setSelectedVoiceName] = useState(
    initialDetails.elevenlabs_voice_name?.trim() || defaultVoiceName,
  );
  const [vapiAssistantId, setVapiAssistantId] = useState(initialDetails.vapi_assistant_id ?? "");
  const [vapiAssistantName] = useState(initialDetails.vapi_assistant_name ?? "");
  const [isDirty, setIsDirty] = useState(false);
  const [savedAtLeastOnce, setSavedAtLeastOnce] = useState(voiceComplete);
  const [liveTrialRevision, setLiveTrialRevision] = useState(0);

  const markDirty = () => {
    setIsDirty(true);
  };

  const [genPromptPending, setGenPromptPending] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState<boolean | null>(null);
  const [showLiveDemo, setShowLiveDemo] = useState(false);
  const [testTranscript, setTestTranscript] = useState<string>("");
  const [testBubbleCount, setTestBubbleCount] = useState(0);
  const [judgePending, setJudgePending] = useState(false);
  const [testVerdict, setTestVerdict] = useState<{
    verdict: "success" | "fail" | "ambiguous" | "voicemail" | "no_answer";
    reasoning: string;
  } | null>(null);
  const [pending, startTransition] = useTransition();

  const liveReady = Boolean(vapiAssistantId.trim() && vapiPublicKey.trim());
  const showSavedBadge = savedAtLeastOnce || voiceComplete;

  function openLiveDemo() {
    if (!liveReady) return;
    setTestTranscript("");
    setTestBubbleCount(0);
    setTestVerdict(null);
    setShowLiveDemo(true);
  }

  function scrollToEditor() {
    setShowLiveDemo(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const liveTrialKey = useMemo(
    () => `${vapiAssistantId}:${liveTrialRevision}:${selectedVoiceId}`,
    [liveTrialRevision, selectedVoiceId, vapiAssistantId],
  );

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
      markDirty();
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
          selectedVoiceId,
          elevenlabs_voice_id: selectedVoiceId,
          elevenlabs_voice_name: selectedVoiceName,
        });
        setSaveOk(res.ok);
        setSaveMsg(res.message);
        if (res.ok && "assistantId" in res) {
          setVapiAssistantId(res.assistantId);
        }
        if (res.ok) {
          setIsDirty(false);
          setSavedAtLeastOnce(true);
          setLiveTrialRevision((n) => n + 1);
          setTestTranscript("");
          setTestBubbleCount(0);
          setTestVerdict(null);
          setTimeout(() => setShowLiveDemo(true), 300);
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
              Name them, pick a voice, say what they should do, then save. Come back any time to edit — save again
              before testing if you change anything.
            </p>
          </div>
          {showSavedBadge ? (
            <span className="ml-auto rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-800 ring-1 ring-emerald-100">
              Saved
            </span>
          ) : (
            <span className="ml-auto rounded-full bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-900 ring-1 ring-amber-100">
              Draft
            </span>
          )}
          {liveReady ? (
            <button
              type="button"
              onClick={openLiveDemo}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "ml-0 rounded-full border-[#ddd6fe] bg-white px-4 font-semibold text-[#7c3aed] hover:bg-[#faf7ff] sm:ml-auto",
              )}
            >
              <Mic2 className="mr-2 inline h-4 w-4" aria-hidden />
              Test live
            </button>
          ) : null}
        </div>
        {isDirty && liveReady ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            You have unsaved edits. Save receptionist to push voice, instructions, and first line to your live agent
            before testing.
          </p>
        ) : null}
        {liveReady && !isDirty ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
            Your receptionist is saved — tap <span className="font-semibold">Test live</span> to speak with{" "}
            {trialName} using voice <span className="font-semibold">{selectedVoiceName}</span>.
          </p>
        ) : null}
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
                onChange={(e) => {
                  setReceptionistName(e.target.value);
                  markDirty();
                }}
                placeholder='e.g. "Riley" or "Front desk"'
                className="h-11 w-full rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-4 text-[15px] text-[#0f172a] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
              />
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold text-[#0f172a]">Voice</p>
                <p className="mt-1 text-sm text-[#64748b]">
                  Play a preview, then select who speaks for {businessName}. Saved voice:{" "}
                  <span className="font-semibold text-[#0f172a]">{selectedVoiceName}</span>.
                </p>
              </div>
              <ReceptionistVoicePicker
                businessId={businessId}
                demoSentence={voiceLibrary.demoSentence}
                voices={voiceLibrary.voices}
                subscriptionTier={subscriptionTier}
                selectedVoiceId={selectedVoiceId}
                onSelectVoice={(voice) => {
                  setSelectedVoiceId(voice.id);
                  setSelectedVoiceName(voice.name);
                  markDirty();
                }}
              />
              {!platformVoiceId ? (
                <p className="text-sm text-amber-800">
                  Tip: set <code className="font-mono text-xs">SOLVIO_PLATFORM_ELEVENLABS_VOICE_ID</code> to add your
                  homepage voice under Solvio voices (
                  {platformVoiceSource === "none" ? "not detected yet" : platformVoiceSource}).
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <label htmlFor="first-line" className="text-sm font-semibold text-[#0f172a]">
                First spoken line
              </label>
              <p className="text-xs text-[#64748b]">Plays when someone taps the purple mic or calls in.</p>
              <textarea
                id="first-line"
                value={agentFirstMessage}
                onChange={(e) => {
                  setAgentFirstMessage(e.target.value);
                  markDirty();
                }}
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
                onChange={(e) => {
                  setTone(e.target.value as VoiceReceptionistClientDetails["greeting_style"]);
                  markDirty();
                }}
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
                onChange={(e) => {
                  setReceptionScope(e.target.value);
                  markDirty();
                }}
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
                onChange={(e) => {
                  setIntakePriorities(e.target.value);
                  markDirty();
                }}
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
                onChange={(e) => {
                  setAgentGoal(e.target.value);
                  markDirty();
                }}
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
                  onChange={(e) => {
                    setLanguagesNote(e.target.value);
                    markDirty();
                  }}
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
                  onChange={(e) => {
                    setEscalationPhone(e.target.value);
                    markDirty();
                  }}
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
                  System prompt
                </label>
                <textarea
                  id="custom-prompt"
                  value={agentPromptCustom}
                  onChange={(e) => {
                    setAgentPromptCustom(e.target.value);
                    markDirty();
                  }}
                  rows={10}
                  className="w-full rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-4 py-3 font-mono text-[13px] leading-relaxed text-[#0f172a] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
                />
              </div>
            ) : null}
          </div>
        </section>

        <section id="test-live" className="rounded-[24px] border border-[#ddd6fe] bg-[#faf7ff]/80 p-6 shadow-sm md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[#0f172a]">Test as a guest</h2>
              <p className="mt-1 text-sm text-[#64748b]">
                {liveReady
                  ? isDirty
                    ? "Save your edits first, then speak to your receptionist with the purple mic."
                    : `Your saved receptionist is ready — uses your ${bookingFlowSummary} setup. Tap Test live above or the mic below.`
                  : "Save once to create your receptionist, then you can speak to them here."}
              </p>
            </div>
            {liveReady ? (
              <button
                type="button"
                disabled={isDirty}
                onClick={openLiveDemo}
                className={cn(
                  buttonVariants({ variant: "default", size: "sm" }),
                  "rounded-full px-4 font-semibold shadow-md shadow-[#7c3aed]/15 disabled:opacity-50",
                )}
              >
                <Mic2 className="mr-2 inline h-4 w-4" aria-hidden />
                Test live
              </button>
            ) : null}
          </div>

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
            {isDirty && liveReady ? (
              <p className="mt-2 text-sm text-amber-900">
                Mic uses your last saved settings. Save again to apply voice and instruction changes.
              </p>
            ) : null}
            <div className="mt-4">
              <VoiceLiveTrial
                key={liveTrialKey}
                vapiAssistantId={vapiAssistantId}
                vapiAssistantName={trialName}
                vapiPublicKey={vapiPublicKey}
                firstMessage={agentFirstMessage}
                voiceName={selectedVoiceName}
                disabled={isDirty}
                onRequestTest={openLiveDemo}
              />
            </div>
            {!vapiAssistantId ? (
              <p className="mt-4 text-sm text-[#64748b]">Save once to create your receptionist, then the mic goes live.</p>
            ) : null}
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
              <p className="text-[#64748b]">Changes go live when you save.</p>
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

      <AnimatePresence>
        {showLiveDemo ? (
          <motion.div
            key="live-demo-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={() => setShowLiveDemo(false)}
            className="fixed inset-0 z-50 flex items-end justify-center bg-gradient-to-b from-[#0f172a]/40 via-[#0f172a]/60 to-[#0f172a]/80 px-4 pb-8 pt-12 backdrop-blur-md md:items-center md:p-8"
          >
            <motion.div
              key="live-demo-card"
              initial={{ y: 80, opacity: 0, scale: 0.96 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 60, opacity: 0, scale: 0.97 }}
              transition={{ type: "spring", damping: 22, stiffness: 280 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-2xl overflow-hidden rounded-[28px] border border-[#ebe7f7]/90 bg-white shadow-[0_40px_120px_-30px_rgba(124,58,237,0.5)]"
            >
              <button
                type="button"
                onClick={() => setShowLiveDemo(false)}
                aria-label="Close live demo"
                className="absolute right-4 top-4 z-10 rounded-full bg-white/90 p-2 text-[#64748b] shadow-sm ring-1 ring-[#ebe7f7] backdrop-blur-sm hover:text-[#0f172a]"
              >
                <X className="h-4 w-4" />
              </button>
              <div className="bg-gradient-to-br from-[#faf7ff] via-white to-[#fafbff] px-6 py-6 md:px-10 md:py-8">
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15, duration: 0.35 }}
                  className="space-y-2"
                >
                  <span className="inline-flex items-center gap-2 rounded-full bg-[#ede9fe] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#5b21b6]">
                    <Sparkles className="h-3 w-3" aria-hidden />
                    Receptionist saved
                  </span>
                  <h2 className="text-xl font-semibold tracking-tight text-[#0f172a] md:text-2xl">
                    Test {trialName} live
                  </h2>
                  <p className="max-w-md text-sm leading-relaxed text-[#64748b]">
                    Tap the purple mic and speak — your saved prompt and {selectedVoiceName} voice are already live.
                    Close anytime to edit settings above, then save and test again.
                  </p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, duration: 0.4 }}
                  className="mt-6"
                >
                  <VoiceLiveTrial
                    key={`modal-${liveTrialKey}`}
                    vapiAssistantId={vapiAssistantId}
                    vapiAssistantName={trialName}
                    vapiPublicKey={vapiPublicKey}
                    firstMessage={agentFirstMessage}
                    voiceName={selectedVoiceName}
                    onBubblesChange={(bs) => setTestBubbleCount(bs.length)}
                    onCallEnded={(transcript) => {
                      setTestTranscript(transcript);
                      setTestVerdict(null);
                    }}
                  />
                </motion.div>

                {testTranscript && !testVerdict ? (
                  <div className="mt-4 rounded-2xl border border-[#ddd6fe] bg-[#faf7ff] px-4 py-3">
                    <p className="text-sm font-semibold text-[#0f172a]">
                      Call ended — want me to check it did what you asked?
                    </p>
                    <p className="mt-1 text-xs text-[#64748b]">
                      Solvio reads the transcript against your &ldquo;What they should do&rdquo; + intake checklist + goal, then tells
                      you if your receptionist sounded right.
                    </p>
                    <Button
                      type="button"
                      disabled={judgePending}
                      onClick={() => {
                        setJudgePending(true);
                        void judgeReceptionistTestCallAction({ businessId, transcript: testTranscript })
                          .then((res) => {
                            if (res.ok) {
                              setTestVerdict({ verdict: res.verdict, reasoning: res.reasoning });
                            } else {
                              setTestVerdict({ verdict: "ambiguous", reasoning: res.message });
                            }
                          })
                          .finally(() => setJudgePending(false));
                      }}
                      className="mt-3 rounded-full font-semibold"
                    >
                      {judgePending ? (
                        <>
                          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden />
                          Judging…
                        </>
                      ) : (
                        <>
                          <Sparkles className="mr-2 inline h-4 w-4" aria-hidden />
                          Score this test
                        </>
                      )}
                    </Button>
                  </div>
                ) : null}

                {testVerdict ? (
                  (() => {
                    const tone =
                      testVerdict.verdict === "success"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                        : testVerdict.verdict === "fail"
                          ? "border-rose-200 bg-rose-50 text-rose-900"
                          : "border-amber-200 bg-amber-50 text-amber-900";
                    const label =
                      testVerdict.verdict === "success"
                        ? "✅ Receptionist handled it well"
                        : testVerdict.verdict === "fail"
                          ? "❌ Missed the goal"
                          : testVerdict.verdict === "ambiguous"
                            ? "🤔 Not sure"
                            : testVerdict.verdict === "voicemail"
                              ? "📭 Voicemail"
                              : "📵 No answer";
                    return (
                      <div className={cn("mt-4 rounded-2xl border px-4 py-3", tone)}>
                        <p className="text-sm font-semibold">{label}</p>
                        <p className="mt-1 text-sm">{testVerdict.reasoning}</p>
                        <p className="mt-2 text-[12px]">
                          {testVerdict.verdict === "success"
                            ? "Your receptionist is ready for real callers."
                            : "Refine the &ldquo;What they should do&rdquo;, intake checklist or goal below, save again, and re-test."}
                        </p>
                      </div>
                    );
                  })()
                ) : null}

                {testBubbleCount > 0 && !testTranscript ? (
                  <p className="mt-4 text-[12px] text-[#5b21b6]">
                    Live transcript captured — {testBubbleCount} bubble{testBubbleCount === 1 ? "" : "s"}. End the call
                    to score it.
                  </p>
                ) : null}

                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.55, duration: 0.3 }}
                  className="mt-5 flex flex-wrap items-center gap-3 text-[12px] text-[#64748b]"
                >
                  <span>Need to tweak name, voice, or instructions?</span>
                  <button
                    type="button"
                    onClick={scrollToEditor}
                    className="font-semibold text-[#7c3aed] underline-offset-2 hover:underline"
                  >
                    Keep editing
                  </button>
                </motion.p>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
