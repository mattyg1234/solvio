"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, Loader2, Mic, Sparkles, Waves } from "lucide-react";

import { saveVoiceReceptionistSetup } from "@/app/dashboard/setup/actions";
import type { VoiceReceptionistClientDetails, VoiceReceptionistSaveInput } from "@/lib/voice-receptionist";
import {
  listElevenLabsVoicesForBusiness,
  verifySolvioElevenLabsConnection,
  verifySolvioVapiConnection,
  type ElevenLabsVoiceOption,
} from "@/app/dashboard/setup/voice-integration-actions";
import { composeVoiceAgentPromptAction } from "@/app/dashboard/setup/voice-prompt-actions";
import { VoiceBrowserTrial } from "@/components/dashboard/voice-browser-trial";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TOTAL_STEPS = 7;

const tones: {
  id: VoiceReceptionistClientDetails["greeting_style"];
  label: string;
  hint: string;
}[] = [
  { id: "warm", label: "Warm professional", hint: "Friendly concierge energy without sounding robotic." },
  { id: "casual", label: "Casual neighborhood", hint: "Sounds like your regular host who knows repeat guests." },
  { id: "luxury", label: "Quiet luxury", hint: "Minimal, polished script with slower pacing cues." },
];

type VoiceSetupWizardProps = {
  businessId: string;
  businessName: string;
  initialDetails: VoiceReceptionistClientDetails;
};

export function VoiceSetupWizard({ businessId, businessName, initialDetails }: VoiceSetupWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(0);

  const [receptionIdentity, setReceptionIdentity] = useState(initialDetails.reception_identity ?? "");
  const [receptionScope, setReceptionScope] = useState(initialDetails.reception_scope ?? "");
  const [intakePriorities, setIntakePriorities] = useState(initialDetails.caller_intake_priorities ?? "");

  const [agentGoal, setAgentGoal] = useState(initialDetails.agent_goal ?? "");
  const [conversationFeel, setConversationFeel] = useState(initialDetails.conversation_feel ?? "");
  const [outboundNumberNote, setOutboundNumberNote] = useState(initialDetails.outbound_number_note ?? "");
  const [agentPromptCustom, setAgentPromptCustom] = useState(initialDetails.agent_prompt_custom ?? "");
  const [genPromptPending, setGenPromptPending] = useState(false);

  const [tone, setTone] = useState<VoiceReceptionistClientDetails["greeting_style"]>(initialDetails.greeting_style);
  const [languagesNote, setLanguagesNote] = useState(initialDetails.languages_note ?? "");
  const [escalationPhone, setEscalationPhone] = useState(initialDetails.escalation_phone ?? "");

  const [elevenLabsVoices, setElevenLabsVoices] = useState<ElevenLabsVoiceOption[]>([]);
  const [elevenLabsVoiceId, setElevenLabsVoiceId] = useState(initialDetails.elevenlabs_voice_id ?? "");
  const [elevenLabsVoiceName, setElevenLabsVoiceName] = useState(initialDetails.elevenlabs_voice_name ?? "");
  const [voiceLoadPending, setVoiceLoadPending] = useState(false);
  const [voiceLoadErr, setVoiceLoadErr] = useState<string | null>(null);

  const [speechVerifyMsg, setSpeechVerifyMsg] = useState<string | null>(null);
  const [callsVerifyMsg, setCallsVerifyMsg] = useState<string | null>(null);
  const [stackVerifyPending, setStackVerifyPending] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function handleLoadElevenLabsVoices() {
    setVoiceLoadErr(null);
    setVoiceLoadPending(true);
    try {
      const result = await listElevenLabsVoicesForBusiness(businessId);

      if (result.error) {
        setVoiceLoadErr(result.error);
        setElevenLabsVoices([]);
        return;
      }
      setElevenLabsVoices(result.voices);
      if (elevenLabsVoiceId && !result.voices.some((v) => v.voice_id === elevenLabsVoiceId)) {
        setVoiceLoadErr(
          "Your saved voice ID is not in this list anymore — pick another voice or ask Solvio to publish new clones.",
        );
      }
    } finally {
      setVoiceLoadPending(false);
    }
  }

  async function handleVerifySolvioStack() {
    setSpeechVerifyMsg(null);
    setCallsVerifyMsg(null);
    setStackVerifyPending(true);
    try {
      const speech = await verifySolvioElevenLabsConnection();
      const calls = await verifySolvioVapiConnection();
      setSpeechVerifyMsg(`${speech.ok ? "✓" : "✗"} ${speech.message}`);
      setCallsVerifyMsg(`${calls.ok ? "✓" : "✗"} ${calls.message}`);
    } finally {
      setStackVerifyPending(false);
    }
  }

  function applyVoicePick(id: string) {
    setElevenLabsVoiceId(id);
    const hit = elevenLabsVoices.find((v) => v.voice_id === id);
    setElevenLabsVoiceName(hit?.name ?? "");
  }

  async function handleGeneratePrompt() {
    setGenPromptPending(true);
    try {
      const text = await composeVoiceAgentPromptAction({
        businessName,
        receptionIdentity,
        receptionScope,
        callerIntakePriorities: intakePriorities,
        agentGoal,
        conversationFeel,
        outboundNumberNote,
        greetingStyle: tone,
      });
      setAgentPromptCustom(text);
    } finally {
      setGenPromptPending(false);
    }
  }

  function submit() {
    setError(null);
    startTransition(() => {
      void (async () => {
        try {
          const payload: VoiceReceptionistSaveInput = {
            greeting_style: tone,
            languages_note: languagesNote.trim() || undefined,
            escalation_phone: escalationPhone.trim() || undefined,
            reception_identity: receptionIdentity.trim() || undefined,
            reception_scope: receptionScope.trim() || undefined,
            caller_intake_priorities: intakePriorities.trim() || undefined,
            agent_goal: agentGoal.trim() || undefined,
            conversation_feel: conversationFeel.trim() || undefined,
            outbound_number_note: outboundNumberNote.trim() || undefined,
            agent_prompt_custom: agentPromptCustom.trim() || undefined,
            elevenlabs_voice_id: elevenLabsVoiceId.trim() || undefined,
            elevenlabs_voice_name: elevenLabsVoiceName.trim() || undefined,
          };

          await saveVoiceReceptionistSetup(businessId, payload);
          router.push("/dashboard");
          router.refresh();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not save.");
        }
      })();
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="flex flex-wrap items-center gap-4">
        <Link
          href="/dashboard"
          className={cn(
            buttonVariants({ variant: "ghost" }),
            "inline-flex h-10 items-center gap-2 px-2 text-sm font-semibold text-[#64748b] hover:text-[#0f172a]",
          )}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Dashboard
        </Link>
        <span className="rounded-full bg-[#ede9fe] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#5b21b6]">
          Step {step + 1} / {TOTAL_STEPS}
        </span>
      </div>

      <div className="rounded-[24px] border border-[#ebe7f7] bg-white p-8 shadow-sm md:p-10">
        {step === 0 ? (
          <div className="space-y-5">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f5f3ff] text-[#7c3aed] ring-1 ring-[#ebe7f7]">
              <Sparkles className="h-6 w-6" aria-hidden />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight text-[#0f172a]">AI voice receptionist</h1>
            <p className="text-[15px] leading-relaxed text-[#64748b]">
              Configure how AI answers for{" "}
              <span className="font-semibold text-[#0f172a]">{businessName}</span>: what it represents, how it sounds,
              and how it collects caller details—similar to onboarding in{" "}
              <span className="font-medium text-[#0f172a]">Vapi</span> +{" "}
              <span className="font-medium text-[#0f172a]">ElevenLabs</span>. Speech and telephony APIs are operated by{" "}
              <span className="font-medium text-[#0f172a]">Solvio</span> so merchants never manage keys themselves.
            </p>
            <ul className="list-inside list-disc space-y-2 text-sm text-[#475569] marker:text-[#a78bfa]">
              <li>Describe the receptionist role and intake checklist.</li>
              <li>Tone, languages, and escalation stay merchant-controlled.</li>
              <li>Pick a speaking voice from Solvio&apos;s ElevenLabs workspace.</li>
              <li>Generate or paste the live prompt, then trial it in-browser before checkout.</li>
            </ul>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-6">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f5f3ff] text-[#7c3aed] ring-1 ring-[#ebe7f7]">
                <Mic className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <h2 className="text-xl font-semibold text-[#0f172a]">Receptionist brief</h2>
                <p className="mt-1 text-sm leading-relaxed text-[#64748b]">
                  Mirror how you&apos;d configure assistant prompts in Vapi—identity first, responsibilities second,
                  then what Solvio must capture before handing off.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="recv-id" className="text-sm font-semibold text-[#0f172a]">
                Who they are
              </label>
              <textarea
                id="recv-id"
                value={receptionIdentity}
                onChange={(e) => setReceptionIdentity(e.target.value)}
                rows={3}
                placeholder='e.g. "You are Riley, the front-of-house coordinator for Aurora Bistro."'
                className="w-full rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-4 py-3 text-[15px] text-[#0f172a] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="recv-scope" className="text-sm font-semibold text-[#0f172a]">
                What they do on the line
              </label>
              <textarea
                id="recv-scope"
                value={receptionScope}
                onChange={(e) => setReceptionScope(e.target.value)}
                rows={3}
                placeholder='Book tables, quote wait times, confirm dietary notes, explain brunch hours…'
                className="w-full rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-4 py-3 text-[15px] text-[#0f172a] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="recv-intake" className="text-sm font-semibold text-[#0f172a]">
                What they need from each caller
              </label>
              <textarea
                id="recv-intake"
                value={intakePriorities}
                onChange={(e) => setIntakePriorities(e.target.value)}
                rows={4}
                placeholder="Party size · preferred date/time · allergies · occasion · callback number · consent for SMS confirmations…"
                className="w-full rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-4 py-3 text-[15px] text-[#0f172a] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="agent-goal" className="text-sm font-semibold text-[#0f172a]">
                Goal on every call <span className="font-normal text-[#94a3b8]">(north star)</span>
              </label>
              <textarea
                id="agent-goal"
                value={agentGoal}
                onChange={(e) => setAgentGoal(e.target.value)}
                rows={2}
                placeholder="Secure qualified boiler installs · fill weekday diary · capture emergencies…"
                className="w-full rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-4 py-3 text-[15px] text-[#0f172a] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="conv-feel" className="text-sm font-semibold text-[#0f172a]">
                How conversations should feel
              </label>
              <textarea
                id="conv-feel"
                value={conversationFeel}
                onChange={(e) => setConversationFeel(e.target.value)}
                rows={2}
                placeholder="Fast and reassuring · slower luxury pacing · humour welcome · plain-language explanations…"
                className="w-full rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-4 py-3 text-[15px] text-[#0f172a] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="outbound-num" className="text-sm font-semibold text-[#0f172a]">
                Outbound / caller-ID notes
              </label>
              <input
                id="outbound-num"
                value={outboundNumberNote}
                onChange={(e) => setOutboundNumberNote(e.target.value)}
                placeholder="Use Solvio pooled +44… · rotate per campaign…"
                className="h-11 w-full rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-4 text-[15px] text-[#0f172a] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
              />
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label htmlFor="agent-prompt" className="text-sm font-semibold text-[#0f172a]">
                  Live agent prompt (editable)
                </label>
                <button
                  type="button"
                  disabled={genPromptPending}
                  className={cn(
                    buttonVariants({ variant: "secondary", size: "sm" }),
                    "rounded-full px-4 text-xs font-semibold",
                  )}
                  onClick={() => void handleGeneratePrompt()}
                >
                  {genPromptPending ? (
                    <>
                      <Loader2 className="mr-2 inline h-3.5 w-3.5 animate-spin" aria-hidden />
                      Building…
                    </>
                  ) : (
                    "Generate from brief"
                  )}
                </button>
              </div>
              <textarea
                id="agent-prompt"
                value={agentPromptCustom}
                onChange={(e) => setAgentPromptCustom(e.target.value)}
                rows={10}
                placeholder='Paste your full prompt — e.g. "You are an assistant for PJ Plumbing…"'
                className="w-full rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-4 py-3 font-mono text-[13px] leading-relaxed text-[#0f172a] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
              />
              <p className="text-[11px] text-[#64748b]">
                Generator stitches identity + goals today — swap for LLM-assisted drafts anytime.
              </p>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-[#0f172a]">Voice personality</h2>
            <p className="text-sm leading-relaxed text-[#64748b]">
              Pick the vibe callers hear—Solvio pairs this with your ElevenLabs voice selection below.
            </p>
            <div className="grid gap-3">
              {tones.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTone(t.id)}
                  className={cn(
                    "rounded-2xl border px-4 py-4 text-left transition-colors",
                    tone === t.id
                      ? "border-[#a78bfa] bg-[#f5f3ff] shadow-[inset_0_0_0_1px_rgba(167,139,250,0.5)]"
                      : "border-[#ebe7f7] bg-[#fafbff] hover:border-[#ddd6fe]",
                  )}
                >
                  <p className="font-semibold text-[#0f172a]">{t.label}</p>
                  <p className="mt-1 text-sm text-[#64748b]">{t.hint}</p>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-[#0f172a]">Languages & human backup</h2>
            <div className="space-y-2">
              <label htmlFor="languages" className="text-sm font-semibold text-[#0f172a]">
                Language hints for callers
              </label>
              <textarea
                id="languages"
                value={languagesNote}
                onChange={(e) => setLanguagesNote(e.target.value)}
                rows={3}
                placeholder="English primary; switch to Spanish when caller asks…"
                className="w-full rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-4 py-3 text-[15px] text-[#0f172a] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="escalation" className="text-sm font-semibold text-[#0f172a]">
                Escalation phone <span className="font-normal text-[#94a3b8]">(optional)</span>
              </label>
              <input
                id="escalation"
                type="tel"
                value={escalationPhone}
                onChange={(e) => setEscalationPhone(e.target.value)}
                placeholder="Who picks up when AI hands off?"
                className="h-11 w-full rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-4 text-[15px] text-[#0f172a] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
              />
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="space-y-8">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f5f3ff] text-[#7c3aed] ring-1 ring-[#ebe7f7]">
                <Waves className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <h2 className="text-xl font-semibold text-[#0f172a]">Voice selection</h2>
                <p className="mt-1 text-sm leading-relaxed text-[#64748b]">
                  ElevenLabs and Vapi credentials live in Solvio&apos;s deployment configuration—not in your account.
                  You choose which speaking voice applies to{" "}
                  <span className="font-semibold text-[#0f172a]">{businessName}</span>; Solvio engineers rotate keys and
                  provision custom clones when you need them.
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-[#dbeafe] bg-[#eff6ff] px-4 py-3 text-sm leading-relaxed text-[#1e3a8a]">
              Need a branded clone or assistant tuning? Email your Solvio contact — voices are created on our ElevenLabs
              workspace so callers stay on-platform.
            </div>

            <section className="space-y-4 rounded-2xl border border-[#f1eefc] bg-[#fafbff]/80 p-5">
              <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-[#64748b]">
                Speaking voice (ElevenLabs via Solvio)
              </h3>
              <p className="text-xs leading-relaxed text-[#64748b]">
                Refresh pulls every voice Solvio exposes from its workspace (defaults + clones).
              </p>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={voiceLoadPending}
                  className={cn(
                    buttonVariants({ variant: "secondary", size: "sm" }),
                    "rounded-full px-4 font-semibold",
                  )}
                  onClick={() => void handleLoadElevenLabsVoices()}
                >
                  {voiceLoadPending ? (
                    <>
                      <Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden />
                      Loading voices…
                    </>
                  ) : (
                    "Refresh voice list"
                  )}
                </button>
                <button
                  type="button"
                  disabled={stackVerifyPending}
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }), "rounded-full px-4 font-semibold")}
                  onClick={() => void handleVerifySolvioStack()}
                >
                  {stackVerifyPending ? (
                    <>
                      <Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden />
                      Checking stack…
                    </>
                  ) : (
                    "Check Solvio speech & calls"
                  )}
                </button>
              </div>
              {voiceLoadErr ? (
                <p className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-900">{voiceLoadErr}</p>
              ) : null}
              {speechVerifyMsg ? (
                <p className="text-xs font-medium text-[#475569]" role="status">
                  {speechVerifyMsg}
                </p>
              ) : null}
              {callsVerifyMsg ? (
                <p className="text-xs font-medium text-[#475569]" role="status">
                  {callsVerifyMsg}
                </p>
              ) : null}

              <div className="space-y-2">
                <label htmlFor="voice-pick" className="text-sm font-semibold text-[#0f172a]">
                  Speaking voice
                </label>
                <select
                  id="voice-pick"
                  value={elevenLabsVoiceId}
                  onChange={(e) => applyVoicePick(e.target.value)}
                  className="h-11 w-full rounded-xl border border-[#ebe7f7] bg-white px-4 text-[15px] text-[#0f172a] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
                >
                  <option value="">Choose after loading voices…</option>
                  {elevenLabsVoices.map((v) => (
                    <option key={v.voice_id} value={v.voice_id}>
                      {v.name}
                    </option>
                  ))}
                </select>
                {initialDetails.elevenlabs_voice_id && !elevenLabsVoices.length ? (
                  <p className="text-xs text-[#64748b]">
                    Saved voice:{" "}
                    <span className="font-mono font-medium text-[#0f172a]">{initialDetails.elevenlabs_voice_id}</span>
                    {initialDetails.elevenlabs_voice_name ? ` (${initialDetails.elevenlabs_voice_name})` : ""}. Refresh the
                    list after Solvio publishes new clones.
                  </p>
                ) : null}
              </div>
            </section>
          </div>
        ) : null}

        {step === 5 ? (
          <div className="space-y-5">
            <h2 className="text-xl font-semibold text-[#0f172a]">Convince yourself</h2>
            <p className="text-sm leading-relaxed text-[#64748b]">
              Walk through a lightweight browser rehearsal — swap for streamed audio once telephony goes live.
            </p>
            <VoiceBrowserTrial
              businessName={businessName}
              agentPrompt={agentPromptCustom}
              toneLabel={tones.find((x) => x.id === tone)?.label ?? "Warm professional"}
            />
          </div>
        ) : null}

        {step === 6 ? (
          <div className="space-y-5">
            <h2 className="text-xl font-semibold text-[#0f172a]">Review & save</h2>
            <dl className="space-y-4 rounded-2xl border border-[#f1eefc] bg-[#fafbff] px-5 py-5 text-sm">
              <div>
                <dt className="font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">Who they are</dt>
                <dd className="mt-1 text-[#475569]">{receptionIdentity.trim() || "—"}</dd>
              </div>
              <div>
                <dt className="font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">What they do</dt>
                <dd className="mt-1 text-[#475569]">{receptionScope.trim() || "—"}</dd>
              </div>
              <div>
                <dt className="font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">Caller intake</dt>
                <dd className="mt-1 text-[#475569]">{intakePriorities.trim() || "—"}</dd>
              </div>
              <div>
                <dt className="font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">Goal</dt>
                <dd className="mt-1 text-[#475569]">{agentGoal.trim() || "—"}</dd>
              </div>
              <div>
                <dt className="font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">Conversation feel</dt>
                <dd className="mt-1 text-[#475569]">{conversationFeel.trim() || "—"}</dd>
              </div>
              <div>
                <dt className="font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">Outbound numbers</dt>
                <dd className="mt-1 text-[#475569]">{outboundNumberNote.trim() || "—"}</dd>
              </div>
              <div>
                <dt className="font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">Prompt excerpt</dt>
                <dd className="mt-1 line-clamp-6 whitespace-pre-wrap font-mono text-xs text-[#475569]">
                  {agentPromptCustom.trim() || "—"}
                </dd>
              </div>
              <div>
                <dt className="font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">Tone</dt>
                <dd className="mt-1 text-[#0f172a]">{tones.find((x) => x.id === tone)?.label}</dd>
              </div>
              <div>
                <dt className="font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">Languages</dt>
                <dd className="mt-1 text-[#475569]">{languagesNote.trim() || "—"}</dd>
              </div>
              <div>
                <dt className="font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">Escalation</dt>
                <dd className="mt-1 text-[#475569]">{escalationPhone.trim() || "—"}</dd>
              </div>
              <div>
                <dt className="font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">Voice stack</dt>
                <dd className="mt-1 space-y-1 text-[#475569]">
                  <p>
                    Speech via Solvio ElevenLabs —{" "}
                    {elevenLabsVoiceName || elevenLabsVoiceId
                      ? `${elevenLabsVoiceName || "Selected"} (${elevenLabsVoiceId || "—"})`
                      : "No voice chosen yet"}
                  </p>
                  <p className="text-xs text-[#64748b]">
                    Calls route through Solvio&apos;s Vapi workspace when telephony is enabled for your deployment.
                  </p>
                </dd>
              </div>
            </dl>
            {error ? <p className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-2 text-sm text-rose-900">{error}</p> : null}
          </div>
        ) : null}

        <div className="mt-10 flex flex-wrap justify-between gap-3 border-t border-[#f1eefc] pt-8">
          <button
            type="button"
            disabled={step === 0 || pending}
            className={cn(
              buttonVariants({ variant: "outline" }),
              "rounded-full border-[#ebe7f7] px-6 font-semibold disabled:opacity-40",
            )}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            Back
          </button>
          {step < TOTAL_STEPS - 1 ? (
            <button
              type="button"
              className={cn(
                buttonVariants({ variant: "default" }),
                "rounded-full px-6 font-semibold shadow-md shadow-[#7c3aed]/25",
              )}
              onClick={() => setStep((s) => Math.min(TOTAL_STEPS - 1, s + 1))}
            >
              Continue
              <ArrowRight className="ml-2 inline h-4 w-4" aria-hidden />
            </button>
          ) : (
            <button
              type="button"
              disabled={pending}
              className={cn(
                buttonVariants({ variant: "default" }),
                "rounded-full px-6 font-semibold shadow-md shadow-[#7c3aed]/25",
              )}
              onClick={() => submit()}
            >
              {pending ? (
                <>
                  <Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden />
                  Saving…
                </>
              ) : (
                <>
                  Save reception profile
                  <ArrowRight className="ml-2 inline h-4 w-4" aria-hidden />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
