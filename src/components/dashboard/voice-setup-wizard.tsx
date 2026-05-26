"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, Loader2, Mic, Sparkles, Waves } from "lucide-react";

import { syncMerchantVapiAssistantAction } from "@/app/dashboard/setup/marketing-voice-actions";
import { saveVoiceReceptionistSetup } from "@/app/dashboard/setup/actions";
import type { VoiceReceptionistClientDetails, VoiceReceptionistSaveInput } from "@/lib/voice-receptionist";
import {
  listVapiAssistantsForBusiness,
  verifySolvioVapiConnection,
  type VapiAssistantOption,
} from "@/app/dashboard/setup/voice-integration-actions";
import {
  composeVoiceAgentPromptAction,
  generateVoiceAgentPromptOpenAIAction,
} from "@/app/dashboard/setup/voice-prompt-actions";
import { VoiceLiveTrial } from "@/components/dashboard/voice-live-trial";
import { buttonVariants } from "@/components/ui/button";
import { PhoneDialCodeField } from "@/components/ui/phone-dial-code-field";
import { optionalPhoneE164, parsePhoneDialFields } from "@/lib/normalize-phone";
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
  const initialEscalation = parsePhoneDialFields(initialDetails.escalation_phone ?? "");
  const [escalationDial, setEscalationDial] = useState<string>(initialEscalation.dial);
  const [escalationLocal, setEscalationLocal] = useState(initialEscalation.local);
  const [agentFirstMessage, setAgentFirstMessage] = useState(initialDetails.agent_first_message ?? "");
  const [vapiAssistantId, setVapiAssistantId] = useState(initialDetails.vapi_assistant_id ?? "");
  const [vapiAssistantName, setVapiAssistantName] = useState(initialDetails.vapi_assistant_name ?? "");
  const [aiPromptPending, setAiPromptPending] = useState(false);
  const [aiPromptErr, setAiPromptErr] = useState<string | null>(null);

  const [vapiAssistants, setVapiAssistants] = useState<VapiAssistantOption[]>([]);
  const [vapiAssistantsPending, setVapiAssistantsPending] = useState(false);
  const [vapiAssistantsErr, setVapiAssistantsErr] = useState<string | null>(null);

  const [callsVerifyMsg, setCallsVerifyMsg] = useState<string | null>(null);
  const [vapiCheckPending, setVapiCheckPending] = useState(false);
  const [merchantSyncMsg, setMerchantSyncMsg] = useState<string | null>(null);
  const [merchantSyncPending, setMerchantSyncPending] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function handleLoadVapiAssistants() {
    setVapiAssistantsErr(null);
    setVapiAssistantsPending(true);
    try {
      const result = await listVapiAssistantsForBusiness(businessId);
      if (result.error) {
        setVapiAssistants([]);
        setVapiAssistantsErr(result.error);
        return;
      }
      const list = [...result.assistants];
      const sid = vapiAssistantId.trim();
      if (sid.length && !list.some((a) => a.id === sid)) {
        list.unshift({
          id: sid,
          name: vapiAssistantName.trim() ? `${vapiAssistantName.trim()} (saved)` : `${sid.slice(0, 8)}… (saved id)`,
        });
      }
      setVapiAssistants(list);
    } finally {
      setVapiAssistantsPending(false);
    }
  }

  async function handleVerifyVapi() {
    setCallsVerifyMsg(null);
    setVapiCheckPending(true);
    try {
      const calls = await verifySolvioVapiConnection();
      setCallsVerifyMsg(`${calls.ok ? "✓" : "✗"} ${calls.message}`);
    } finally {
      setVapiCheckPending(false);
    }
  }

  function applyAssistantPick(id: string) {
    const trimmed = id.trim();
    setVapiAssistantId(trimmed);
    if (!trimmed.length) {
      setVapiAssistantName("");
      return;
    }
    const hit = vapiAssistants.find((a) => a.id === trimmed);
    const nm = hit?.name ?? "";
    setVapiAssistantName(nm.replace(/\s*\((?:saved(?: id)?)\)\s*$/i, "").trim());
  }

  async function handleGeneratePrompt() {
    setAiPromptErr(null);
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
        languagesNote,
        agentFirstMessage,
      });
      setAgentPromptCustom(text);
    } finally {
      setGenPromptPending(false);
    }
  }

  async function handleGeneratePromptWithAi() {
    setAiPromptErr(null);
    setAiPromptPending(true);
    try {
      const res = await generateVoiceAgentPromptOpenAIAction({
        businessName,
        receptionIdentity,
        receptionScope,
        callerIntakePriorities: intakePriorities,
        agentGoal,
        conversationFeel,
        outboundNumberNote,
        greetingStyle: tone,
        languagesNote,
        agentFirstMessage,
      });
      if (res.ok) {
        setAgentPromptCustom(res.text);
      } else {
        setAiPromptErr(res.message);
      }
    } finally {
      setAiPromptPending(false);
    }
  }

  function escalationPhoneE164(): string | undefined {
    const check = optionalPhoneE164(escalationDial, escalationLocal);
    if (!check.ok) return undefined;
    return check.e164 ?? undefined;
  }

  async function handleSyncMerchantAssistant() {
    setMerchantSyncMsg(null);
    setMerchantSyncPending(true);
    try {
      const payload: VoiceReceptionistSaveInput = {
        greeting_style: tone,
        languages_note: languagesNote.trim() || undefined,
        escalation_phone: escalationPhoneE164(),
        reception_identity: receptionIdentity.trim() || undefined,
        reception_scope: receptionScope.trim() || undefined,
        caller_intake_priorities: intakePriorities.trim() || undefined,
        agent_goal: agentGoal.trim() || undefined,
        conversation_feel: conversationFeel.trim() || undefined,
        outbound_number_note: outboundNumberNote.trim() || undefined,
        agent_first_message: agentFirstMessage.trim() || undefined,
        agent_prompt_custom: agentPromptCustom.trim() || undefined,
        elevenlabs_voice_id: "",
        elevenlabs_voice_name: "",
        vapi_assistant_id: vapiAssistantId.trim(),
        vapi_assistant_name: vapiAssistantName.trim(),
      };
      await saveVoiceReceptionistSetup(businessId, payload);
      const res = await syncMerchantVapiAssistantAction(businessId);
      setMerchantSyncMsg(res.ok ? "Venue briefing pushed to your Vapi assistant." : res.message);
    } catch (e) {
      setMerchantSyncMsg(e instanceof Error ? e.message : "Could not sync.");
    } finally {
      setMerchantSyncPending(false);
    }
  }

  function submit() {
    setError(null);
    const phoneCheck = optionalPhoneE164(escalationDial, escalationLocal);
    if (!phoneCheck.ok) {
      setError(phoneCheck.message);
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          const payload: VoiceReceptionistSaveInput = {
            greeting_style: tone,
            languages_note: languagesNote.trim() || undefined,
            escalation_phone: escalationPhoneE164(),
            reception_identity: receptionIdentity.trim() || undefined,
            reception_scope: receptionScope.trim() || undefined,
            caller_intake_priorities: intakePriorities.trim() || undefined,
            agent_goal: agentGoal.trim() || undefined,
            conversation_feel: conversationFeel.trim() || undefined,
            outbound_number_note: outboundNumberNote.trim() || undefined,
            agent_first_message: agentFirstMessage.trim() || undefined,
            agent_prompt_custom: agentPromptCustom.trim() || undefined,
            elevenlabs_voice_id: "",
            elevenlabs_voice_name: "",
            vapi_assistant_id: vapiAssistantId.trim(),
            vapi_assistant_name: vapiAssistantName.trim(),
          };

          await saveVoiceReceptionistSetup(businessId, payload);
          if (payload.vapi_assistant_id && (payload.agent_prompt_custom || payload.agent_first_message)) {
            await syncMerchantVapiAssistantAction(businessId);
          }
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
              Capture how callers should be greeted, what intake you need, and which{" "}
              <span className="font-medium text-[#0f172a]">Vapi</span> assistant we route them to — all stored in Solvio.
              Hosting keys stay on infra (<span className="font-mono text-[13px]">SOLVIO_VAPI_API_KEY</span>
              · optional <span className="font-mono text-[13px]">SOLVIO_OPENAI_API_KEY</span> for AI prompt drafts).
            </p>
            <ul className="list-inside list-disc space-y-2 text-sm text-[#475569] marker:text-[#a78bfa]">
              <li>Set the greeting line callers hear first (“what should your agent say?”).</li>
              <li>Define duties + intake checklist — then paste or generate the briefing prompt.</li>
              <li>Select one of Solvio&apos;s live Vapi assistants for this venue.</li>
              <li>Save; telephony goes live once numbers are wired to that assistant.</li>
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

            <div className="space-y-2 rounded-2xl border border-[#ede9fe] bg-[#fafbff]/90 p-5">
              <label htmlFor="agent-opens" className="text-sm font-semibold text-[#0f172a]">
                What should your agent say first?
              </label>
              <p className="text-xs leading-relaxed text-[#64748b]">
                Becomes Vapi&apos;s <span className="font-semibold text-[#475569]">first spoken line</span> when the call connects.
              </p>
              <textarea
                id="agent-opens"
                value={agentFirstMessage}
                onChange={(e) => setAgentFirstMessage(e.target.value)}
                rows={2}
                placeholder={`e.g. "Hi — thanks for calling ${businessName}. Are you booking a table or checking on something else?"`}
                className="w-full rounded-xl border border-[#ebe7f7] bg-white px-4 py-3 text-[15px] text-[#0f172a] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
              />
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
              <div className="flex flex-wrap items-start justify-between gap-2">
                <label htmlFor="agent-prompt" className="text-sm font-semibold text-[#0f172a]">
                  Full system prompt{" "}
                  <span className="font-normal text-[#94a3b8]">(what the model follows on every turn)</span>
                </label>
                <div className="flex flex-wrap gap-2">
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
                        Stitching brief…
                      </>
                    ) : (
                      "Build from brief (template)"
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={aiPromptPending}
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }), "rounded-full px-4 text-xs font-semibold")}
                    onClick={() => void handleGeneratePromptWithAi()}
                  >
                    {aiPromptPending ? (
                      <>
                        <Loader2 className="mr-2 inline h-3.5 w-3.5 animate-spin" aria-hidden />
                        ChatGPT…
                      </>
                    ) : (
                      "Generate full prompt (ChatGPT)"
                    )}
                  </button>
                </div>
              </div>
              {aiPromptErr ? (
                <p className="rounded-lg border border-amber-100 bg-[#fffbeb] px-3 py-2 text-xs text-[#92400e]">{aiPromptErr}</p>
              ) : null}
              <textarea
                id="agent-prompt"
                value={agentPromptCustom}
                onChange={(e) => setAgentPromptCustom(e.target.value)}
                rows={10}
                placeholder={`Paste your full prompt — or use the generators above.`}
                className="w-full rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-4 py-3 font-mono text-[13px] leading-relaxed text-[#0f172a] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
              />
              <p className="text-[11px] text-[#64748b]">
                Tip: Generate with ChatGPT after adding languages under step&nbsp;3 so the draft includes bilingual policies.
              </p>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-[#0f172a]">Voice personality</h2>
            <p className="text-sm leading-relaxed text-[#64748b]">
              Pick conversation vibe — the actual voice follows whichever Vapi assistant you attach.
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
            <PhoneDialCodeField
              idPrefix="voice-escalation"
              label="Escalation phone"
              optional
              dialCode={escalationDial}
              localNumber={escalationLocal}
              onDialCodeChange={setEscalationDial}
              onLocalNumberChange={setEscalationLocal}
              localPlaceholder="Who picks up when AI hands off?"
              inputClassName="rounded-xl bg-[#fafbff] px-4"
            />
          </div>
        ) : null}

        {step === 4 ? (
          <div className="space-y-8">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f5f3ff] text-[#7c3aed] ring-1 ring-[#ebe7f7]">
                <Waves className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <h2 className="text-xl font-semibold text-[#0f172a]">Vapi assistant</h2>
                <p className="mt-1 text-sm leading-relaxed text-[#64748b]">
                  Pick which agent on Solvio&apos;s{" "}
                  <span className="font-semibold text-[#0f172a]">Vapi</span> workspace answers for{" "}
                  <span className="font-semibold text-[#0f172a]">{businessName}</span>. Voice, model, and tools are
                  already configured inside that assistant — you only choose the roster entry here.
                </p>
              </div>
            </div>

            <section className="space-y-4 rounded-2xl border border-[#f1eefc] bg-[#fafbff]/80 p-5">
              <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-[#64748b]">
                Solvio-managed assistants
              </h3>
              <p className="text-xs leading-relaxed text-[#64748b]">
                Refresh pulls existing assistants tied to{" "}
                <span className="font-mono text-[11px]">SOLVIO_VAPI_API_KEY</span>. Ask Solvio ops if you don&apos;t see
                the agent you expected.
              </p>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={vapiAssistantsPending}
                  className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "rounded-full px-4 font-semibold")}
                  onClick={() => void handleLoadVapiAssistants()}
                >
                  {vapiAssistantsPending ? (
                    <>
                      <Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden />
                      Loading assistants…
                    </>
                  ) : (
                    "Refresh assistant list"
                  )}
                </button>
                <button
                  type="button"
                  disabled={vapiCheckPending}
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }), "rounded-full px-4 font-semibold")}
                  onClick={() => void handleVerifyVapi()}
                >
                  {vapiCheckPending ? (
                    <>
                      <Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden />
                      Checking Vapi…
                    </>
                  ) : (
                    "Check Vapi token"
                  )}
                </button>
              </div>
              {vapiAssistantsErr ? (
                <p className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-900">{vapiAssistantsErr}</p>
              ) : null}
              {callsVerifyMsg ? (
                <p className="text-xs font-medium text-[#475569]" role="status">
                  {callsVerifyMsg}
                </p>
              ) : null}

              <div className="space-y-2">
                <label htmlFor="assistant-pick" className="text-sm font-semibold text-[#0f172a]">
                  Assistant handling this venue
                </label>
                <select
                  id="assistant-pick"
                  value={vapiAssistantId.trim()}
                  onChange={(e) => applyAssistantPick(e.target.value)}
                  className="h-11 w-full rounded-xl border border-[#ebe7f7] bg-white px-4 text-[15px] text-[#0f172a] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
                >
                  <option value="">Choose an assistant…</option>
                  {vapiAssistantId.trim() &&
                  !vapiAssistants.some((a) => a.id === vapiAssistantId.trim()) ? (
                    <option value={vapiAssistantId.trim()}>Previously saved assistant (refresh for label)</option>
                  ) : null}
                  {vapiAssistants.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                {initialDetails.vapi_assistant_id && !vapiAssistants.length ? (
                  <p className="text-xs text-[#64748b]">
                    Saved assistant:{" "}
                    <span className="font-mono font-medium text-[#0f172a]">{initialDetails.vapi_assistant_id}</span>
                    {initialDetails.vapi_assistant_name ? ` (${initialDetails.vapi_assistant_name})` : ""}. Refresh once
                    the platform key can list assistants.
                  </p>
                ) : null}
                <p className="text-[11px] leading-relaxed text-[#64748b]">
                  Save stores your briefing in Solvio. Use &quot;Push venue briefing to Vapi&quot; below to update the
                  live assistant, or it syncs automatically when you finish the wizard.
                </p>
              </div>

              {vapiAssistantId.trim() && (agentPromptCustom.trim() || agentFirstMessage.trim()) ? (
                <div className="space-y-2 border-t border-[#ebe7f7] pt-4">
                  <button
                    type="button"
                    disabled={merchantSyncPending}
                    className={cn(buttonVariants({ variant: "default", size: "sm" }), "rounded-full px-4 font-semibold")}
                    onClick={() => void handleSyncMerchantAssistant()}
                  >
                    {merchantSyncPending ? (
                      <>
                        <Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden />
                        Syncing venue briefing…
                      </>
                    ) : (
                      "Push venue briefing to Vapi"
                    )}
                  </button>
                  {merchantSyncMsg ? (
                    <p className="text-xs font-medium text-[#475569]" role="status">
                      {merchantSyncMsg}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </section>

            {vapiAssistantId.trim() ? (
              <section className="space-y-2 rounded-2xl border border-[#ddd6fe] bg-[#f5f3ff]/60 p-5">
                <h3 className="text-sm font-semibold text-[#4c1d95]">Homepage receptionist (marketing site)</h3>
                <p className="text-[13px] leading-relaxed text-[#5b21b6]">
                  Website visitors tap the purple microphone and speak directly to this Vapi assistant — using the
                  first message and system prompt you configured in Vapi. Set these env vars and redeploy:
                </p>
                <ul className="list-inside list-disc space-y-1 font-mono text-[11px] text-[#4c1d95]">
                  <li>NEXT_PUBLIC_VAPI_PUBLIC_KEY=your Vapi public key</li>
                  <li>NEXT_PUBLIC_VAPI_ASSISTANT_ID={vapiAssistantId.trim()}</li>
                  <li>SOLVIO_VAPI_API_KEY=your private key (loads first message preview on site)</li>
                </ul>
              </section>
            ) : null}
          </div>
        ) : null}

        {step === 5 ? (
          <div className="space-y-5">
            <h2 className="text-xl font-semibold text-[#0f172a]">Talk to your receptionist</h2>
            <p className="text-sm leading-relaxed text-[#64748b]">
              Tap the purple microphone — the same experience guests get on your homepage when Vapi keys are configured.
            </p>
            <VoiceLiveTrial
              vapiAssistantId={vapiAssistantId}
              vapiAssistantName={vapiAssistantName}
              firstMessage={agentFirstMessage}
            />
          </div>
        ) : null}

        {step === 6 ? (
          <div className="space-y-5">
            <h2 className="text-xl font-semibold text-[#0f172a]">Review & save</h2>
            <dl className="space-y-4 rounded-2xl border border-[#f1eefc] bg-[#fafbff] px-5 py-5 text-sm">
              <div>
                <dt className="font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">First thing they say</dt>
                <dd className="mt-1 text-[#475569]">{agentFirstMessage.trim() || "—"}</dd>
              </div>
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
                <dd className="mt-1 text-[#475569]">{escalationPhoneE164() ?? "—"}</dd>
              </div>
              <div>
                <dt className="font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">Voice stack</dt>
                <dd className="mt-1 space-y-1 text-[#475569]">
                  <p>
                    {vapiAssistantName.trim() ? (
                      <>
                        Vapi assistant: <span className="font-semibold text-[#0f172a]">{vapiAssistantName.trim()}</span>
                      </>
                    ) : vapiAssistantId.trim() ? (
                      <>Assistant label missing — refresh the list on step&nbsp;5 to sync the name.</>
                    ) : (
                      <>No assistant selected — choose one on step&nbsp;5.</>
                    )}
                  </p>
                  <p className="font-mono text-xs text-[#64748b]">
                    <span className="select-all text-[#0f172a]">{vapiAssistantId.trim() || "—"}</span>
                  </p>
                  <p className="text-xs text-[#64748b]">
                    What callers hear follows the assistant you selected (voice + model configured in Vapi).
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
