"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Save, Sparkles, Wand2, X } from "lucide-react";

import {
  improveCampaignPromptAction,
  judgeTestCallAction,
  upsertCampaignAction,
  type CampaignIntakeFields,
  type CampaignSaveInput,
} from "@/app/dashboard/campaigns/campaign-actions";
import { VoiceLiveTrial } from "@/components/dashboard/voice-live-trial";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  SOLVIO_SALES_AGENT_PROMPT,
  SOLVIO_SALES_FIRST_MESSAGE,
  SOLVIO_SALES_SUCCESS_CRITERIA,
} from "@/lib/campaign-prompt-builder";
import { cn } from "@/lib/utils";

type CampaignDraft = {
  campaignId?: string;
  name: string;
  agentName?: string;
  greetingStyle: "warm" | "casual" | "luxury";
  firstMessage?: string;
  systemPrompt?: string;
  successCriteria?: string;
  vapiAssistantId?: string;
  intakeFields?: CampaignIntakeFields;
};

type CampaignAgentBuilderProps = {
  businessId: string;
  businessName: string;
  initial: CampaignDraft;
};

const TONES: { id: CampaignDraft["greetingStyle"]; label: string; sample: string }[] = [
  { id: "warm", label: "Warm professional", sample: "Hi there! Hope you're having a good day." },
  { id: "casual", label: "Casual neighbourhood", sample: "Hey! Quick one if you've got a sec." },
  { id: "luxury", label: "Quiet luxury", sample: "Good afternoon. May I take a moment of your time?" },
];

export function CampaignAgentBuilder({ businessId, businessName, initial }: CampaignAgentBuilderProps) {
  const router = useRouter();
  const [campaignId, setCampaignId] = useState(initial.campaignId ?? "");
  const [vapiAssistantId, setVapiAssistantId] = useState(initial.vapiAssistantId ?? "");

  const [name, setName] = useState(initial.name ?? "");
  const [agentName, setAgentName] = useState(initial.agentName ?? "");
  const [greetingStyle, setGreetingStyle] = useState<CampaignDraft["greetingStyle"]>(initial.greetingStyle ?? "warm");
  const [firstMessage, setFirstMessage] = useState(initial.firstMessage ?? "");
  const [systemPrompt, setSystemPrompt] = useState(initial.systemPrompt ?? "");
  const [successCriteria, setSuccessCriteria] = useState(initial.successCriteria ?? "");
  const [intakeEmail, setIntakeEmail] = useState(initial.intakeFields?.email !== false);
  const [intakeAddress, setIntakeAddress] = useState(initial.intakeFields?.address === true);
  const [intakePreferences, setIntakePreferences] = useState(initial.intakeFields?.preferences !== false);
  const [verifyOwner, setVerifyOwner] = useState(initial.intakeFields?.verifyOwner !== false);

  const [pending, startTransition] = useTransition();
  const [improvePending, setImprovePending] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState<boolean | null>(null);
  const [showTestModal, setShowTestModal] = useState(false);
  const [testTranscript, setTestTranscript] = useState<string>("");
  const [testBubbleCount, setTestBubbleCount] = useState(0);
  const [judgePending, setJudgePending] = useState(false);
  const [testVerdict, setTestVerdict] = useState<{
    verdict: "success" | "fail" | "ambiguous" | "voicemail" | "no_answer";
    reasoning: string;
  } | null>(null);

  function buildIntakeFields(): CampaignIntakeFields {
    return {
      email: intakeEmail,
      address: intakeAddress,
      preferences: intakePreferences,
      verifyOwner,
    };
  }

  function applySolvioSalesTemplate() {
    setSystemPrompt(SOLVIO_SALES_AGENT_PROMPT);
    if (!firstMessage.trim()) setFirstMessage(SOLVIO_SALES_FIRST_MESSAGE);
    if (!successCriteria.trim()) setSuccessCriteria(SOLVIO_SALES_SUCCESS_CRITERIA);
    if (!agentName.trim()) setAgentName("Sam");
    setVerifyOwner(true);
    setIntakeEmail(true);
    setSaveOk(true);
    setSaveMsg("Solvio sales template loaded — review the prompt then Save & test.");
  }

  async function handleImprovePrompt() {
    setImprovePending(true);
    try {
      const res = await improveCampaignPromptAction({
        businessName,
        campaignName: name || "Campaign",
        agentName,
        draftPrompt: systemPrompt,
        successCriteria,
        intakeFields: buildIntakeFields(),
      });
      if (res.ok) {
        setSystemPrompt(res.text);
      } else {
        setSaveOk(false);
        setSaveMsg(res.message);
      }
    } finally {
      setImprovePending(false);
    }
  }

  function handleSave() {
    setSaveMsg(null);
    setSaveOk(null);

    if (name.trim().length < 2) {
      setSaveOk(false);
      setSaveMsg("Campaign name is required (at least 2 characters). Scroll up — it's the first field.");
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    startTransition(() => {
      void (async () => {
        const input: CampaignSaveInput = {
          campaignId: campaignId || undefined,
          businessId,
          businessName,
          name,
          agentName,
          greetingStyle,
          firstMessage,
          systemPrompt,
          successCriteria,
          intakeFields: buildIntakeFields(),
        };
        const res = await upsertCampaignAction(input);
        setSaveOk(res.ok);
        setSaveMsg(res.message);
        if (res.ok) {
          const wasCreate = !campaignId;
          setCampaignId(res.campaignId);
          setVapiAssistantId(res.assistantId);
          setTestTranscript("");
          setTestBubbleCount(0);
          setTestVerdict(null);
          setTimeout(() => setShowTestModal(true), 300);
          // After a fresh create, push to the edit URL so the page reflects saved state.
          if (wasCreate) {
            router.replace(`/dashboard/campaigns/${res.campaignId}`);
          }
        }
      })();
    });
  }

  const testName = agentName.trim() || name.trim() || "Your agent";

  return (
    <div className="space-y-6 pb-28">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#94a3b8]">Agent builder</p>
        <h1 className="text-2xl font-semibold tracking-tight text-[#0f172a]">
          {campaignId ? "Edit campaign" : "New campaign"}
        </h1>
        <p className="text-sm text-[#64748b]">
          Save once — Solvio creates a Vapi assistant on your behalf, then we test it together with speech bubbles.
        </p>
      </header>

      {saveMsg ? (
        <div
          role={saveOk ? "status" : "alert"}
          className={cn(
            "rounded-2xl border px-4 py-3 text-sm font-medium",
            saveOk
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-rose-200 bg-rose-50 text-rose-900",
          )}
        >
          {saveMsg}
        </div>
      ) : null}

      <section className="rounded-[24px] border border-[#ebe7f7] bg-white p-6 shadow-sm md:p-8">
        <h2 className="text-lg font-semibold text-[#0f172a]">Identity</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-sm font-medium text-[#0f172a]">Campaign name *</span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder='e.g. "Q1 lapsed customer winback"'
              className="h-11 w-full rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-4 text-[15px] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-[#0f172a]">
              Agent name <span className="font-normal text-[#94a3b8]">(optional — what the AI calls itself)</span>
            </span>
            <input
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder='e.g. "Billy" or "Sales desk"'
              className="h-11 w-full rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-4 text-[15px] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
            />
          </label>
        </div>
        <div className="mt-5 space-y-2">
          <span className="text-sm font-medium text-[#0f172a]">Tone</span>
          <div className="flex flex-wrap gap-2">
            {TONES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setGreetingStyle(t.id)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm font-medium transition",
                  greetingStyle === t.id
                    ? "border-[#7c3aed] bg-[#f5f3ff] text-[#5b21b6]"
                    : "border-[#ebe7f7] bg-white text-[#64748b] hover:border-[#c4b5fd]",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <p className="text-[12px] italic text-[#94a3b8]">
            Sample: &ldquo;{TONES.find((t) => t.id === greetingStyle)?.sample}&rdquo;
          </p>
        </div>
      </section>

      <section className="rounded-[24px] border border-[#ebe7f7] bg-white p-6 shadow-sm md:p-8">
        <h2 className="text-lg font-semibold text-[#0f172a]">What the agent does</h2>
        <div className="mt-5 space-y-5">
          <label className="block space-y-1">
            <span className="text-sm font-medium text-[#0f172a]">Opening line (what they hear first)</span>
            <input
              value={firstMessage}
              onChange={(e) => setFirstMessage(e.target.value)}
              placeholder={`Hi, this is ${agentName || "Billy"} calling from ${businessName}. Have you got a minute?`}
              className="h-11 w-full rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-4 text-[15px] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-[#0f172a]">
              Success criteria <span className="font-normal text-[#94a3b8]">— what counts as a winning call?</span>
            </span>
            <textarea
              value={successCriteria}
              onChange={(e) => setSuccessCriteria(e.target.value)}
              rows={3}
              placeholder="e.g. They agreed to a 15-min demo on a specific date and gave us their email."
              className="w-full rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-4 py-3 text-[15px] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
            />
          </label>
          <div className="space-y-1">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <span className="text-sm font-medium text-[#0f172a]">
                System prompt <span className="font-normal text-[#94a3b8]">— full instructions to the AI</span>
              </span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={applySolvioSalesTemplate}
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "rounded-full text-xs font-semibold text-[#0f172a]",
                  )}
                  title="Load the pre-built Solvio sales agent — verifies owner, qualifies, closes for free trial"
                >
                  <Wand2 className="mr-1.5 inline h-3.5 w-3.5" aria-hidden />
                  Use Solvio sales template
                </button>
                <button
                  type="button"
                  onClick={handleImprovePrompt}
                  disabled={improvePending || !name.trim()}
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "rounded-full text-xs font-semibold text-[#5b21b6]",
                  )}
                >
                  {improvePending ? (
                    <>
                      <Loader2 className="mr-1.5 inline h-3.5 w-3.5 animate-spin" aria-hidden />
                      Drafting…
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-1.5 inline h-3.5 w-3.5" aria-hidden />
                      {systemPrompt.trim() ? "Refine with ChatGPT" : "Draft with ChatGPT"}
                    </>
                  )}
                </button>
              </div>
            </div>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={10}
              placeholder='You are Billy, a sales rep for Billy and Jo Co. You call businesses to introduce our service and gather their decision-maker info. Be friendly, brief, and confirm next steps. Never pressure.'
              className="w-full rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-4 py-3 font-mono text-[13px] leading-relaxed outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
            />
            <p className="text-[12px] text-[#64748b]">
              Tip: include who they are, what they want from the call, and how to end it.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-[24px] border border-[#ebe7f7] bg-white p-6 shadow-sm md:p-8">
        <h2 className="text-lg font-semibold text-[#0f172a]">What to capture on each call</h2>
        <p className="mt-1 text-sm text-[#64748b]">
          The AI will always confirm the contact&apos;s name and gauge interest level. Toggle additional fields below.
          Captured data is enriched automatically after every call and available in your leads export.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {/* Verify owner toggle (default ON for B2B/sales campaigns) */}
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#ddd6fe] bg-[#faf7ff] p-3 hover:border-[#a78bfa] sm:col-span-2">
            <input
              type="checkbox"
              checked={verifyOwner}
              onChange={(e) => setVerifyOwner(e.target.checked)}
              className="mt-0.5 h-4 w-4 flex-shrink-0 accent-[#7c3aed]"
            />
            <div>
              <p className="text-sm font-semibold text-[#0f172a]">
                Verify business owner / decision-maker{" "}
                <span className="ml-1 inline-flex rounded-full bg-violet-100 px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wider text-violet-800">
                  Recommended for B2B
                </span>
              </p>
              <p className="text-xs text-[#64748b]">
                Agent confirms it&apos;s speaking to the owner first. If it&apos;s a gatekeeper, it politely captures the
                owner&apos;s name, phone, email and best time — instead of pitching the wrong person.
              </p>
            </div>
          </label>
          {/* Name is always on */}
          <div className="flex items-start gap-3 rounded-xl border border-[#ebe7f7] bg-[#fafbff] p-3">
            <div className="mt-0.5 h-4 w-4 flex-shrink-0 rounded bg-[#7c3aed]" aria-hidden />
            <div>
              <p className="text-sm font-semibold text-[#0f172a]">Name (always on)</p>
              <p className="text-xs text-[#64748b]">The agent confirms the contact&apos;s name and corrects any errors.</p>
            </div>
          </div>
          {/* Interest level is always on */}
          <div className="flex items-start gap-3 rounded-xl border border-[#ebe7f7] bg-[#fafbff] p-3">
            <div className="mt-0.5 h-4 w-4 flex-shrink-0 rounded bg-[#7c3aed]" aria-hidden />
            <div>
              <p className="text-sm font-semibold text-[#0f172a]">Interest level (always on)</p>
              <p className="text-xs text-[#64748b]">Hot · Warm · Cold · Not interested — scored after each call.</p>
            </div>
          </div>
          {/* Email toggle */}
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#ebe7f7] bg-white p-3 hover:border-[#c4b5fd]">
            <input
              type="checkbox"
              checked={intakeEmail}
              onChange={(e) => setIntakeEmail(e.target.checked)}
              className="mt-0.5 h-4 w-4 flex-shrink-0 accent-[#7c3aed]"
            />
            <div>
              <p className="text-sm font-semibold text-[#0f172a]">Email address</p>
              <p className="text-xs text-[#64748b]">
                &ldquo;Could I take an email so we can send you the details?&rdquo;
              </p>
            </div>
          </label>
          {/* Address toggle */}
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#ebe7f7] bg-white p-3 hover:border-[#c4b5fd]">
            <input
              type="checkbox"
              checked={intakeAddress}
              onChange={(e) => setIntakeAddress(e.target.checked)}
              className="mt-0.5 h-4 w-4 flex-shrink-0 accent-[#7c3aed]"
            />
            <div>
              <p className="text-sm font-semibold text-[#0f172a]">Address / postcode</p>
              <p className="text-xs text-[#64748b]">Useful for local targeting, delivery, or events. Only ask if relevant.</p>
            </div>
          </label>
          {/* Preferences toggle */}
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#ebe7f7] bg-white p-3 hover:border-[#c4b5fd]">
            <input
              type="checkbox"
              checked={intakePreferences}
              onChange={(e) => setIntakePreferences(e.target.checked)}
              className="mt-0.5 h-4 w-4 flex-shrink-0 accent-[#7c3aed]"
            />
            <div>
              <p className="text-sm font-semibold text-[#0f172a]">Preferences & notes</p>
              <p className="text-xs text-[#64748b]">Preferred times, occasion, party size, anything else useful for follow-up.</p>
            </div>
          </label>
        </div>
        <p className="mt-4 text-xs text-[#94a3b8]">
          All captured data is exported in the leads CSV. Hot and warm leads are highlighted at the top of your list.
        </p>
      </section>

      <div className="fixed bottom-16 left-0 right-0 z-30 border-t border-[#ebe7f7]/90 bg-white/95 px-4 py-4 backdrop-blur-xl md:bottom-0 md:pl-64">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-h-[1.25rem] text-sm">
            {saveMsg ? (
              <p className={saveOk ? "font-medium text-emerald-700" : "font-medium text-rose-700"} role="status">
                {saveMsg}
              </p>
            ) : (
              <p className="text-[#64748b]">Save → test → tweak the prompt → save again.</p>
            )}
          </div>
          <div className="flex gap-2">
            {vapiAssistantId ? (
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setShowTestModal(true)}
                className="h-12 rounded-full px-6 font-semibold"
              >
                <Sparkles className="mr-2 inline h-4 w-4" aria-hidden />
                Test live
              </Button>
            ) : null}
            <Button
              type="button"
              disabled={pending}
              onClick={handleSave}
              size="lg"
              className="h-12 rounded-full px-8 font-semibold shadow-lg shadow-[#7c3aed]/20"
            >
              {pending ? (
                <>
                  <Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden />
                  Saving…
                </>
              ) : (
                <>
                  <Save className="mr-2 inline h-4 w-4" aria-hidden />
                  {campaignId ? "Save changes" : "Save & test"}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showTestModal ? (
          <motion.div
            key="campaign-test-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={() => setShowTestModal(false)}
            className="fixed inset-0 z-50 flex items-end justify-center bg-gradient-to-b from-[#0f172a]/40 via-[#0f172a]/60 to-[#0f172a]/80 px-4 pb-8 pt-12 backdrop-blur-md md:items-center md:p-8"
          >
            <motion.div
              key="campaign-test-card"
              initial={{ y: 80, opacity: 0, scale: 0.96 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 60, opacity: 0, scale: 0.97 }}
              transition={{ type: "spring", damping: 22, stiffness: 280 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-2xl overflow-hidden rounded-[28px] border border-[#ebe7f7]/90 bg-white shadow-[0_40px_120px_-30px_rgba(124,58,237,0.5)]"
            >
              <button
                type="button"
                onClick={() => setShowTestModal(false)}
                aria-label="Close"
                className="absolute right-4 top-4 z-10 rounded-full bg-white/90 p-2 text-[#64748b] shadow-sm ring-1 ring-[#ebe7f7] backdrop-blur-sm hover:text-[#0f172a]"
              >
                <X className="h-4 w-4" />
              </button>
              <div className="bg-gradient-to-br from-[#faf7ff] via-white to-[#fafbff] px-6 py-6 md:px-10 md:py-8">
                <span className="inline-flex items-center gap-2 rounded-full bg-[#ede9fe] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#5b21b6]">
                  <Sparkles className="h-3 w-3" aria-hidden />
                  Test call
                </span>
                <h2 className="mt-2 text-xl font-semibold tracking-tight text-[#0f172a] md:text-2xl">
                  Try {testName} on yourself first
                </h2>
                <p className="mt-1 max-w-md text-sm leading-relaxed text-[#64748b]">
                  Tap the purple mic and roleplay as the prospect. Watch the speech bubbles fly — if it sounds wrong,
                  close this, refine the prompt, save again.
                </p>
                <div className="mt-6">
                  <VoiceLiveTrial
                    vapiAssistantId={vapiAssistantId}
                    vapiAssistantName={testName}
                    firstMessage={firstMessage}
                    onBubblesChange={(bs) => setTestBubbleCount(bs.length)}
                    onCallEnded={(transcript) => {
                      setTestTranscript(transcript);
                      setTestVerdict(null);
                    }}
                  />
                </div>

                {testTranscript && !testVerdict ? (
                  <div className="mt-4 rounded-2xl border border-[#ddd6fe] bg-[#faf7ff] px-4 py-3">
                    <p className="text-sm font-semibold text-[#0f172a]">
                      Call ended — want me to score it against your success criteria?
                    </p>
                    <p className="mt-1 text-xs text-[#64748b]">
                      I&apos;ll judge the transcript with GPT and tell you if the agent did what you told it to.
                    </p>
                    <Button
                      type="button"
                      disabled={judgePending}
                      onClick={() => {
                        setJudgePending(true);
                        void judgeTestCallAction({ campaignId, transcript: testTranscript })
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
                        ? "✅ Success"
                        : testVerdict.verdict === "fail"
                          ? "❌ Fail"
                          : testVerdict.verdict === "ambiguous"
                            ? "🤔 Ambiguous"
                            : testVerdict.verdict === "voicemail"
                              ? "📭 Voicemail"
                              : "📵 No answer";
                    return (
                      <div className={cn("mt-4 rounded-2xl border px-4 py-3", tone)}>
                        <p className="text-sm font-semibold">{label}</p>
                        <p className="mt-1 text-sm">{testVerdict.reasoning}</p>
                        <p className="mt-2 text-[12px]">
                          {testVerdict.verdict === "success"
                            ? "Looks good — you're ready to add real leads."
                            : "Refine the system prompt or success criteria above, save again, and re-test."}
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

                <p className="mt-5 text-[12px] text-[#64748b]">
                  This is a test only — no credits deducted, no leads dialled. Real outbound starts once you add leads in
                  the next step.
                </p>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
