"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Mic, MicOff, Sparkles } from "lucide-react";

import {
  extractReceptionistFromBriefAction,
  type ExtractedReceptionistFields,
} from "@/app/dashboard/setup/voice-prompt-actions";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Minimal Web Speech API typings — TS doesn't ship these in the default DOM lib.
type SpeechRecognitionResult = {
  isFinal: boolean;
  0?: { transcript: string };
};
type SpeechRecognitionEvent = {
  resultIndex: number;
  results: { length: number; [index: number]: SpeechRecognitionResult };
};
type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

type ReceptionistBriefPanelProps = {
  businessId: string;
  businessName: string;
  /** Called when the AI extracts structured fields. Parent should populate form state + markDirty. */
  onApply: (fields: ExtractedReceptionistFields) => void;
};

export function ReceptionistBriefPanel({ businessName, onApply }: ReceptionistBriefPanelProps) {
  const [brief, setBrief] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const [speechSupported, setSpeechSupported] = useState(false);

  useEffect(() => {
    setSpeechSupported(getSpeechRecognitionCtor() !== null);
  }, []);

  function startListening() {
    setError(null);
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setError("Your browser doesn't support voice dictation — type it instead, or use Chrome.");
      return;
    }
    try {
      const rec = new Ctor();
      rec.continuous = true;
      rec.interimResults = false;
      rec.lang = "en-GB";
      rec.onresult = (event) => {
        let appended = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const r = event.results[i];
          if (r?.isFinal) {
            appended += (r[0]?.transcript ?? "") + " ";
          }
        }
        if (appended.trim()) {
          setBrief((prev) => (prev ? `${prev.trim()} ${appended.trim()}` : appended.trim()));
        }
      };
      rec.onerror = (event) => {
        setError(`Mic error: ${event.error ?? "unknown"}. Type instead, or check microphone permissions.`);
        setIsListening(false);
      };
      rec.onend = () => setIsListening(false);
      rec.start();
      recognitionRef.current = rec;
      setIsListening(true);
    } catch {
      setError("Couldn't start the microphone — type instead, or check permissions.");
    }
  }

  function stopListening() {
    try {
      recognitionRef.current?.stop();
    } catch {
      /* ignore */
    }
    setIsListening(false);
  }

  function handleGenerate() {
    setError(null);
    setSuccess(null);
    if (!brief.trim()) {
      setError("Add a brief first — or tap the mic and just talk.");
      return;
    }
    startTransition(() => {
      void extractReceptionistFromBriefAction({ businessName, brief: brief.trim() }).then((res) => {
        if (res.ok) {
          onApply(res.fields);
          const filledCount = Object.values(res.fields).filter(Boolean).length;
          setSuccess(`Filled in ${filledCount} field${filledCount === 1 ? "" : "s"} below — review and tweak before saving.`);
        } else {
          setError(res.message);
        }
      });
    });
  }

  return (
    <section className="rounded-[22px] border border-[#ddd6fe] bg-gradient-to-br from-[#faf7ff] via-white to-[#fafbff] p-6 shadow-sm md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="inline-flex items-center gap-2 rounded-full bg-[#ede9fe] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#5b21b6]">
            <Sparkles className="h-3 w-3" aria-hidden />
            Quick start
          </p>
          <h2 className="text-lg font-semibold text-[#0f172a]">Tell us roughly about your business</h2>
          <p className="max-w-2xl text-sm leading-relaxed text-[#64748b]">
            Type or just talk — anything that helps the receptionist understand your venue and what calls they should
            handle. We&apos;ll generate a polished prompt and fill in the form below. You can still edit everything.
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        <div className="relative">
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            disabled={pending}
            rows={5}
            placeholder="e.g. We take bookings Tuesday through Saturday, my name is Billy at Princess Diner, parties up to 8, no walk-ins after 9pm, sometimes we host live music on Fridays — calls should grab name, party size, date and time."
            className="w-full rounded-2xl border border-[#ebe7f7] bg-white px-4 py-3 text-[15px] leading-relaxed text-[#0f172a] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25 disabled:opacity-60"
          />
          {isListening ? (
            <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-1 text-[11px] font-semibold text-rose-900">
              <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" />
              Listening
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {speechSupported ? (
            <button
              type="button"
              disabled={pending}
              onClick={isListening ? stopListening : startListening}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "rounded-full font-semibold",
                isListening ? "border-rose-200 text-rose-700" : "border-[#ebe7f7]",
              )}
            >
              {isListening ? (
                <>
                  <MicOff className="mr-1.5 inline h-4 w-4" aria-hidden />
                  Stop
                </>
              ) : (
                <>
                  <Mic className="mr-1.5 inline h-4 w-4" aria-hidden />
                  Speak
                </>
              )}
            </button>
          ) : null}
          <button
            type="button"
            disabled={pending || !brief.trim()}
            onClick={handleGenerate}
            className={cn(
              buttonVariants({ variant: "default", size: "sm" }),
              "rounded-full font-semibold shadow-md shadow-[#7c3aed]/20",
            )}
          >
            {pending ? (
              <>
                <Loader2 className="mr-1.5 inline h-4 w-4 animate-spin" aria-hidden />
                Generating…
              </>
            ) : (
              <>
                <Sparkles className="mr-1.5 inline h-4 w-4" aria-hidden />
                Generate &amp; fill form
              </>
            )}
          </button>
          {brief.trim() ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setBrief("");
                setError(null);
                setSuccess(null);
              }}
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "rounded-full text-[#64748b]")}
            >
              Clear
            </button>
          ) : null}
        </div>

        {error ? (
          <p className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-900">{error}</p>
        ) : null}
        {success ? (
          <p className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            {success}
          </p>
        ) : null}
      </div>
    </section>
  );
}
